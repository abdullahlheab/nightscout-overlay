'use strict';
// Decides when to alert. Pure state machine; no Electron here so it is easy to test.
//
// Rules:
//  - A new condition (low, high, urgent low/high, stale data) shows the alert bar and chimes once.
//  - While it stays un-acknowledged it re-chimes every `repeatMinutes` (bar stays visible).
//  - "I see it" hides the bar and snoozes that condition for `snoozeMinutes`.
//    Escalation (low -> urgent low) is a different condition, so it alerts through a snooze.
//  - When the reading is back in range everything resets.

const LABELS = {
  'urgent-low': 'URGENT LOW',
  'low': 'Low',
  'high': 'High',
  'urgent-high': 'URGENT HIGH',
  'stale': 'No data'
};

const state = {
  active: null,     // { type, since, lastChime }
  snoozed: {}       // type -> timestamp until which it is silenced
};

function soundFor(type) {
  if (type === 'urgent-low' || type === 'urgent-high') return 'urgent';
  if (type === 'stale') return 'stale';
  return 'warn';
}

function typeFor(payload, a) {
  if (!payload || payload.display === undefined) return null; // no data at all (first run / error)
  switch (payload.state) {
    case 'urgent-low': return a.urgent ? 'urgent-low' : (a.low ? 'low' : null);
    case 'low': return a.low ? 'low' : null;
    case 'high': return a.high ? 'high' : null;
    case 'urgent-high': return a.urgent ? 'urgent-high' : (a.high ? 'high' : null);
    case 'stale': return a.stale ? 'stale' : null;
    default: return null;
  }
}

function messageFor(type, payload) {
  // short on purpose: it shares one narrow row with the I see it button; units are shown above anyway
  if (type === 'stale') return 'No data ' + payload.ageMin + ' min';
  return LABELS[type] + ' ' + payload.display;
}

// Quiet hours: chimes are suppressed, the bar still shows. Handles ranges that cross midnight.
function inQuietHours(a, now) {
  if (!a.quietEnabled) return false;
  const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (Number(m[1]) % 24) * 60 + Number(m[2]) % 60 : null; };
  const from = toMin(a.quietFrom), to = toMin(a.quietTo);
  if (from === null || to === null || from === to) return false;
  const d = new Date(now); const cur = d.getHours() * 60 + d.getMinutes();
  return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}

// Returns { show: alert | null } where alert = { type, message, sound|null, volume }.
// `sound` is set only when a chime should play right now.
function evaluate(payload, cfg, now = Date.now()) {
  const a = cfg.alerts || {};
  if (!a.enabled) { state.active = null; return { show: null }; }

  const type = typeFor(payload, a);
  if (!type) {
    state.active = null;
    state.snoozed = {};
    return { show: null };
  }

  const until = state.snoozed[type];
  if (until && now < until) {
    state.active = null;
    return { show: null };
  }

  const repeatMs = Math.max(1, Number(a.repeatMinutes) || 10) * 60000;
  const base = { type, message: messageFor(type, payload), volume: Number(a.volume) };

  const chime = inQuietHours(a, now) ? null : soundFor(type);

  if (state.active && state.active.type === type) {
    if (now - state.active.lastChime >= repeatMs) {
      state.active.lastChime = now;
      return { show: { ...base, sound: chime } };
    }
    return { show: { ...base, sound: null } };
  }

  state.active = { type, since: now, lastChime: now };
  return { show: { ...base, sound: chime } };
}

// "I see it": hide and snooze the current condition.
function acknowledge(cfg, now = Date.now()) {
  const a = cfg.alerts || {};
  if (state.active) {
    const snoozeMs = Math.max(1, Number(a.snoozeMinutes) || 30) * 60000;
    state.snoozed[state.active.type] = now + snoozeMs;
  }
  state.active = null;
}

function reset() { state.active = null; state.snoozed = {}; }

// A fake alert for the Test buttons in Settings. Looks like the real thing, ignores quiet hours.
const SAMPLES = { 'urgent-low': 52, low: 68, high: 215, 'urgent-high': 290, stale: null };
function testAlert(kind, units) {
  const type = Object.prototype.hasOwnProperty.call(SAMPLES, kind) ? kind : 'low';
  const mgdl = SAMPLES[type];
  const shown = mgdl === null ? null : (units === 'mmol' ? (mgdl / 18.0182).toFixed(1) : String(mgdl));
  const payload = type === 'stale' ? { ageMin: 25 } : { display: shown, units };
  return { type: 'test', testState: type, message: messageFor(type, payload), sound: soundFor(type) };
}

module.exports = { evaluate, acknowledge, reset, testAlert, inQuietHours, LABELS, soundFor };
