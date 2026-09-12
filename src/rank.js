'use strict';
// MMR-style rating for glucose control over the last few days, placed on the Rocket League ladder.
//
//   base   : time in range maps onto the MMR scale (Silver I at `floor` % TIR, Supersonic Legend at `top` %)
//   lows   : minus 8 MMR per % of readings below target beyond 4 %
//   very lows: minus 20 MMR per % of readings below the urgent-low line beyond 1 %
//   spikes : minus 4 MMR per % of readings above the urgent-high line beyond 5 %
//   steady : up to +40 MMR when glucose variability (CV) is under 36 %
//
// Pure module, no Electron, easy to test.

const LADDER = [
  { key: 'bronze-1', name: 'Bronze I', mmr: 0 }, { key: 'bronze-2', name: 'Bronze II', mmr: 55 }, { key: 'bronze-3', name: 'Bronze III', mmr: 115 },
  { key: 'silver-1', name: 'Silver I', mmr: 175 }, { key: 'silver-2', name: 'Silver II', mmr: 235 }, { key: 'silver-3', name: 'Silver III', mmr: 295 },
  { key: 'gold-1', name: 'Gold I', mmr: 355 }, { key: 'gold-2', name: 'Gold II', mmr: 435 }, { key: 'gold-3', name: 'Gold III', mmr: 515 },
  { key: 'platinum-1', name: 'Platinum I', mmr: 595 }, { key: 'platinum-2', name: 'Platinum II', mmr: 675 }, { key: 'platinum-3', name: 'Platinum III', mmr: 755 },
  { key: 'diamond-1', name: 'Diamond I', mmr: 835 }, { key: 'diamond-2', name: 'Diamond II', mmr: 915 }, { key: 'diamond-3', name: 'Diamond III', mmr: 995 },
  { key: 'champion-1', name: 'Champion I', mmr: 1075 }, { key: 'champion-2', name: 'Champion II', mmr: 1195 }, { key: 'champion-3', name: 'Champion III', mmr: 1315 },
  { key: 'grand-champion-1', name: 'Grand Champion I', mmr: 1435 }, { key: 'grand-champion-2', name: 'Grand Champion II', mmr: 1575 }, { key: 'grand-champion-3', name: 'Grand Champion III', mmr: 1715 },
  { key: 'supersonic-legend', name: 'Supersonic Legend', mmr: 1861 }
];
const SILVER_MMR = 175;
const SSL_MMR = 1861;
const MAX_MMR = 2100;

const DEFAULTS = { floor: 45, top: 97 };   // TIR % for Silver I and for Supersonic Legend
const DAYS = 3;
const MIN_READINGS = 60;                   // about 5 hours of CGM data; below this you are unranked

const WEIGHTS = { low: 8, lowFree: 4, veryLow: 20, veryLowFree: 1, spike: 4, spikeFree: 5, steadyCv: 36, steadyPerPoint: 4, steadyMax: 40 };

function clampNum(v, fallback, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
const r1 = (v) => Math.round(v * 10) / 10;
const pct = (n, d) => (d ? r1((100 * n) / d) : 0);

// Per-window and per-day numbers from raw entries [{ sgv, date }].
function computeStats(entries, thresholds) {
  const th = { bgLow: 55, bgTargetBottom: 80, bgTargetTop: 180, bgHigh: 260, ...(thresholds || {}) };
  const vals = (entries || []).filter(e => Number.isFinite(e.sgv) && e.sgv > 0);
  const n = vals.length;
  const count = (f) => vals.filter(f).length;
  const summarize = (list) => {
    const m = list.length;
    if (!m) return { readings: 0, tir: null, low: null, veryLow: null, high: null, veryHigh: null, mean: null, min: null, max: null, cv: null };
    const s = list.map(e => e.sgv);
    const mean = s.reduce((a, b) => a + b, 0) / m;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) * (b - mean), 0) / m);
    return {
      readings: m,
      tir: pct(list.filter(e => e.sgv >= th.bgTargetBottom && e.sgv <= th.bgTargetTop).length, m),
      low: pct(list.filter(e => e.sgv < th.bgTargetBottom).length, m),
      veryLow: pct(list.filter(e => e.sgv < th.bgLow).length, m),
      high: pct(list.filter(e => e.sgv > th.bgTargetTop).length, m),
      veryHigh: pct(list.filter(e => e.sgv > th.bgHigh).length, m),
      mean: Math.round(mean), min: Math.min(...s), max: Math.max(...s),
      cv: r1((100 * sd) / mean)
    };
  };
  // calendar days, local time, oldest first
  const byDay = new Map();
  for (const e of vals) {
    const d = new Date(e.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, list]) => ({ date, ...summarize(list) }));
  return { ...summarize(vals), readings: n, thresholds: th, days, lowCount: count(e => e.sgv < th.bgTargetBottom) };
}

// MMR from window stats. Returns the total and each part so a change can be explained.
function mmrFrom(stats, opts) {
  const floor = clampNum(opts && opts.floor, DEFAULTS.floor, 1, 99);
  const top = clampNum(opts && opts.top, DEFAULTS.top, floor + 1, 100);
  const tir = stats.tir || 0;
  let base;
  if (tir >= floor) base = SILVER_MMR + ((tir - floor) / (top - floor)) * (SSL_MMR - SILVER_MMR);
  else base = Math.max(0, (SILVER_MMR * (tir - (floor - 15))) / 15);
  const lows = -WEIGHTS.low * Math.max(0, (stats.low || 0) - WEIGHTS.lowFree);
  const veryLows = -WEIGHTS.veryLow * Math.max(0, (stats.veryLow || 0) - WEIGHTS.veryLowFree);
  const spikes = -WEIGHTS.spike * Math.max(0, (stats.veryHigh || 0) - WEIGHTS.spikeFree);
  const steady = stats.cv === null ? 0 : Math.min(WEIGHTS.steadyMax, Math.max(0, (WEIGHTS.steadyCv - stats.cv) * WEIGHTS.steadyPerPoint));
  const parts = { base: Math.round(base), lows: Math.round(lows), veryLows: Math.round(veryLows), spikes: Math.round(spikes), steady: Math.round(steady) };
  const mmr = Math.max(0, Math.min(MAX_MMR, parts.base + parts.lows + parts.veryLows + parts.spikes + parts.steady));
  return { mmr, parts };
}

function rankForMmr(mmr) {
  let idx = 0;
  for (let i = 1; i < LADDER.length; i++) if (mmr >= LADDER[i].mmr) idx = i;
  const r = LADDER[idx];
  const nextR = LADDER[idx + 1] || null;
  return {
    key: r.key, name: r.name, file: r.key, index: idx,
    floorMmr: r.mmr,
    next: nextR ? { name: nextR.name, mmr: nextR.mmr, needed: nextR.mmr - mmr } : null,
    // progress through the current band, 0..1 (Supersonic Legend measures towards MAX_MMR)
    progress: Math.max(0, Math.min(1, (mmr - r.mmr) / ((nextR ? nextR.mmr : MAX_MMR) - r.mmr)))
  };
}

function computeRank(entries, thresholds, opts) {
  const stats = computeStats(entries, thresholds);
  if (stats.readings < MIN_READINGS) {
    return { key: null, name: 'Unranked', file: null, index: -1, mmr: null, parts: null, next: null, progress: 0, stats, readings: stats.readings, days: DAYS };
  }
  const { mmr, parts } = mmrFrom(stats, opts);
  return { ...rankForMmr(mmr), mmr, parts, stats, readings: stats.readings, days: DAYS };
}

function label(r) { return r && r.key ? r.name : 'Unranked'; }

// A made-up rank for the Preview picker in Settings: middle of that rank's band.
function sample(key) {
  const idx = Math.max(0, LADDER.findIndex(r => r.key === key));
  const lo = LADDER[idx].mmr, hi = LADDER[idx + 1] ? LADDER[idx + 1].mmr : MAX_MMR;
  const mmr = Math.round((lo + hi) / 2);
  return { ...rankForMmr(mmr), mmr, parts: null, stats: null, readings: 864, days: DAYS, preview: true, delta24h: 12 };
}

module.exports = { LADDER, DEFAULTS, DAYS, MIN_READINGS, MAX_MMR, WEIGHTS, computeStats, mmrFrom, rankForMmr, computeRank, label, sample };
