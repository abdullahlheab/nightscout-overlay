'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const BUILTIN_ICONS = '../../assets/ranks/';
  const PART_LABELS = {
    base: ['Time in range', (s) => s ? s.tir + '% of readings in range' : ''],
    lows: ['Lows', (s) => s ? s.low + '% below target (4% free)' : ''],
    veryLows: ['Very lows', (s) => s ? s.veryLow + '% below urgent low (1% free)' : ''],
    spikes: ['Spikes', (s) => s ? s.veryHigh + '% above urgent high (5% free)' : ''],
    steady: ['Steadiness', (s) => s ? 'variability ' + s.cv + '% (bonus under 36%)' : '']
  };

  function fileUrl(p) {
    return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  }
  function deltaEl(el, d, suffix = '') {
    if (d === null || d === undefined || Number.isNaN(d)) { el.textContent = ''; el.className = 'delta flat'; return; }
    const sign = d > 0 ? '+' : '';
    el.textContent = (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '– ') + sign + d + suffix;
    el.className = 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
  }
  function dayName(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - date) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function render(d) {
    const r = d.rank, cfg = d.config || {};
    const badge = $('badge');
    if (r && r.key) {
      const img = document.createElement('img'); img.alt = '';
      const dir = cfg.rank && cfg.rank.iconDir;
      img.src = dir ? fileUrl(dir.replace(/[\\/]+$/, '') + '/' + r.file + '.png') : BUILTIN_ICONS + r.file + '.png';
      img.onerror = () => { img.onerror = null; img.src = BUILTIN_ICONS + r.file + '.png'; };
      badge.replaceChildren(img);
    } else {
      const img = document.createElement('img'); img.alt = ''; img.src = BUILTIN_ICONS + 'unranked.png';
      badge.replaceChildren(img);
    }
    $('title').textContent = r && r.key ? r.name : 'Unranked';
    const ranked = r && r.mmr !== null && r.mmr !== undefined;
    $('mmr').textContent = ranked ? r.mmr : '--';
    deltaEl($('delta24'), ranked ? d.delta24h : null);
    $('sub').textContent = ranked
      ? (d.delta24h === null || d.delta24h === undefined ? 'No comparison yet; check back tomorrow' : (d.delta24h === 0 ? 'Unchanged since this time yesterday' : (d.delta24h > 0 ? 'Up' : 'Down') + ' ' + Math.abs(d.delta24h) + ' MMR since this time yesterday'))
      : '';
    $('barFill').style.width = (ranked ? Math.round(r.progress * 100) : 0) + '%';
    $('nextLeft').textContent = ranked ? r.name + ' from ' + r.floorMmr : '';
    $('nextRight').textContent = ranked && r.next ? r.next.name + ' at ' + r.next.mmr + ' (' + r.next.needed + ' to go)' : (ranked ? 'Top of the ladder' : '');

    $('empty').hidden = ranked;
    $('parts').hidden = !ranked;
    $('days').hidden = !ranked;

    const pb = $('parts').querySelector('tbody'); pb.replaceChildren();
    if (ranked && r.parts) {
      const prev = d.parts24h || null;
      for (const [k, [label, why]] of Object.entries(PART_LABELS)) {
        const tr = document.createElement('tr');
        const v = r.parts[k];
        const dv = prev && Number.isFinite(prev[k]) ? v - prev[k] : null;
        tr.innerHTML = '<td>' + label + '<span class="why">' + why(r.stats) + '</span></td><td>' + (v > 0 && k !== 'base' ? '+' : '') + v + '</td><td><span class="delta"></span></td>';
        deltaEl(tr.querySelector('.delta'), dv);
        pb.appendChild(tr);
      }
      const tot = document.createElement('tr'); tot.className = 'total';
      tot.innerHTML = '<td>MMR</td><td>' + r.mmr + '</td><td><span class="delta"></span></td>';
      deltaEl(tot.querySelector('.delta'), d.delta24h);
      pb.appendChild(tot);
    }

    const db = $('days').querySelector('tbody'); db.replaceChildren();
    if (ranked && r.stats && r.stats.days) {
      for (const day of r.stats.days.slice(-4)) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + dayName(day.date) + '<span class="why">' + day.readings + ' readings</span></td><td>' + day.tir + '%</td><td>' + day.low + '%</td><td>' + day.high + '%</td><td>' + day.mean + '</td>';
        db.appendChild(tr);
      }
    }
    $('window').textContent = ranked ? r.stats.readings + ' readings over the last ' + r.days + ' days' + (r.preview ? ' (preview)' : '') : '';
    $('updated').textContent = d.updatedAt ? 'Updated ' + new Date(d.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
  }

  window.api.onOverview(render);
  $('close').addEventListener('click', () => window.api.closeOverview());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.api.closeOverview(); });
  window.api.requestOverview();
})();
