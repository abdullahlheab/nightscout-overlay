'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const BUILTIN_ICONS = '../../assets/ranks/';
  // order matches the design: the base first, then the bonus, then the penalties
  const PARTS = [
    ['base', 'Time in range', '#60a5fa'],
    ['steady', 'Steadiness', '#22c55e'],
    ['lows', 'Lows', '#ef4444'],
    ['veryLows', 'Very lows', '#ef4444'],
    ['spikes', 'Spikes', '#f59e0b']
  ];

  function fileUrl(p) {
    return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  }
  function deltaText(d) {
    if (d === null || d === undefined || Number.isNaN(d)) return ['', 'flat'];
    if (d === 0) return ['–', 'flat'];
    return [(d > 0 ? '▲ ' : '▼ ') + Math.abs(d), d > 0 ? 'up' : 'down'];
  }
  function updatedText(t) {
    const d = new Date(t), now = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + time;
  }
  function dayName(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - date) / 86400000);
    if (diff === 0) return 'Today <span class="soFar">so far</span>';
    if (diff === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  const pctText = (v) => (v === null || v === undefined ? '–' : Math.round(v) + '%');

  function render(d) {
    const r = d.rank, cfg = d.config || {};
    const ranked = !!(r && r.mmr !== null && r.mmr !== undefined);

    // toolbar
    $('updated').textContent = d.updatedAt ? 'Updated ' + updatedText(d.updatedAt) : 'Not updated yet';
    $('refresh').disabled = !!d.refreshing;
    $('refreshText').textContent = d.refreshing ? 'Refreshing...' : 'Refresh rank';
    $('err').hidden = !d.error;
    $('err').textContent = d.error ? 'Last refresh failed: ' + d.error + '. Showing the previous result.' : '';

    // hero
    const img = document.createElement('img'); img.alt = '';
    const file = (r && r.file) || 'unranked';
    const dir = cfg.rank && cfg.rank.iconDir;
    img.src = dir ? fileUrl(dir.replace(/[\\/]+$/, '') + '/' + file + '.png') : BUILTIN_ICONS + file + '.png';
    img.onerror = () => { img.onerror = null; img.src = BUILTIN_ICONS + file + '.png'; };
    $('badge').replaceChildren(img);
    $('title').textContent = ranked ? r.name : 'Unranked';
    $('mmr').textContent = ranked ? r.mmr : '--';
    const sub = $('sub');
    if (!ranked) { sub.textContent = ''; sub.className = 'flat'; }
    else if (d.delta24h === null || d.delta24h === undefined) { sub.textContent = 'No comparison yet, check back tomorrow'; sub.className = 'flat'; }
    else if (d.delta24h === 0) { sub.textContent = 'Unchanged since this time yesterday'; sub.className = 'flat'; }
    else { sub.textContent = (d.delta24h > 0 ? '▲ +' : '▼ −') + Math.abs(d.delta24h) + ' since this time yesterday'; sub.className = d.delta24h > 0 ? 'up' : 'down'; }
    $('fill').style.width = (ranked ? Math.round(r.progress * 100) : 0) + '%';
    $('nextLeft').textContent = ranked ? String(r.floorMmr) : '';
    $('nextRight').textContent = ranked ? (r.next ? r.next.name + ' at ' + r.next.mmr + ' · ' + r.next.needed + ' to go' : 'Top of the ladder') : '';

    $('empty').hidden = ranked;
    $('partsSection').hidden = !ranked;
    $('daysSection').hidden = !ranked;

    // parts: bar length is the part's size relative to the base
    const parts = $('parts'); parts.replaceChildren();
    if (ranked && r.parts) {
      const prev = d.parts24h || null;
      const scale = Math.max(1, Math.abs(r.parts.base));
      for (const [k, label, color] of PARTS) {
        const v = r.parts[k];
        const [dt, dc] = deltaText(prev && Number.isFinite(prev[k]) ? v - prev[k] : null);
        const row = document.createElement('div'); row.className = 'part';
        const width = Math.min(100, Math.round((Math.abs(v) / scale) * 100));
        row.innerHTML = '<div class="label">' + label + '</div>' +
          '<div class="track"><div style="width:' + (v === 0 ? 0 : Math.max(2, width)) + '%;background:' + color + '"></div></div>' +
          '<div class="val">' + (v > 0 && k !== 'base' ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '</div>' +
          '<div class="delta ' + dc + '">' + dt + '</div>';
        parts.appendChild(row);
      }
    }

    // days
    const days = $('days'); days.replaceChildren();
    if (ranked && r.stats && r.stats.days) {
      for (const day of r.stats.days.slice(-4)) {
        const row = document.createElement('div'); row.className = 'row';
        const tirCls = 'tir' + (day.tir !== null && day.tir >= 70 ? ' good' : '');
        const lowCls = day.low !== null && day.low > 4 ? 'lowbad' : '';
        row.innerHTML = '<div>' + dayName(day.date) + '</div>' +
          '<div class="' + tirCls + '">' + pctText(day.tir) + '</div>' +
          '<div class="' + lowCls + '">' + pctText(day.low) + '</div>' +
          '<div>' + pctText(day.high) + '</div>' +
          '<div>' + (day.mean === null ? '–' : day.mean) + '</div>';
        days.appendChild(row);
      }
    }
  }

  window.api.onOverview(render);
  $('close').addEventListener('click', () => window.api.closeOverview());
  $('refresh').addEventListener('click', () => { $('refresh').disabled = true; $('refreshText').textContent = 'Refreshing...'; window.api.refreshRank(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.api.closeOverview(); });
  window.api.requestOverview();
})();
