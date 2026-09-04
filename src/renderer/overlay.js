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
    document.documentElement.style.setProperty('--bg', 'rgba(15, 23, 42, ' + (Number(c.opacity) || 0.92) + ')');
    canvas.classList.toggle('hidden', !c.showGraph);
    deltaEl.style.display = c.showDelta ? '' : 'none';
    ageEl.style.display = c.showAge ? '' : 'none';
    document.body.classList.toggle('click-through', !!c.clickThrough);
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

    card.classList.add(p.state || 'error');
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
    ctx.fillStyle = 'rgba(34,197,94,0.14)';
    ctx.fillRect(0, y(th.bgTargetTop), W, y(th.bgTargetBottom) - y(th.bgTargetTop));

    if (history.length < 2) return;
    const hours = Number(cfg.historyHours) || 3;
    const tEnd = Date.now();
    const tStart = tEnd - hours * 3600000;
    const x = (t) => ((t - tStart) / (tEnd - tStart)) * (W - 4) + 2;

    const accent = getComputedStyle(card).getPropertyValue('--accent').trim() || '#22c55e';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    history.forEach((h, i) => {
      const px = x(h.t), py = y(h.sgv);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    const last = history[history.length - 1];
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x(last.t), y(last.sgv), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

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
    // scale by whichever axis the user stretched more
    const fx = (drag.w + (e.screenX - drag.x)) / drag.w;
    const fy = (drag.h + (e.screenY - drag.y)) / drag.h;
    const f = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
    window.api.setScale(drag.scale * f);
  });
  const endDrag = (e) => { if (drag) { drag = null; try { grip.releasePointerCapture(e.pointerId); } catch {} } };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('click', (e) => e.stopPropagation());

  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !cfg) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    window.api.setScale((Number(cfg.scale) || 1) + step);
  }, { passive: false });

  setInterval(() => { if (data && data.display !== undefined) ageEl.textContent = ageText(data); }, 20000);
})();
