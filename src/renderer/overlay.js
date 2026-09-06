'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const card = $('card'), bgEl = $('bg'), arrowEl = $('arrow'), deltaEl = $('delta'),
    ageEl = $('age'), errEl = $('err'), canvas = $('graph'), menuBtn = $('menu');

  let cfg = null;
  let data = null;


  function applyConfig(c) {
    cfg = c;
    document.documentElement.style.fontSize = (16 * (Number(c.scale) || 1)) + 'px';
    const alpha = Number.isFinite(Number(c.opacity)) ? Number(c.opacity) : 0.92;
    document.documentElement.style.setProperty('--bg-alpha', String(alpha));
    document.documentElement.style.setProperty('--bg', 'rgba(15, 23, 42, ' + alpha + ')');
    document.body.dataset.theme = c.theme || 'dark';
    // glass blurs its backdrop, so it only needs the halo when nearly clear
    const autoAt = c.theme === 'glass' ? 0.3 : 0.7;
    const halo = c.outline === 'on' || c.theme === 'none' || (c.outline !== 'off' && alpha < autoAt);
    document.body.classList.toggle('halo', halo);
    canvas.classList.toggle('hidden', !c.showGraph);
    deltaEl.style.display = c.showDelta ? '' : 'none';
    ageEl.style.display = c.showAge ? '' : 'none';
    document.body.classList.toggle('click-through', !!c.clickThrough);
    card.classList.toggle('flash', !!(c.alerts && c.alerts.flash));
    $('rankBadge').classList.toggle('px', (Number(c.scale) || 1) >= 2.5);
    if (typeof rankData !== 'undefined') showRank(rankData);
    if (data) render();
  }

  function ageText(p) {
    // ageMin was computed at fetch time; keep it ticking between polls.
    const extra = p.fetchedAt ? Math.floor((Date.now() - p.fetchedAt) / 60000) : 0;
    const m = (p.ageMin || 0) + Math.max(0, extra);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm ago';
  }

  function render() {
    const p = data;
    if (!p) return;
    const classes = ['in-range', 'low', 'high', 'urgent-low', 'urgent-high', 'stale', 'error'];
    card.classList.remove(...classes);

    if (p.error && p.display === undefined) {
      card.classList.add('error');
      bgEl.textContent = '--';
      arrowEl.textContent = '';
      deltaEl.textContent = '';
      ageEl.textContent = '';
      errEl.textContent = p.error;
      drawGraph([], p.thresholds);
      return;
    }

    card.classList.add(testState || p.state || 'error');
    bgEl.textContent = p.display;
    arrowEl.textContent = p.arrow || '';
    deltaEl.textContent = p.deltaDisplay || '';
    ageEl.textContent = ageText(p);
    errEl.textContent = p.error ? ('Update failed: ' + p.error) : '';
    errEl.style.display = p.error ? '' : 'none';
    drawGraph(p.history || [], p.thresholds);
  }

  function drawGraph(history, th) {
    if (!cfg || !cfg.showGraph) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);

    th = th || { bgTargetBottom: 80, bgTargetTop: 180, bgLow: 55, bgHigh: 260 };
    const vals = history.map(h => h.sgv);
    const lo = Math.min(th.bgTargetBottom - 20, ...(vals.length ? vals : [th.bgTargetBottom])) - 5;
    const hi = Math.max(th.bgTargetTop + 30, ...(vals.length ? vals : [th.bgTargetTop])) + 5;
    const y = (v) => H - 1 - ((v - lo) / (hi - lo)) * (H - 2);

    // target band
    ctx.fillStyle = getComputedStyle(card).getPropertyValue('--band').trim() || 'rgba(34,197,94,0.14)';
    ctx.fillRect(0, y(th.bgTargetTop), W, y(th.bgTargetBottom) - y(th.bgTargetTop));

    if (history.length < 2) return;
    const hours = Number(cfg.historyHours) || 3;
    const tEnd = Date.now();
    const tStart = tEnd - hours * 3600000;
    const x = (t) => ((t - tStart) / (tEnd - tStart)) * (W - 4) + 2;

    const accent = getComputedStyle(card).getPropertyValue('--accent').trim() || '#22c55e';
    const s = Math.max(1, Number(cfg.scale) || 1);
    const trace = () => {
      ctx.beginPath();
      history.forEach((h, i) => {
        const px = x(h.t), py = y(h.sgv);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (document.body.classList.contains('halo')) {
      // a wider stroke in the halo tone underneath keeps the line visible on any backdrop
      ctx.strokeStyle = getComputedStyle(card).getPropertyValue('--halo').trim() || 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 4.5 * s;
      trace();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 * s;
    trace();

    const last = history[history.length - 1];
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x(last.t), y(last.sgv), 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- alerts ----
  const alertBar = $('alertBar'), alertText = $('alertText'), ackBtn = $('ack');
  let audioCtx = null;
  let customAudio = null;
  let testState = null;
  const PATTERNS = {
    warn:   [[660, 0], [880, 0.22]],
    urgent: [[660, 0], [880, 0.2], [1100, 0.4], [660, 0.9], [880, 1.1], [1100, 1.3]],
    stale:  [[440, 0]]
  };
  // sound style -> waveform, decay, loudness, pitch
  const STYLES = {
    chime: { wave: 'sine', decay: 0.35, gainMul: 0.35, freqMul: 1 },
    bell:  { wave: 'triangle', decay: 0.9, gainMul: 0.3, freqMul: 1.5 },
    beep:  { wave: 'square', decay: 0.12, gainMul: 0.12, freqMul: 1.25 }
  };
  function fileUrl(p) {
    return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  }
  function chime(kind, volume, style, file) {
    const vol = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.3));
    if (style === 'silent' || vol <= 0) return;
    if (style === 'custom') {
      if (!file) return;
      try {
        if (customAudio) customAudio.pause();
        customAudio = new Audio(fileUrl(file));
        customAudio.volume = vol;
        customAudio.play().catch(() => {});
      } catch { /* unreadable file */ }
      return;
    }
    const st = STYLES[style] || STYLES.chime;
    try {
      audioCtx = audioCtx || new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const v = vol * st.gainMul; // soft by design
      const t0 = audioCtx.currentTime + 0.05;
      for (const [freq, at] of PATTERNS[kind] || PATTERNS.warn) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = st.wave; o.frequency.value = freq * st.freqMul;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(v, t0 + at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + st.decay);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + at); o.stop(t0 + at + st.decay + 0.05);
      }
    } catch { /* no audio device */ }
  }
  const STATE_CLASSES = ['in-range', 'low', 'high', 'urgent-low', 'urgent-high', 'stale', 'error'];
  function showAlert(a) {
    if (!a) {
      alertBar.classList.add('hidden'); card.classList.remove('alerting');
      testState = null;
      if (data) render(); else card.classList.remove(...STATE_CLASSES);
      return;
    }
    alertText.textContent = a.message;
    alertBar.classList.remove('hidden');
    card.classList.add('alerting');
    // a test alert colours the card like the real condition would
    testState = a.type === 'test' ? (a.testState || 'low') : null;
    if (data) render(); else { card.classList.remove(...STATE_CLASSES); card.classList.add(testState || 'error'); }
    if (a.sound) chime(a.sound, a.volume, a.style, a.file);
  }
  ackBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.acknowledgeAlert(); });
  window.api.onAlert(showAlert);

  // ---- rank badge ----
  const rankRow = $('rankRow'), rankBadge = $('rankBadge'), rankName = $('rankName');
  // Drawn fallback badges, only used if an icon file cannot be loaded. Original art, not the game's.
  const BADGE = {
    bronze:           { a: '#d9945a', b: '#7a4416', wings: 0 },
    silver:           { a: '#e6ebf2', b: '#7c8794', wings: 0 },
    gold:             { a: '#ffe066', b: '#9a6400', wings: 0 },
    platinum:         { a: '#a7f0e8', b: '#137a72', wings: 0 },
    diamond:          { a: '#8cc7ff', b: '#1d4fa8', wings: 0 },
    champion:         { a: '#d4a6ff', b: '#5b21b6', wings: 1 },
    'grand-champion': { a: '#ff7b93', b: '#8f1233', wings: 2 },
    'supersonic-legend': { a: '#fff8dc', b: '#c9971b', wings: 2, burst: true },
    unranked:         { a: '#9aa4b2', b: '#3b4351', wings: 0 }
  };
  const BUILTIN_ICONS = '../../assets/ranks/';   // relative to this page
  function badgeSvg(rankKey) {
    const tierKey = (rankKey || 'unranked').replace(/-\d$/, '');
    const t = BADGE[tierKey] || BADGE.unranked;
    const id = 'g_' + tierKey;
    const wing = (dir) => `<path d="M${dir > 0 ? 58 : 6} 30 l${dir * 6} -8 l${-dir * 2} 9 l${dir * 6} -5 l${-dir * 3} 10 l${dir * 5} -3 l${-dir * 9} 8 z" fill="${t.a}" opacity="0.9"/>`;
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>
        <linearGradient id="${id}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.b}"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
      </defs>
      ${t.burst ? '<g fill="' + t.a + '" opacity="0.85"><path d="M32 0 l3 9 -3 -3 -3 3z"/><path d="M32 64 l3 -9 -3 3 -3 -3z"/><path d="M0 32 l9 3 -3 -3 3 -3z"/><path d="M64 32 l-9 3 3 -3 -3 -3z"/></g>' : ''}
      ${t.wings >= 1 ? wing(1) + wing(-1) : ''}
      <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="url(#${id})" stroke="${t.b}" stroke-width="1.5" stroke-linejoin="round"/>
      <polygon points="32,11 50,21.5 50,42.5 32,53 14,42.5 14,21.5" fill="url(#${id}i)" opacity="0.95"/>
      <!-- rocket -->
      <path d="M32 17 c5 5 6 12 5 19 h-10 c-1 -7 0 -14 5 -19z" fill="#f8fafc"/>
      <circle cx="32" cy="28" r="2.6" fill="${t.b}"/>
      <path d="M27 33 l-4 5 h5z M37 33 l4 5 h-5z" fill="${t.a}"/>
      <path d="M29.5 37 h5 l-2.5 6z" fill="${t.a}"/>
      ${t.wings >= 2 ? '<path d="M20 44 h24" stroke="' + t.a + '" stroke-width="2" stroke-linecap="round" opacity="0.8"/>' : ''}
    </svg>`;
  }
  const ICON_EXT = ['png', 'svg', 'webp', 'jpg'];
  // Try each candidate URL in turn; the first that loads wins, otherwise draw the fallback badge.
  function tryIcons(urls, onFail) {
    if (!urls.length) return onFail();
    const img = document.createElement('img');
    img.alt = '';
    img.onerror = () => tryIcons(urls.slice(1), onFail);
    img.src = urls[0];
    rankBadge.replaceChildren(img);
  }
  function iconCandidates(dir, file) {
    const urls = [];
    if (dir) for (const ext of ICON_EXT) urls.push(fileUrl(dir.replace(/[\\/]+$/, '') + '/' + file + '.' + ext));
    urls.push(BUILTIN_ICONS + file + '.png');
    return urls;
  }
  function showRank(r) {
    const rc = (cfg && cfg.rank) || {};
    if (!rc.enabled || !r) { rankRow.classList.add('hidden'); return; }
    rankRow.classList.remove('hidden');
    const key = r.key || 'unranked';
    rankBadge.classList.toggle('legend', key === 'supersonic-legend');
    const drawn = () => { rankBadge.innerHTML = badgeSvg(key); };
    tryIcons(iconCandidates(rc.iconDir, r.file || 'unranked'), drawn);
    rankName.textContent = rc.showLabel === false ? '' : (r.key ? r.name : 'Unranked');
    // the numbers live in the tooltip only
    rankRow.title = r.tir === null ? 'Not enough readings yet'
      : r.tir + '% in range over the last ' + r.days + ' days' + (r.next ? '. Next: ' + r.next.name + ' at ' + r.next.at + '%' : '') + (r.preview ? ' (preview)' : '');
    if (data) render();
  }
  let rankData = null;
  window.api.onRank((r) => { rankData = r; showRank(r); });

  // ---- update notice ----
  const updateBar = $('updateBar'), updateText = $('updateText'), updateGo = $('updateGo');
  let notice = null;
  window.api.onUpdateNotice((n) => {
    notice = n;
    if (!n) { updateBar.classList.add('hidden'); return; }
    updateText.textContent = 'v' + n.version;   // short: it shares the row with two buttons
    updateGo.textContent = n.ready ? 'Update' : 'Download';
    updateBar.classList.remove('hidden');
    if (data) render();
  });
  updateGo.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!notice) return;
    if (notice.ready) window.api.installUpdate(); else window.api.openDownloadPage();
  });
  $('updateLater').addEventListener('click', (e) => { e.stopPropagation(); window.api.dismissUpdate(); });

  window.api.onConfig(applyConfig);
  window.api.onData((p) => { data = p; render(); });

  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); window.api.showMenu(); });
  menuBtn.addEventListener('dblclick', (e) => e.stopPropagation());
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.api.showMenu(); });
  window.addEventListener('resize', () => data && render());

  // ---- resizing: drag the corner grip, or Ctrl+scroll ----
  const grip = $('grip');
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !cfg) return;
    e.preventDefault(); e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    drag = { x: e.screenX, y: e.screenY, scale: Number(cfg.scale) || 1, w: window.outerWidth, h: window.outerHeight };
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // If the button is no longer held (pointerup was lost while the window resized under the
    // cursor), stop dragging instead of re-applying a stale size on every hover.
    if (!(e.buttons & 1)) { drag = null; return; }
    // scale by whichever axis the user stretched more
    const fx = (drag.w + (e.screenX - drag.x)) / drag.w;
    const fy = (drag.h + (e.screenY - drag.y)) / drag.h;
    const f = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
    window.api.setScale(drag.scale * f);
  });
  const endDrag = (e) => { if (drag) { drag = null; try { grip.releasePointerCapture(e.pointerId); } catch {} } };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', endDrag);
  grip.addEventListener('click', (e) => e.stopPropagation());

  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !cfg) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    window.api.setScale((Number(cfg.scale) || 1) + step);
  }, { passive: false });

  setInterval(() => { if (data && data.display !== undefined) ageEl.textContent = ageText(data); }, 20000);
})();
