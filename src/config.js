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
  thresholds: { bgLow: null, bgTargetBottom: null, bgTargetTop: null, bgHigh: null } // null = use Nightscout's
};

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { ...DEFAULTS, ...raw, thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds || {}) } };
  } catch {
    return { ...DEFAULTS, thresholds: { ...DEFAULTS.thresholds } };
  }
}

function save(cfg) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2));
}

module.exports = { DEFAULTS, load, save, file };
