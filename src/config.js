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
  theme: 'dark',          // dark | light | glass (Windows 11 acrylic, fixed blur, square corners) | none (text only)
  outline: 'auto',        // auto (on when opacity < 0.7) | on | off: halo around text and graph
  clickThrough: false,
  openAtLogin: false,
  position: null,         // { x, y } or null = top-right of primary display
  updateDismissed: null,  // { version, until } after "Later" on the in-overlay update notice
  rank: {                 // Rocket League style rank from time in range over the last 3 days
    enabled: true,
    showLabel: true,
    iconDir: '',          // optional folder with bronze-1.png ... supersonic-legend.png to replace the built-in badges
    floor: 45,            // time in range % where Silver I starts (Bronze I-III sit below it)
    top: 97               // time in range % where Supersonic Legend starts; ranks in between are spread evenly
  },
  thresholds: { bgLow: null, bgTargetBottom: null, bgTargetTop: null, bgHigh: null }, // null = use Nightscout's
  alerts: {
    enabled: true, low: true, high: true, urgent: true, stale: true,
    sound: 'chime',        // chime | bell | beep | custom | silent
    customSound: '',       // path to a .wav/.mp3/.ogg when sound = custom
    volume: 0.3,
    remindMinutes: 30,      // replay once every N minutes while still out of range
    flash: true,            // pulse the card border while alerting
    notify: false,          // also show a Windows/macOS notification (always when overlay hidden)
    quietEnabled: false, quietFrom: '23:00', quietTo: '07:00'   // no chime in this window, bar still shows
  }
};

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    // strip a BOM in case the file was hand-edited with an editor that adds one
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8').replace(/^﻿/, ''));
    const alerts = { ...DEFAULTS.alerts, ...(raw.alerts || {}) };
    // 0.2.3 merged the old repeat/snooze pair into one interval
    if (raw.alerts && raw.alerts.remindMinutes === undefined && raw.alerts.snoozeMinutes) alerts.remindMinutes = raw.alerts.snoozeMinutes;
    delete alerts.repeatMinutes; delete alerts.snoozeMinutes;
    const rank = { ...DEFAULTS.rank, ...(raw.rank || {}) }; delete rank.cutoffs;
    // 0.4.0-0.4.2 defaulted Windows 11 to glass; it cannot be made see-through, so move those back to the dark card once
    if (raw.theme === 'glass' && !raw.glassMigrated) { raw.theme = 'dark'; raw.glassMigrated = true; }
    return { ...DEFAULTS, ...raw,
      thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds || {}) },
      alerts, rank };
  } catch {
    return { ...DEFAULTS, thresholds: { ...DEFAULTS.thresholds }, alerts: { ...DEFAULTS.alerts }, rank: { ...DEFAULTS.rank } };
  }
}

function save(cfg) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2));
}

module.exports = { DEFAULTS, load, save, file };
