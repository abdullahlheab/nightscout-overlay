'use strict';
// Rocket League style rank for glucose control. Time in range over the last few days maps onto the
// game's ladder: Bronze I ... Champion III, Grand Champion, Supersonic Legend (20 ranks).
// Two numbers shape the whole ladder: where Silver I starts and where Supersonic Legend starts;
// the ranks in between are spread evenly. Pure module, no Electron, easy to test.

const LADDER = [
  { key: 'bronze-1', name: 'Bronze I' }, { key: 'bronze-2', name: 'Bronze II' }, { key: 'bronze-3', name: 'Bronze III' },
  { key: 'silver-1', name: 'Silver I' }, { key: 'silver-2', name: 'Silver II' }, { key: 'silver-3', name: 'Silver III' },
  { key: 'gold-1', name: 'Gold I' }, { key: 'gold-2', name: 'Gold II' }, { key: 'gold-3', name: 'Gold III' },
  { key: 'platinum-1', name: 'Platinum I' }, { key: 'platinum-2', name: 'Platinum II' }, { key: 'platinum-3', name: 'Platinum III' },
  { key: 'diamond-1', name: 'Diamond I' }, { key: 'diamond-2', name: 'Diamond II' }, { key: 'diamond-3', name: 'Diamond III' },
  { key: 'champion-1', name: 'Champion I' }, { key: 'champion-2', name: 'Champion II' }, { key: 'champion-3', name: 'Champion III' },
  { key: 'grand-champion', name: 'Grand Champion' },
  { key: 'supersonic-legend', name: 'Supersonic Legend' }
];
const SILVER_INDEX = 3;                 // first rank of the evenly spread section
const SSL_INDEX = LADDER.length - 1;

const DEFAULTS = { floor: 45, top: 97 };   // Silver I from 45% time in range, Supersonic Legend from 97%
const DAYS = 3;
const MIN_READINGS = 60;                   // about 5 hours of CGM data; below this you are unranked

// Minimum time-in-range % for each rank on the ladder.
function cutoffs(opts) {
  const floor = clampNum(opts && opts.floor, DEFAULTS.floor, 1, 99);
  const top = clampNum(opts && opts.top, DEFAULTS.top, floor + 1, 100);
  const steps = SSL_INDEX - SILVER_INDEX;             // 16 gaps from Silver I to Supersonic Legend
  const step = (top - floor) / steps;
  return LADDER.map((_, i) => {
    if (i === 0) return -Infinity;
    if (i === 1) return floor - 10;                   // Bronze II
    if (i === 2) return floor - 5;                    // Bronze III
    return Math.round((floor + (i - SILVER_INDEX) * step) * 10) / 10;
  });
}

function clampNum(v, fallback, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function describe(index, tir, cuts) {
  const r = LADDER[index];
  const next = index < SSL_INDEX ? { name: LADDER[index + 1].name, at: cuts[index + 1] } : null;
  return { key: r.key, name: r.name, file: r.key, index, tir, next, days: DAYS };
}

function computeRank(entries, thresholds, opts) {
  const th = thresholds || { bgTargetBottom: 80, bgTargetTop: 180 };
  const vals = (entries || []).map(e => e.sgv).filter(v => Number.isFinite(v) && v > 0);
  const readings = vals.length;
  if (readings < MIN_READINGS) return { key: null, name: 'Unranked', file: null, index: -1, tir: null, next: null, readings, days: DAYS };

  const inRange = vals.filter(v => v >= th.bgTargetBottom && v <= th.bgTargetTop).length;
  const tir = Math.round((1000 * inRange) / readings) / 10;
  const cuts = cutoffs(opts);
  let idx = 0;
  for (let i = 1; i < LADDER.length; i++) if (tir >= cuts[i]) idx = i;
  return { ...describe(idx, tir, cuts), readings };
}

function label(r) { return r && r.key ? r.name : 'Unranked'; }

// A made-up rank for the Preview picker in Settings: sits in the middle of that rank's band.
function sample(key, opts) {
  const cuts = cutoffs(opts);
  const idx = Math.max(0, LADDER.findIndex(r => r.key === key));
  const lo = idx === 0 ? Math.max(0, cuts[1] - 10) : cuts[idx];
  const hi = idx < SSL_INDEX ? cuts[idx + 1] : 100;
  const tir = Math.round(((lo + hi) / 2) * 10) / 10;
  return { ...describe(idx, tir, cuts), readings: 864, preview: true };
}

module.exports = { LADDER, DEFAULTS, DAYS, MIN_READINGS, cutoffs, computeRank, label, sample };
