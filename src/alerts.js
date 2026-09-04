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
  if (type === 'stale') return 'No data for ' + payload.ageMin + ' min';
  return LABELS[type] + '  ' + payload.display + ' ' + payload.units;
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

  if (state.active && state.active.type === type) {
    if (now - state.active.lastChime >= repeatMs) {
      state.active.lastChime = now;
      return { show: { ...base, sound: soundFor(type) } };
    }
    return { show: { ...base, sound: null } };
  }

  state.active = { type, since: now, lastChime: now };
  return { show: { ...base, sound: soundFor(type) } };
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

module.exports = { evaluate, acknowledge, reset, LABELS, soundFor };
