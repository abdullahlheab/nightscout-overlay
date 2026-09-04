'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  url: '',
  token: '',
  units: 'auto',          // 'auto' | 'mg/dl' | 'mmol'
  refreshSeconds: 60,
  staleMinutes: 15,
  historyHours: 3,
  showGraph: true,
  showDelta: true,
  showAge: true,
  scale: 1,
  opacity: 0.92,
  clickThrough: false,
  openAtLogin: false,
  position: null,         // { x, y } or null = top-right of primary display
  thresholds: { bgLow: null, bgTargetBottom: null, bgTargetTop: null, bgHigh: null }, // null = use Nightscout's
  alerts: { enabled: true, low: true, high: true, urgent: true, stale: true, volume: 0.3, repeatMinutes: 10, snoozeMinutes: 30 }
};

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    // strip a BOM in case the file was hand-edited with an editor that adds one
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8').replace(/^﻿/, ''));
    return { ...DEFAULTS, ...raw,
      thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds || {}) },
      alerts: { ...DEFAULTS.alerts, ...(raw.alerts || {}) } };
  } catch {
    return { ...DEFAULTS, thresholds: { ...DEFAULTS.thresholds }, alerts: { ...DEFAULTS.alerts } };
  }
}

function save(cfg) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2));
}

module.exports = { DEFAULTS, load, save, file };
