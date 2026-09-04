'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  const fields = ['url', 'token', 'units', 'historyHours', 'scale', 'opacity', 'showGraph', 'showDelta', 'showAge',
    'refreshSeconds', 'staleMinutes', 'clickThrough', 'openAtLogin'];
  const thresholdKeys = ['bgLow', 'bgTargetBottom', 'bgTargetTop', 'bgHigh'];

  function fill(cfg) {
    for (const f of fields) {
      const el = $(f);
      if (el.type === 'checkbox') el.checked = !!cfg[f];
      else el.value = cfg[f] ?? '';
    }
    for (const k of thresholdKeys) $(k).value = cfg.thresholds && cfg.thresholds[k] ? cfg.thresholds[k] : '';
    updateRangeLabels();
  }

  function num(v, fallback) { const n = Number(v); return Number.isFinite(n) && v !== '' ? n : fallback; }

  function collect() {
    const out = { thresholds: {} };
    for (const f of fields) {
      const el = $(f);
      if (el.type === 'checkbox') out[f] = el.checked;
      else if (el.type === 'number' || el.type === 'range') out[f] = num(el.value, undefined);
      else out[f] = el.value.trim();
    }
    for (const k of thresholdKeys) out.thresholds[k] = $(k).value === '' ? null : num($(k).value, null);
    if (out.url && !/^https?:\/\//i.test(out.url)) out.url = 'https://' + out.url;
    return out;
  }

  function updateRangeLabels() {
    $('scaleVal').textContent = Number($('scale').value).toFixed(1) + 'x';
    $('opacityVal').textContent = Math.round(Number($('opacity').value) * 100) + '%';
  }
  $('scale').addEventListener('input', updateRangeLabels);
  $('opacity').addEventListener('input', updateRangeLabels);

  async function save() {
    const cfg = await window.api.setConfig(collect());
    $('url').value = cfg.url;
    $('saved').textContent = 'Saved';
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
  }

  $('save').addEventListener('click', save);
  $('saveClose').addEventListener('click', async () => { await save(); window.api.closeSettings(); });

  $('test').addEventListener('click', async () => {
    const r = $('testResult');
    r.className = ''; r.textContent = 'Testing...';
    const draft = collect();
    const res = await window.api.testConnection({ url: draft.url, token: draft.token, units: draft.units, historyHours: draft.historyHours });
    if (res.ok) {
      r.className = 'ok';
      r.textContent = 'Connected to ' + res.name + ' (v' + res.version + '). ' + (res.latest ? 'Latest: ' + res.latest : 'No readings yet.');
    } else {
      r.className = 'bad';
      r.textContent = 'Failed: ' + res.error;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.api.closeSettings();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  });

  // ---- updates ----
  let updState = null;
  function renderUpdate(s) {
    updState = s;
    $('version').textContent = 'Version ' + s.version + (s.portable ? ' (portable)' : '');
    const btn = $('updateBtn');
    const text = $('updateText');
    btn.style.display = ''; text.textContent = '';
    switch (s.status) {
      case 'disabled': btn.style.display = 'none'; text.textContent = s.text; break;
      case 'checking': case 'downloading': btn.disabled = true; btn.textContent = s.text; break;
      case 'ready': btn.disabled = false; btn.textContent = 'Restart to update to v' + s.latest; btn.classList.add('primary'); break;
      case 'available': btn.disabled = false; btn.textContent = 'Download v' + s.latest; btn.classList.add('primary'); break;
      case 'none': btn.disabled = false; btn.textContent = 'Check for updates'; text.textContent = 'Up to date'; break;
      case 'error': btn.disabled = false; btn.textContent = 'Retry update check'; text.textContent = s.error || 'Update check failed'; break;
      default: btn.disabled = false; btn.textContent = 'Check for updates';
    }
  }
  $('updateBtn').addEventListener('click', () => {
    if (!updState) return;
    if (updState.status === 'ready') window.api.installUpdate();
    else if (updState.status === 'available') window.api.openDownloadPage();
    else window.api.checkForUpdates();
  });
  window.api.onUpdateState(renderUpdate);
  renderUpdate(await window.api.updateState());

  fill(await window.api.getConfig());
  $('path').textContent = 'Settings file: ' + (await window.api.configPath());
})();
