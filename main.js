const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

const APP_TITLE = 'QBox.MAG Emulator ShAN';

let vlcEngine = null;
let setupWindow = null;

let settingsPath = '';
let settings = { mac_address: '', serial_number: '', portal_url: '', device_model: '', firmware_version: '', app_version: '', server_version: '', language: 'en' };

const DEFAULT_FIRMWARE = '0.2.18-r23';
const DEFAULT_APP_VERSION = '5.0.16';
const DEFAULT_SERVER_VERSION = '5.2.1';

function ensureDefaultVersions() {
  if (!settings.firmware_version) settings.firmware_version = DEFAULT_FIRMWARE;
  if (!settings.app_version) settings.app_version = DEFAULT_APP_VERSION;
  if (!settings.server_version) settings.server_version = DEFAULT_SERVER_VERSION;
}

function locateSettingsFile() {
  const candidates = [];
  const portable = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portable) candidates.push(path.join(portable, 'settings.txt'));
  candidates.push(path.join(path.dirname(process.execPath), 'settings.txt'));
  candidates.push(path.join(app.getPath('userData'), 'settings.txt'));
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  return candidates[0];
}

function loadSettings() {
  settingsPath = locateSettingsFile();
  ensureDonateFile();
  try {
    const cfg = {};
    const raw = fs.readFileSync(settingsPath, 'utf8');
    for (const line of String(raw).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.*?)\s*$/);
      if (m) cfg[m[1].toLowerCase()] = m[2];
    }
    settings.mac_address = cfg.mac_address || '';
    settings.serial_number = cfg.serial_number || '';
    settings.portal_url = cfg.portal_url || '';
    settings.device_model = cfg.device_model || '';
    settings.firmware_version = cfg.firmware_version || '';
    settings.app_version = cfg.app_version || '';
    settings.server_version = cfg.server_version || '';
    settings.language = cfg.language === 'ru' ? 'ru' : 'en';
    ensureDefaultVersions();
    return !!(settings.mac_address && settings.serial_number && settings.portal_url && settings.device_model);
  } catch (e) {
    return false;
  }
}

function writeSettings(p, lines) {
  try { fs.writeFileSync(p, lines.join('\n'), 'utf8'); return true; } catch (e) { return false; }
}

function saveSettings(cfg) {
  settings = Object.assign(settings, cfg || {});
  settings.language = settings.language === 'ru' ? 'ru' : 'en';
  ensureDefaultVersions();
  const lines = [
    '# ' + APP_TITLE + ' settings',
    '# Enter your device MAC address, serial number, portal URL and device model.',
    '# Version fields are optional - left empty they use common device values.',
    'mac_address = ' + settings.mac_address,
    'serial_number = ' + settings.serial_number,
    'portal_url = ' + settings.portal_url,
    'device_model = ' + settings.device_model,
    'firmware_version = ' + settings.firmware_version,
    'app_version = ' + settings.app_version,
    'server_version = ' + settings.server_version,
    'language = ' + settings.language,
    ''
  ];
  if (writeSettings(settingsPath, lines)) { ensureDonateFile(); return true; }
  const alt = path.join(app.getPath('userData'), 'settings.txt');
  if (writeSettings(alt, lines)) { settingsPath = alt; ensureDonateFile(); return true; }
  return false;
}

const DONATE_TEXT = [
  APP_TITLE,
  '',
  'If this app is useful to you, consider a donation:',
  '',
  'BTC:',
  '1E9jzHK9C3zDGGmiiHmcU4spjRNZgXeCJQ',
  '',
  'USDT (TRC20):',
  'TMkLqQDgArrPGzov7ZKQFGXbBYWnxqvHt2',
  '',
  'Thank you!',
  ''
].join('\n');

function ensureDonateFile() {
  try {
    const p = path.join(path.dirname(settingsPath), 'DONATE.txt');
    if (!fs.existsSync(p)) fs.writeFileSync(p, DONATE_TEXT, 'utf8');
  } catch (e) {}
}

const SETUP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;height:100%;background:#0b0d10;color:#e8e8e8;font-family:'Segoe UI',Arial,sans-serif;user-select:none;}
.wrap{height:100%;display:flex;align-items:center;justify-content:center;}
.card{width:680px;background:#14161c;border:1px solid #262a33;border-radius:14px;padding:36px 40px;box-shadow:0 12px 40px rgba(0,0,0,.5);}
h1{font-size:22px;margin:0 0 4px;}
.sub{color:#9aa0aa;font-size:13px;margin:0 0 24px;}
.step-title{font-size:15px;margin:18px 0 12px;color:#cfd3da;}
.block-title{font-size:14px;margin:16px 0 6px;color:#cfd3da;font-weight:700;border-bottom:1px solid #262a33;padding-bottom:6px;}
.row{display:flex;gap:12px;margin-bottom:10px;}
button.lang{flex:1;padding:14px;font-size:16px;border-radius:9px;border:1px solid #2c313b;background:#1a1d24;color:#e8e8e8;cursor:pointer;}
button.lang.active{border-color:#4f8cff;background:#22304a;color:#fff;}
label{display:block;font-size:12px;color:#9aa0aa;margin:14px 0 6px;}
label.req{font-weight:700;color:#e8e8e8;}
label.opt{font-weight:400;color:#9aa0aa;}
input{width:100%;box-sizing:border-box;padding:12px;font-size:15px;border-radius:8px;border:1px solid #2c313b;background:#0f1116;color:#e8e8e8;outline:none;}
input:focus{border-color:#4f8cff;}
.err{color:#ff7a7a;font-size:13px;margin-top:12px;min-height:18px;}
button.save{width:100%;margin-top:20px;padding:14px;font-size:16px;border:none;border-radius:9px;background:#2f6fdf;color:#fff;cursor:pointer;}
button.save:hover{background:#3a7df2;}
.close{position:fixed;top:14px;right:18px;background:none;border:none;color:#9aa0aa;font-size:22px;cursor:pointer;}
</style>
</head>
<body>
<button class="close" onclick="quit()">✕</button>
<div class="wrap">
  <div class="card">
    <h1 id="t-app"></h1>
    <p class="sub" id="t-sub"></p>
    <div id="s1">
      <div class="step-title" id="t-step1"></div>
      <div class="row">
        <button class="lang" id="l-en" onclick="pick('en')">English</button>
        <button class="lang" id="l-ru" onclick="pick('ru')">Русский</button>
      </div>
      <button class="save" id="b-next" onclick="next()"></button>
    </div>
    <div id="s2" style="display:none">
      <div class="step-title" id="t-step2"></div>
      <div class="block-title" id="t-required"></div>
      <label class="req" id="lb-mac"></label>
      <input id="f-mac" autocomplete="off" spellcheck="false" placeholder="00:11:22:33:44:55">
      <label class="req" id="lb-serial"></label>
      <input id="f-serial" autocomplete="off" spellcheck="false">
      <label class="req" id="lb-portal"></label>
      <input id="f-portal" autocomplete="off" spellcheck="false" placeholder="http://...">
      <label class="req" id="lb-model"></label>
      <input id="f-model" autocomplete="off" spellcheck="false" placeholder="MAG254">
      <div class="block-title" id="t-optional"></div>
      <label class="opt" id="lb-fw"></label>
      <input id="f-fw" autocomplete="off" spellcheck="false">
      <label class="opt" id="lb-appver"></label>
      <input id="f-appver" autocomplete="off" spellcheck="false">
      <label class="opt" id="lb-srvver"></label>
      <input id="f-srvver" autocomplete="off" spellcheck="false">
      <div class="err" id="err"></div>
      <button class="save" id="b-save" onclick="save()"></button>
    </div>
  </div>
</div>
<script>
var L = {
  en: {
    app: 'QBox.MAG Emulator ShAN',
    sub: 'First launch setup',
    step1: 'Select language',
    next: 'Next',
    step2: 'Device settings',
    required: 'Required',
    optional: 'Optional',
    mac: 'MAC address *',
    serial: 'Serial number *',
    portal: 'Portal URL *',
    model: 'Device model *',
    fw: 'Firmware version (optional)',
    appver: 'App version (optional)',
    srvver: 'Server version (optional)',
    save: 'Save and launch',
    err: 'Please fill in all required fields.'
  },
  ru: {
    app: 'QBox.MAG Emulator ShAN',
    sub: 'Настройка при первом запуске',
    step1: 'Выберите язык',
    next: 'Далее',
    step2: 'Параметры устройства',
    required: 'Обязательные',
    optional: 'Необязательные',
    mac: 'MAC-адрес *',
    serial: 'Серийный номер *',
    portal: 'URL портала *',
    model: 'Модель устройства *',
    fw: 'Версия прошивки (необязательно)',
    appver: 'Версия приложения (необязательно)',
    srvver: 'Версия сервера (необязательно)',
    save: 'Сохранить и запустить',
    err: 'Заполните все обязательные поля.'
  }
};
var lang = 'en';
function apply() {
  var t = L[lang];
  document.getElementById('t-app').textContent = t.app;
  document.getElementById('t-sub').textContent = t.sub;
  document.getElementById('t-step1').textContent = t.step1;
  document.getElementById('t-step2').textContent = t.step2;
  document.getElementById('b-next').textContent = t.next;
  document.getElementById('lb-mac').textContent = t.mac;
  document.getElementById('lb-serial').textContent = t.serial;
  document.getElementById('lb-portal').textContent = t.portal;
  document.getElementById('lb-model').textContent = t.model;
  document.getElementById('t-required').textContent = t.required;
  document.getElementById('t-optional').textContent = t.optional;
  document.getElementById('lb-fw').textContent = t.fw;
  document.getElementById('lb-appver').textContent = t.appver;
  document.getElementById('lb-srvver').textContent = t.srvver;
  document.getElementById('b-save').textContent = t.save;
  document.getElementById('err').textContent = '';
  document.getElementById('l-en').className = 'lang' + (lang === 'en' ? ' active' : '');
  document.getElementById('l-ru').className = 'lang' + (lang === 'ru' ? ' active' : '');
}
function pick(x) { lang = x; apply(); }
function next() {
  document.getElementById('s1').style.display = 'none';
  document.getElementById('s2').style.display = 'block';
}
function save() {
  var mac = document.getElementById('f-mac').value.trim();
  var serial = document.getElementById('f-serial').value.trim();
  var portal = document.getElementById('f-portal').value.trim();
  var model = document.getElementById('f-model').value.trim();
  if (!mac || !serial || !portal || !model) {
    document.getElementById('err').textContent = L[lang].err;
    return;
  }
  window.__ppSetup.save({
    mac_address: mac,
    serial_number: serial,
    portal_url: portal,
    device_model: model,
    firmware_version: document.getElementById('f-fw').value.trim(),
    app_version: document.getElementById('f-appver').value.trim(),
    server_version: document.getElementById('f-srvver').value.trim(),
    language: lang
  });
}
function quit() { window.__ppWin.close(); }
document.getElementById('f-fw').value = '0.2.18-r23';
document.getElementById('f-appver').value = '5.0.16';
document.getElementById('f-srvver').value = '5.2.1';
apply();
</script>
</body>
</html>`;

const SOFT_REINIT = `
(() => {
  const A = window.App;
  if (!A || !A.player || !A.device) return 'not-ready';
  const m = A.player.getMode();
  if (!(m === 0 || m === 1 || m === 4)) return 'non-tv';
  const portalPos = A.player.getCurrentTime();
  const v = document.getElementById('player-object');
  const mediaPos = v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
  const url = (A.device.hls && A.device.hls.url) || (A.player.getStreamUrl && A.player.getStreamUrl());
  if (!url) return 'no-url';
  if (m === 1 || m === 4) {
    try {
      A.player.setCurrentTime(portalPos);
      A.device.play(url, false, true, mediaPos);
      return 'archive-reloaded pos=' + portalPos + ' media=' + mediaPos;
    } catch (e) { return 'archive-err:' + (e && e.message); }
  }
  try { A.device.play(url, true); } catch (e) { return 'err:' + (e && e.message); }
  return 'live-reloaded';
})()`;

const PLAY_WRAP = `
(() => {
  const D = window.Device || (window.App && App.device);
  if (!D || D.__ppPlayWrapped) return D && D.__ppPlayWrapped ? 'already' : 'no-device';
  if (!D.play || typeof D.play !== 'function' || !window.Hls) return 'not-ready';
  D.__ppPlayWrapped = true;
  const origPlay = D.play.bind(D);
  const log = (...a) => { try { console.log('[pp]', ...a); } catch (e) {} };
  function restoreArchivePosition() {
    const raw = D.__ppResumeMediaTime;
    const target = Number(raw);
    if (!Number.isFinite(target) || target <= 0) return false;
    const v = document.getElementById('player-object');
    if (!v) return false;
    try {
      let pos = target;
      if (v.seekable && v.seekable.length) {
        const start = v.seekable.start(0), end = v.seekable.end(v.seekable.length - 1);
        pos = Math.max(start + 0.05, Math.min(pos, end - 0.25));
      }
      v.currentTime = pos;
      log('archive position restored:', pos.toFixed(2));
      return true;
    } catch (e) { return false; }
  }
  function restoreAudioTrack(h) {
    const track = Number(D.__ppResumeAudioTrack);
    try {
      if (Number.isInteger(track) && track >= 0 && h.audioTracks && h.audioTracks.length > track) {
        h.audioTrack = track;
        log('audio track restored:', track);
      }
      const v = document.getElementById('player-object');
      if (v) { v.muted = false; v.defaultMuted = false; v.volume = 1; }
    } catch (e) {}
  }
  function freshHls() {
    const h = new window.Hls({});
    h.on(window.Hls.Events.BUFFER_CREATED, function (e, d) {
      D.loadAudioTracksInfo(); D.onStreamInfoReady(); D.rewindAfterStreamInfoReady();
      restoreAudioTrack(h);
    });
    if (window.Hls.Events.AUDIO_TRACKS_UPDATED) {
      h.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, function () {
        restoreAudioTrack(h);
        setTimeout(() => restoreAudioTrack(h), 250);
      });
    }
    h.on(window.Hls.Events.MANIFEST_PARSED, function () {
      const v = document.getElementById('player-object');
      if (v) {
        restoreArchivePosition();
        setTimeout(restoreArchivePosition, 150);
        setTimeout(restoreArchivePosition, 600);
        restoreAudioTrack(h);
        setTimeout(() => restoreAudioTrack(h), 600);
        try { v.play(); } catch (e) {}
      }
    });
    h.on(window.Hls.Events.ERROR, function (e, d) {
      if (!d.fatal) return;
      if (d.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        if (D.reconnectAttemptCount < 3) { D.onNetworkDisconnected(); h.startLoad(); D.reconnectAttemptCount++; }
      } else if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        if (d.details === window.Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) D.onRenderError(2);
        else D.onStreamNotFound();
        h.recoverMediaError();
      } else {
        if (!D.shiftPlaylist()) D.onStreamError();
      }
    });
    return h;
  }
  D.play = function (url, live, restore, restorePos) {
    const resumeRestart = !live && Number.isFinite(Number(restorePos)) && Number(restorePos) > 0;
    D.__ppResumeMediaTime = resumeRestart ? Number(restorePos) : null;
    if (resumeRestart) {
      D.__ppResumeAudioTrack = null;
    } else {
      try {
        const oldTrack = D.hls && Number(D.hls.audioTrack);
        D.__ppResumeAudioTrack = Number.isInteger(oldTrack) && oldTrack >= 0 ? oldTrack : null;
      } catch (e) { D.__ppResumeAudioTrack = null; }
    }
    try { if (D.hls && D.hls.destroy) D.hls.destroy(); } catch (e) {}
    const v = document.getElementById('player-object');
    const nv = document.createElement('video');
    nv.id = 'player-object';
    nv.autoplay = true;
    nv.playsInline = true;
    nv.preload = 'auto';
    nv.volume = 1;
    nv.muted = false;
    nv.defaultMuted = false;
    if (v) {
      try { nv.style.cssText = v.style.cssText; } catch (e) {}
      try { v.parentNode.replaceChild(nv, v); } catch (e) {}
    }
    D.video = nv;
    D.hls = freshHls();
    D.playlist = [];
    return origPlay(url, live, restore, restorePos);
  };
  D.initPlayer = function () { return true; };
  log('play-wrap installed');
  return 'play-wrapped';
})()`;

const VLC_WRAP = `
(() => {
  const A = window.App;
  if (!A || !A.device) return 'no-device';
  if (!window.__ppVlc) return 'no-bridge';
  const D = A.device;
  if (D.__ppVlcWrapped) return 'already';
  D.__ppVlcWrapped = true;
  const log = (...a) => { try { console.log('[pp]', ...a); } catch (e) {} };
  const origPlay = D.play.bind(D);
  const origPause = D.pause.bind(D);
  const origResume = D.resume.bind(D);
  const origStop = D.stop.bind(D);
  const origRewind = D.rewind.bind(D);
  let playing = false;
  let playRequestedAt = 0;
  let playRequestedMode = null;
  let prevMode = null;
  let leftArchiveAt = 0;
  let reloadPending = false;
  const tvMode = () => { try { const m = A.player.getMode(); return m === 0 || m === 1 || m === 4; } catch (e) { return false; } };
  const applyTransparency = () => {
    try {
      const s = document.body.style;
      s.background = 'transparent';
      s.backgroundColor = 'transparent';
      const v = document.getElementById('player-object');
      if (v && v.style.display !== 'none') v.style.display = 'none';
    } catch (e) {}
  };
  let enabled = false;
  const tryEnable = () => {
    window.__ppVlc.status().then((s) => {
      if (s && s.ready && !enabled) {
        enabled = true;
        window.__ppVlcEnabled = true;
        log('vlc overlay ready');
        applyTransparency();
      }
    }).catch(() => {});
  };
  tryEnable();
  setInterval(tryEnable, 2000);
  D.play = function (url, live, restore, restorePos) {
    if (tvMode() && enabled) {
      try { D.hls && D.hls.stopLoad(); } catch (e) {}
      playRequestedAt = Date.now();
      try { playRequestedMode = A.player.getMode(); } catch (e) { playRequestedMode = null; }
      window.__ppVlc.play(String(url), 0).then((ok) => {
        if (ok) {
          playing = true;
          try { D.loadAudioTracksInfo(); D.onStreamInfoReady(); D.rewindAfterStreamInfoReady(); } catch (e) {}
        } else {
          origPlay(url, live, restore, restorePos);
        }
      });
      return 'vlc';
    }
    playing = false;
    return origPlay(url, live, restore, restorePos);
  };
  D.pause = function () { if (tvMode() && enabled) window.__ppVlc.pause(); else origPause(); };
  D.resume = function () { if (tvMode() && enabled) window.__ppVlc.resume(); else origResume(); };
  D.stop = function (resetRestoreState) {
    if (tvMode() && enabled) { playing = false; window.__ppVlc.stop(); return; }
    return origStop(resetRestoreState);
  };
  D.rewind = function (t, step) { if (tvMode() && enabled) window.__ppVlc.seekRel((step || 0) * 1000); else origRewind(t, step); };
  setInterval(() => {
    if (!enabled) return;
    applyTransparency();
    window.__ppVlc.rect(1, 1, 100, 100);
    try {
      const m = A.player.getMode();
      if (prevMode !== null && (prevMode === 1 || prevMode === 4) && m === 0) leftArchiveAt = Date.now();
      prevMode = m;
    } catch (e) {}
    try {
      if (!reloadPending && playing && tvMode() && playRequestedMode === 0 && playRequestedAt &&
          playRequestedAt >= leftArchiveAt - 1500 && Date.now() - leftArchiveAt < 5000 &&
          Date.now() - playRequestedAt > 2000 && Date.now() - playRequestedAt < 15000) {
        window.__ppVlc.isPlaying().then((ok) => {
          if (ok) return;
          const now = Date.now();
          let last = 0;
          try { last = Number(sessionStorage.getItem('ppVlcReloadAt') || 0); } catch (e) {}
          if (now - last < 30000) return;
          try { sessionStorage.setItem('ppVlcReloadAt', String(now)); } catch (e) {}
          reloadPending = true;
          log('vlc no-signal -> reload');
          location.reload();
        }).catch(() => {});
      }
    } catch (e) {}
  }, 1000);
  log('vlc-wrap installed');
  return 'vlc-wrap';
})()`;

const WATCHER = `
(() => {
  if (window.__ppAudioWatcher) return 'already';
  window.__ppAudioWatcher = true;
  const modeIsTv = (m) => m === 0 || m === 1 || m === 4;
  const log = (...a) => { try { console.log('[pp]', ...a); } catch (e) {} };
  try { window.resizeTo = function () {}; window.moveTo = function () {}; window.resizeBy = function () {}; } catch (e) {}
  if (!window.__ppTopBar) {
    window.__ppTopBar = true;
    try {
      const bar = document.createElement('div');
      bar.id = 'pp-top-bar';
      bar.style.cssText = 'position:fixed;top:0;right:0;z-index:99999;display:flex;gap:3px;padding:5px;' +
        'background:rgba(0,0,0,0.45);border-bottom-left-radius:8px;';
      const mkBtn = (label, title, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.style.cssText = 'width:36px;height:26px;border:none;border-radius:5px;color:#fff;' +
          'font:16px/1 Segoe UI;cursor:pointer;background:rgba(255,255,255,0.18);';
        b.addEventListener('click', fn);
        return b;
      };
      const closeBtn = mkBtn('', 'Close', () => { try { window.__ppWin && window.__ppWin.close(); } catch (e) {} });
      closeBtn.id = 'pp-close-btn';
      closeBtn.style.cssText += 'width:auto;min-width:26px;padding:2px 6px;font-size:15px;text-align:center;';
      bar.appendChild(closeBtn);
      document.body.appendChild(bar);
      const updateChannel = () => {
        try {
          const ch = window.App && App.playerScreen && App.playerScreen.getChannel ? App.playerScreen.getChannel() : null;
          const num = (ch && ch.number !== undefined && ch.number !== null) ? String(ch.number) : '';
          if (closeBtn.textContent !== num) closeBtn.textContent = num;
        } catch (e) {}
      };
      updateChannel();
      setInterval(updateChannel, 1000);
      log('top-bar installed');
    } catch (e) {}
  }
  if (!window.__ppWheelMapped) {
    window.__ppWheelMapped = true;
    let lastNav = 0;
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const A = window.App;
      if (!A || !A.display) return;
      let screenName = '';
      try { screenName = A.display.getCurrentScreenName ? A.display.getCurrentScreenName() : ''; } catch (err) {}
      if (screenName === 'player') return;
      if (Math.abs(e.deltaY) < 1) return;
      const now = Date.now();
      if (now - lastNav < 150) return;
      lastNav = now;
      try {
        if (e.deltaY < 0) A.display.keyDown('up');
        else A.display.keyDown('down');
      } catch (err) {}
    }, { capture: true, passive: false });
    log('wheel-menu-map installed');
  }
  if (!window.__ppGamepadMapped) {
    window.__ppGamepadMapped = true;
    let gpadId = null;
    const prev = { nav: null, rk: null, btn: {} };
    let lastNavRepeat = 0;
    let lastRkRepeat = 0;
    const NAV_REPEAT = 220;
    const BTN_MAP = [
      [0, 'enter'], [1, 'back'], [2, 'info'], [3, 'menu'],
      [4, 'ch_minus'], [5, 'ch_plus'], [6, 'red'], [7, 'blue'],
      [8, 'exit'], [9, 'menu'], [10, 'pause'], [11, 'stop']
    ];
    const fire = (name) => { try { const A = window.App; if (A && A.display) A.display.keyDown(name); } catch (e) {} };
    setInterval(() => {
      let g = null;
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { g = pads[i]; break; } }
      } catch (e) {}
      if (!g) return;
      if (gpadId !== g.id) { gpadId = g.id; log('gamepad connected:', g.id); }
      const now = Date.now();
      for (let i = 0; i < BTN_MAP.length; i++) {
        const idx = BTN_MAP[i][0], key = BTN_MAP[i][1];
        const b = g.buttons[idx];
        if (!b) continue;
        const pressed = !!b.pressed;
        if (pressed && !prev.btn[idx]) fire(key);
        prev.btn[idx] = pressed;
      }
      let nav = null;
      if (g.buttons[12] && g.buttons[12].pressed) nav = 'up';
      else if (g.buttons[13] && g.buttons[13].pressed) nav = 'down';
      else if (g.buttons[14] && g.buttons[14].pressed) nav = 'left';
      else if (g.buttons[15] && g.buttons[15].pressed) nav = 'right';
      if (!nav) {
        const lx = g.axes[0] || 0, ly = g.axes[1] || 0;
        if (Math.abs(ly) > 0.5 || Math.abs(lx) > 0.5) {
          nav = Math.abs(ly) >= Math.abs(lx) ? (ly < 0 ? 'up' : 'down') : (lx < 0 ? 'left' : 'right');
        }
      }
      if (nav) {
        if (prev.nav !== nav || now - lastNavRepeat > NAV_REPEAT) { lastNavRepeat = now; fire(nav); }
        prev.nav = nav;
      } else { prev.nav = null; lastNavRepeat = 0; }
      const rx = g.axes[2] || 0;
      const rk = rx > 0.5 ? 'fast_fwd' : (rx < -0.5 ? 'fast_rew' : null);
      if (rk) {
        if (prev.rk !== rk || now - lastRkRepeat > NAV_REPEAT) { lastRkRepeat = now; fire(rk); }
        prev.rk = rk;
      } else { prev.rk = null; lastRkRepeat = 0; }
    }, 60);
    log('gamepad-map installed');
  }
  try {
    if (window.__ppGpu) {
      window.__ppGpu().then((s) => log('GPU status:', JSON.stringify(s))).catch(() => {});
    }
  } catch (e) {}
  const S = { cur: null, prevAudioCodec: null, prevMode: null, lastReinit: 0, lastReload: 0, lastSwitch: 0,
              silentSince: 0, silentReinitDone: false, stallSince: 0,
              lastVideoTime: null, videoProgressAt: 0, archiveFreezeSince: 0, archiveFreezeReinitDone: false,
              freezeRestartAt: 0,
              ctx: null, srcNode: null, analyser: null, boundVideo: null, graphFail: false };
  const SND_THRESHOLD = 0.001;
  const SILENT_SOFT_AFTER = 2000;
  const SILENT_RELOAD_AFTER = 10000;
  const SWITCH_WINDOW = 12000;
  const STALL_RELOAD_AFTER = 8000;
  const ARCHIVE_FREEZE_AFTER = 5000;
  function ensureAudioGraph() {
    if (S.graphFail) {
      const v = document.getElementById('player-object');
      if (v && v !== S.boundVideo) S.graphFail = false; else return;
    }
    const v = document.getElementById('player-object');
    if (!v) return;
    if (S.boundVideo === v && S.analyser) return;
    try { if (S.srcNode) S.srcNode.disconnect(); } catch (e) {}
    try { if (S.ctx) S.ctx.close(); } catch (e) {}
    S.ctx = null; S.srcNode = null; S.analyser = null; S.boundVideo = v;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { S.graphFail = true; return; }
      const ctx = new AC();
      const src = ctx.createMediaElementSource(v);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      an.connect(ctx.destination);
      S.ctx = ctx; S.srcNode = src; S.analyser = an;
      ctx.resume().catch(() => {});
      log('audio-graph bound');
    } catch (e) {
      log('audio-graph failed:', e && e.message);
      S.graphFail = true;
    }
  }
  function measureRms() {
    if (!S.analyser || !S.ctx) return null;
    try {
      if (S.ctx.state !== 'running') { S.ctx.resume().catch(() => {}); return null; }
      const buf = new Float32Array(S.analyser.fftSize);
      S.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    } catch (e) { return null; }
  }
  function softReinit(reason) {
    if (Date.now() - S.lastReinit < 3000) return;
    S.lastReinit = Date.now();
    S.lastSwitch = Date.now();
    log('SOFT-REINIT:', reason);
    ${SOFT_REINIT};
  }
  function hardReload(reason) {
    if (Date.now() - S.lastReload < 60000) return;
    S.lastReload = Date.now();
    log('HARD-RELOAD:', reason);
    location.reload();
  }
  setInterval(() => {
    const A = window.App;
    if (!A || !A.device) return;
    const D = A.device;
    if (!D.__ppVolLock) {
      D.__ppVolLock = true;
      try {
        D.getVolume = function () { return 100; };
        D.setVolume = function () {};
        if (A.settings && typeof A.settings.setVolume === 'function') A.settings.setVolume = function () {};
      } catch (e) {}
    }
    try { ${PLAY_WRAP}; } catch (e) {}
    try { ${VLC_WRAP}; } catch (e) {}
    const h = D.hls;
    if (h && h !== S.cur) {
      S.cur = h;
      S.lastSwitch = Date.now();
      h.on(Hls.Events.ERROR, (e, d) => {
        if (!d.fatal) return;
        const m = window.App && window.App.player && window.App.player.getMode();
        if (!modeIsTv(m)) return;
        const bad = d.type === Hls.ErrorTypes.MEDIA_ERROR ||
                    d.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR;
        if (bad) softReinit('hls:' + d.details);
      });
    }
    let mode = null, ac = '';
    try {
      mode = A.player && A.player.getMode();
      ac = h && h.levels && h.levels.length ? (h.levels[0].audioCodec || '') : '';
      if (modeIsTv(mode) && S.prevMode !== null && S.prevMode !== mode && S.prevAudioCodec && ac && ac !== S.prevAudioCodec) {
        S.prevAudioCodec = ac; S.prevMode = mode;
        softReinit('codec:' + S.prevAudioCodec + '->' + ac);
        return;
      }
      if (S.prevMode !== null && S.prevMode !== mode) S.lastSwitch = Date.now();
      if (ac) S.prevAudioCodec = ac;
      S.prevMode = mode;
    } catch (e) {}
    const vlcOn = !!(window.__ppVlcEnabled && modeIsTv(mode));
    try {
      const v = document.getElementById('player-object');
      const nearSwitch = Date.now() - S.lastSwitch < SWITCH_WINDOW;
      if (vlcOn || !v || !modeIsTv(mode) || !nearSwitch || v.readyState >= 2) { S.stallSince = 0; }
      else {
        if (!S.stallSince) S.stallSince = Date.now();
        else if (Date.now() - S.stallSince > STALL_RELOAD_AFTER) hardReload('stream-not-loading');
      }
    } catch (e) {}
    try {
      const v = document.getElementById('player-object');
      const archive = mode === 1 || mode === 4;
      if (vlcOn || !archive || !v || v.paused || v.readyState < 3 || v.seeking) {
        S.lastVideoTime = null; S.videoProgressAt = 0; S.archiveFreezeSince = 0; S.archiveFreezeReinitDone = false;
      } else {
        const now = Date.now(), t = Number(v.currentTime);
        if (!Number.isFinite(t)) S.archiveFreezeSince = 0;
        else if (S.lastVideoTime === null || Math.abs(t - S.lastVideoTime) > 0.08) {
          S.lastVideoTime = t; S.videoProgressAt = now; S.archiveFreezeSince = 0; S.archiveFreezeReinitDone = false;
        } else {
          if (!S.archiveFreezeSince) S.archiveFreezeSince = S.videoProgressAt || now;
          if (!S.archiveFreezeReinitDone && now - S.archiveFreezeSince >= ARCHIVE_FREEZE_AFTER) {
            S.archiveFreezeReinitDone = true;
            S.freezeRestartAt = Date.now();
            S.silentSince = 0;
            S.silentReinitDone = false;
            softReinit('archive-frame-frozen:' + t.toFixed(2));
          }
        }
      }
    } catch (e) {}
    try {
      const v = document.getElementById('player-object');
      if (vlcOn || !v || !modeIsTv(mode) || v.paused || v.readyState < 3) { S.silentSince = 0; return; }
      ensureAudioGraph();
      const rms = measureRms();
      if (rms === null) return;
      if (rms < SND_THRESHOLD) {
        if (!S.silentSince) { S.silentSince = Date.now(); S.silentReinitDone = false; return; }
        const silentMs = Date.now() - S.silentSince;
        const nearSwitch = Date.now() - S.lastSwitch < SWITCH_WINDOW;
        if (!S.silentReinitDone && silentMs > SILENT_SOFT_AFTER && nearSwitch) {
          S.silentReinitDone = true;
          softReinit('silent:' + rms.toFixed(5));
        } else if (S.silentReinitDone && silentMs > SILENT_RELOAD_AFTER && nearSwitch) {
          hardReload('silent-after-reinit');
        }
      } else {
        if (S.silentSince && Date.now() - S.silentSince > 1500) {
          log('audio OK after ' + ((Date.now() - S.silentSince) / 1000).toFixed(1) + 's of silence');
        }
        S.silentSince = 0;
        S.silentReinitDone = false;
      }
    } catch (e) {}
    try {
      const v = document.getElementById('player-object');
      if (S.freezeRestartAt && !vlcOn && v && !v.paused && v.readyState >= 3 && modeIsTv(mode)) {
        ensureAudioGraph();
        const rms = measureRms();
        if (rms !== null && rms >= SND_THRESHOLD) {
          S.freezeRestartAt = 0;
        } else if (rms !== null && Date.now() - S.freezeRestartAt > 8000 && Date.now() - S.lastReinit > 5000) {
          S.freezeRestartAt = 0;
          hardReload('no-audio-after-freeze-restart');
        }
      }
    } catch (e) {}
  }, 1000);
  try {
    window.__ppDiag = () => {
      const A = window.App; const v = document.getElementById('player-object');
      const h = A && A.device && A.device.hls;
      return {
        watcher: true,
        playWrapped: !!(A && A.device && A.device.__ppPlayWrapped),
        mode: A && A.player ? A.player.getMode() : null,
        readyState: v ? v.readyState : null,
        paused: v ? v.paused : null,
        volume: v ? v.volume : null,
        muted: v ? v.muted : null,
        src: v && v.src ? String(v.src).slice(0, 60) : null,
        hlsUrl: h && h.url ? String(h.url).slice(0, 120) : null,
        audioCodec: h && h.levels && h.levels.length ? h.levels.map((l) => l.audioCodec) : [],
        videoCodec: h && h.levels && h.levels.length ? h.levels[0].videoCodec : null,
        audioTracks: h && h.audioTracks ? h.audioTracks.map((t) => ({ id: t.id, type: t.type, codec: t.codec })) : [],
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        dpr: window.devicePixelRatio,
        screenW: window.screen ? window.screen.width : null,
        screenH: window.screen ? window.screen.height : null,
        bodyRect: (() => { try { const r = document.body.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; } catch (e) { return null; } })(),
        bodyTransform: (() => { try { return getComputedStyle(document.body).transform; } catch (e) { return null; } })(),
        bodyScale: (() => { try { return document.body.classList.contains('scale'); } catch (e) { return null; } })()
      };
    };
  } catch (e) {}
  return 'watcher-installed-v3';
})()`;

function findVlc() {
  const candidates = [
    'C:/Program Files/VideoLAN/VLC/vlc.exe',
    'C:/Program Files (x86)/VideoLAN/VLC/vlc.exe',
    (process.env.LOCALAPPDATA || '') + '/Programs/VLC/vlc.exe'
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

let vlcChild = null;
let vlcWasFullscreen = true;

function restoreWindow(win) {
  if (win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
    if (vlcWasFullscreen && !win.isFullScreen()) win.setFullScreen(true);
  } catch (e) {}
}

const VLC_PAUSE = `(() => { try { window.App && App.player && App.player.pause(); return 'paused'; } catch (e) { return 'err'; } })()`;
const VLC_RESUME = `(() => { try { window.App && App.player && App.player.resume(); return 'resumed'; } catch (e) { return 'err'; } })()`;

async function openInVlc(win) {
  const vlc = findVlc();
  if (!vlc) { console.log('open-in-vlc: VLC not found'); return; }
  if (vlcChild && !vlcChild.killed) {
    try { vlcChild.kill(); } catch (e) {}
    vlcChild = null;
    win.webContents.executeJavaScript(VLC_RESUME).catch(() => {});
    restoreWindow(win);
    console.log('open-in-vlc: VLC closed, app resumed');
    return;
  }
  await win.webContents.executeJavaScript(VLC_PAUSE).catch(() => {});
  vlcWasFullscreen = win.isFullScreen();
  try { if (win.isFullScreen()) win.setFullScreen(false); } catch (e) {}
  try { win.minimize(); } catch (e) {}
  const snippet = `
    (() => new Promise((resolve) => {
      const A = window.App;
      if (!A || !A.player || !A.device) return resolve(null);
      try {
        A.player.requestActualStreamUrl(false, false, () => resolve(A.player.getStreamUrl() || null));
      } catch (e) {
        resolve((A.device.hls && A.device.hls.url) || null);
      }
    }))()`;
  const url = await win.webContents.executeJavaScript(snippet).catch(() => null);
  if (!url) { console.log('open-in-vlc: no stream url'); return; }
  try {
    const child = spawn(vlc, ['--no-video-title-show', '--fullscreen', url], { stdio: 'ignore' });
    vlcChild = child;
    child.on('exit', () => {
      if (vlcChild === child) vlcChild = null;
      if (!win.isDestroyed()) {
        win.webContents.executeJavaScript(VLC_RESUME).catch(() => {});
        restoreWindow(win);
      }
    });
    console.log('open-in-vlc:', String(url).slice(0, 140));
  } catch (e) {
    console.log('open-in-vlc failed:', e && e.message);
    vlcChild = null;
  }
}

let taskbarTray = null;
let taskbarLib = null;
function setTaskbar(show) {
  try {
    if (!taskbarLib) taskbarLib = require('koffi').load('user32.dll');
    const FindWindowA = taskbarLib.func('void *FindWindowA(const char *, const char *)');
    const ShowWindow = taskbarLib.func('int ShowWindow(void *, int)');
    if (show) {
      if (taskbarTray) { ShowWindow(taskbarTray, 5); taskbarTray = null; }
    } else {
      const h = FindWindowA('Shell_TrayWnd', null);
      if (h) { ShowWindow(h, 0); taskbarTray = h; }
    }
  } catch (e) {}
}

function createMainWindow() {
  let fsFullscreen = true;
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    useContentSize: true,
    frame: false,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#00000000',
    transparent: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const fitToDisplay = () => {
    if (win.isDestroyed()) return;
    try {
      const d = screen.getDisplayMatching(win.getBounds()).bounds;
      win.setContentSize(d.width, d.height);
      win.setPosition(d.x, d.y);
    } catch (e) {}
  };
  win.once('ready-to-show', () => {
    try {
      if (win.isMinimized()) win.restore();
      const d = screen.getDisplayMatching(win.getBounds()).bounds;
      win.setContentSize(d.width, d.height);
      win.setPosition(d.x, d.y);
      fsFullscreen = true;
    } catch (e) {}
    if (!win.isVisible()) win.show();
    try { setTaskbar(false); } catch (e) {}
    fitToDisplay();
  });
  let fitTries = 0;
  const fitLoop = setInterval(() => {
    fitToDisplay();
    if (++fitTries >= 8) clearInterval(fitLoop);
  }, 2000);
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 8000);

  win.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
  );
  if (settings.portal_url) {
    win.loadURL(settings.portal_url).catch(() => {});
  }

  win.webContents.on('did-finish-load', () => {
    try {
      if (fsFullscreen) {
        const d = screen.getDisplayMatching(win.getBounds()).bounds;
        win.setContentSize(d.width, d.height);
        win.setPosition(d.x, d.y);
      }
    } catch (e) {}
    try {
      if (vlcEngine) {
        const st = vlcEngine.status();
        win.webContents.executeJavaScript('window.__ppVlcEnabled=' + (st && st.ready ? 'true' : 'false') + ';').catch(() => {});
      }
    } catch (e) {}
    win.webContents.executeJavaScript(WATCHER)
      .then((r) => console.log('watcher:', r))
      .catch((e) => console.log('watcher failed:', e && e.message));
  });

  async function restoreSound() {
    win.webContents.setAudioMuted(false);
    const r = await win.webContents.executeJavaScript(SOFT_REINIT).catch(() => 'execute-failed');
    console.log('soft-reinit:', r);
  }

  win.webContents.on('did-fail-load', (_event, code, description) => {
    const lang = settings.language === 'ru';
    const body = lang
      ? 'Не удалось открыть портал (' + code + '): ' + description + '<br><br>Проверьте подключение к сети и нажмите Ctrl+R.'
      : 'Failed to open portal (' + code + '): ' + description + '<br><br>Check your network connection and press Ctrl+R.';
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<body style="margin:0;background:#111;color:#eee;font:20px Segoe UI;padding:32px">${body}</body>`
    )}`).catch(() => {});
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (['-', '=', '_', '+'].includes(input.key)) {
      event.preventDefault();
      return;
    }
    if (input.code === 'AltLeft') {
      event.preventDefault();
      return;
    }
    if (input.code === 'F11') {
      fsFullscreen = !fsFullscreen;
      try {
        const d = screen.getDisplayMatching(win.getBounds());
        win.setBounds(fsFullscreen ? d.bounds : d.workArea);
        try { setTaskbar(fsFullscreen ? false : true); } catch (e2) {}
        try { if (vlcEngine && vlcEngine.setRect) vlcEngine.setRect(1, 1, 100, 100); } catch (e3) {}
      } catch (e) {}
      event.preventDefault();
    }
    if (input.control && input.code === 'KeyQ') {
      app.quit();
      event.preventDefault();
    }
    if (input.code === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.code === 'F8') {
      restoreSound();
      event.preventDefault();
    }
    if (input.code === 'F9') {
      openInVlc(win);
      event.preventDefault();
    }
    if (input.control && input.code === 'KeyR') {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  win.on('closed', () => app.quit());
  try {
    if (process.env.USE_VLC !== '0') {
      vlcEngine = require('./vlc-engine');
      const vlcOk = vlcEngine.init(win);
      console.log('[vlc] engine:', vlcOk ? 'enabled' : 'disabled');
      win.webContents.executeJavaScript('window.__ppVlcEnabled=' + (vlcOk ? 'true' : 'false') + ';').catch(() => {});
    }
  } catch (e) {
    console.log('[vlc] engine init error:', e && e.message);
  }
  return win;
}

function createSetupWindow() {
  const d = screen.getPrimaryDisplay().bounds;
  const win = new BrowserWindow({
    width: d.width,
    height: d.height,
    useContentSize: true,
    frame: false,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.code === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  win.on('closed', () => {
    if (setupWindow === win) setupWindow = null;
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SETUP_HTML)).catch(() => {});
  return win;
}

app.whenReady().then(() => {
  try {
    ipcMain.handle('gpu:status', () => {
      try { return app.getGPUFeatureStatus(); } catch (e) { return { error: String(e && e.message) }; }
    });
  } catch (e) {}
  try {
    ipcMain.on('win:ctrl', (e, cmd) => {
      try {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (!win) return;
        if (cmd === 'minimize') win.minimize();
        else if (cmd === 'close') app.quit();
      } catch (err) {}
    });
  } catch (e) {}
  try {
    ipcMain.on('display:get', (e) => {
      try {
        const d = screen.getPrimaryDisplay();
        e.returnValue = { w: d.bounds.width, h: d.bounds.height };
      } catch (err) {
        e.returnValue = { w: 1920, h: 1080 };
      }
    });
  } catch (e) {}
  try {
    ipcMain.on('profile:get', (e) => {
      e.returnValue = {
        mac_address: settings.mac_address,
        serial_number: settings.serial_number,
        device_model: settings.device_model,
        firmware_version: settings.firmware_version,
        app_version: settings.app_version,
        server_version: settings.server_version
      };
    });
  } catch (e) {}
  try {
    ipcMain.on('setup:save', (e, cfg) => {
      if (!saveSettings(cfg)) return;
      createMainWindow();
      if (setupWindow && !setupWindow.isDestroyed()) {
        setupWindow.destroy();
        setupWindow = null;
      }
    });
  } catch (e) {}
  try { console.log('GPU status:', JSON.stringify(app.getGPUFeatureStatus())); } catch (e) {}
  Menu.setApplicationMenu(null);
  const ok = loadSettings();
  if (ok) {
    createMainWindow();
  } else {
    setupWindow = createSetupWindow();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (loadSettings()) createMainWindow();
      else setupWindow = createSetupWindow();
    }
  });
});

app.on('before-quit', () => {
  try { BrowserWindow.getAllWindows().forEach((w) => { try { w.destroy(); } catch (e) {} }); } catch (e) {}
});
app.on('will-quit', () => {
  try { setTaskbar(true); } catch (e) {}
  try { if (vlcChild && !vlcChild.killed) vlcChild.kill(); } catch (e) {}
  try { vlcEngine && vlcEngine.dispose && vlcEngine.dispose(); } catch (e) {}
});

app.on('window-all-closed', () => {
  if (BrowserWindow.getAllWindows().length === 0) app.quit();
});
