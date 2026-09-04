'use strict';
// Talks to the Nightscout REST API (v1) and turns raw entries into what the overlay shows.

const MGDL_PER_MMOL = 18.0182;
const FALLBACK_THRESHOLDS = { bgLow: 55, bgTargetBottom: 80, bgTargetTop: 180, bgHigh: 260 };

const ARROWS = {
  DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→',
  FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊',
  'NOT COMPUTABLE': '?', 'RATE OUT OF RANGE': '⇕', NONE: ''
};

function baseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function withToken(url, token) {
  if (!token) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token.trim());
}

async function getJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) throw new Error('Unauthorized. Check your token.');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchStatus(cfg) {
  const base = baseUrl(cfg.url);
  return getJson(withToken(base + '/api/v1/status.json', cfg.token));
}

async function fetchEntries(cfg) {
  const base = baseUrl(cfg.url);
  const count = Math.max(24, Math.ceil((cfg.historyHours || 3) * 12) + 2);
  const entries = await getJson(withToken(base + '/api/v1/entries/sgv.json?count=' + count, cfg.token));
  if (!Array.isArray(entries)) throw new Error('Unexpected response from Nightscout');
  return entries
    .filter(e => typeof e.sgv === 'number' && e.sgv > 0)
    .map(e => ({ sgv: e.sgv, date: e.date || Date.parse(e.dateString), direction: e.direction || 'NONE' }))
    .sort((a, b) => b.date - a.date);
}

function resolveThresholds(cfg, status) {
  const server = (status && status.settings && status.settings.thresholds) || {};
  const out = {};
  for (const k of Object.keys(FALLBACK_THRESHOLDS)) {
    const custom = cfg.thresholds && cfg.thresholds[k];
    out[k] = (typeof custom === 'number' && custom > 0) ? custom
      : (typeof server[k] === 'number' ? server[k] : FALLBACK_THRESHOLDS[k]);
  }
  return out;
}

function resolveUnits(cfg, status) {
  if (cfg.units === 'mmol' || cfg.units === 'mg/dl') return cfg.units;
  const u = status && status.settings && status.settings.units;
  return (u && /mmol/i.test(u)) ? 'mmol' : 'mg/dl';
}

function fmt(mgdl, units, withSign = false) {
  let v, s;
  if (units === 'mmol') { v = mgdl / MGDL_PER_MMOL; s = v.toFixed(1); }
  else { v = Math.round(mgdl); s = String(v); }
  if (withSign && v >= 0) s = '+' + s;
  return s;
}

function classify(sgv, th, ageMin, staleMinutes) {
  if (ageMin >= staleMinutes) return 'stale';
  if (sgv <= th.bgLow) return 'urgent-low';
  if (sgv < th.bgTargetBottom) return 'low';
  if (sgv >= th.bgHigh) return 'urgent-high';
  if (sgv > th.bgTargetTop) return 'high';
  return 'in-range';
}

// Builds the payload the overlay renders. Pure; safe to unit-test.
function buildPayload(entries, status, cfg, now = Date.now()) {
  const units = resolveUnits(cfg, status);
  const thresholds = resolveThresholds(cfg, status);
  if (!entries.length) return { error: 'No readings yet', units, thresholds, history: [] };

  const latest = entries[0];
  const prev = entries[1];
  const ageMin = Math.max(0, Math.round((now - latest.date) / 60000));
  const delta = prev ? latest.sgv - prev.sgv : null;
  const cutoff = now - (cfg.historyHours || 3) * 3600000;

  return {
    sgv: latest.sgv,
    display: fmt(latest.sgv, units),
    units,
    direction: latest.direction,
    arrow: ARROWS[latest.direction] ?? '',
    delta,
    deltaDisplay: delta === null ? '' : fmt(delta, units, true),
    ageMin,
    state: classify(latest.sgv, thresholds, ageMin, cfg.staleMinutes || 15),
    thresholds,
    history: entries.filter(e => e.date >= cutoff).map(e => ({ t: e.date, sgv: e.sgv })).reverse(),
    fetchedAt: now
  };
}

async function fetchPayload(cfg, cachedStatus) {
  let status = cachedStatus;
  if (!status) {
    try { status = await fetchStatus(cfg); } catch { status = null; }
  }
  const entries = await fetchEntries(cfg);
  return { payload: buildPayload(entries, status, cfg), status };
}

async function testConnection(cfg) {
  const status = await fetchStatus(cfg);
  const entries = await fetchEntries(cfg);
  const p = buildPayload(entries, status, cfg);
  return {
    ok: true,
    name: (status.settings && status.settings.customTitle) || status.name || 'Nightscout',
    version: status.version,
    units: p.units,
    latest: p.error ? null : `${p.display} ${p.units} ${p.arrow} (${p.ageMin} min ago)`
  };
}

module.exports = { fetchPayload, testConnection, buildPayload, ARROWS, MGDL_PER_MMOL };
