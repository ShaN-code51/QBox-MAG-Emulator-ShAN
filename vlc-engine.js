const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let koffi = null;
try { koffi = require('koffi'); } catch (e) { koffi = null; }

const VLC_DIR = 'C:/Program Files/VideoLAN/VLC';
const vlcFile = (f) => path.join(VLC_DIR, f);

let lib = null;
let inst = null;
let mp = null;
let media = null;
let overlay = null;
let mainWin = null;
let zoom = 1.5;
let playing = false;
let lastRect = null;

function f(sig) { return lib.func(sig); }

function init(mainWindow) {
  mainWin = mainWindow;
  if (!koffi) { console.log('[vlc] koffi not available -> hls fallback'); return false; }
  if (!fs.existsSync(vlcFile('libvlc.dll'))) { console.log('[vlc] libvlc.dll not found -> hls fallback'); return false; }
  try {
    lib = koffi.load(vlcFile('libvlc.dll'));
    const version = f('const char *libvlc_get_version()')();
    console.log('[vlc] libvlc', version);
    const argv = ['vlc', '--no-video-title-show', '--quiet', '--avcodec-hw=any', null];
    inst = f('void *libvlc_new(int argc, const char *const *argv)')(argv.length - 1, argv);
    if (!inst) throw new Error('libvlc_new failed');
    mp = f('void *libvlc_media_player_new(void *p)')(inst);
    if (!mp) throw new Error('media_player_new failed');
    createOverlay();
    registerIpc();
    return true;
  } catch (e) {
    console.log('[vlc] init failed:', e && e.message, '-> hls fallback');
    return false;
  }
}

function createOverlay() {
  try { if (overlay && !overlay.isDestroyed()) overlay.destroy(); } catch (e) {}
  overlay = new BrowserWindow({
    width: 2,
    height: 2,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    alwaysOnTop: false,
    focusable: false,
    skipTaskbar: true,
    show: true,
    resizable: false,
    movable: false,
    enableLargerThanScreen: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  overlay.setIgnoreMouseEvents(true);
  const applyRect = () => { if (lastRect) setRect(lastRect.x, lastRect.y, lastRect.w, lastRect.h); };
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.on('move', applyRect);
    mainWin.on('resize', applyRect);
  }
  setRect(1, 1, 100, 100);
}

function setRect(x, y, w, h) {
  if (!overlay || overlay.isDestroyed() || !mainWin || mainWin.isDestroyed()) return;
  try {
    const cb = mainWin.getBounds();
    overlay.setPosition(cb.x, cb.y);
    overlay.setSize(cb.width, cb.height);
    if (!overlay.isVisible()) overlay.showInactive();
  } catch (e) {}
}

function setZoom(z) { if (z && z > 0) zoom = z; }

function play(url, posMs) {
  try {
    stopInternal();
    media = f('void *libvlc_media_new_location(void *p, const char *mrl)')(inst, String(url));
    if (!media) return false;
    f('void libvlc_media_player_set_media(void *p, void *m)')(mp, media);
    f('void libvlc_media_release(void *m)')(media);
    const hwndBuf = overlay.getNativeWindowHandle();
    const hwnd = hwndBuf && hwndBuf.length >= 8 ? hwndBuf.readBigUInt64LE(0) : hwndBuf;
    f('void libvlc_media_player_set_hwnd(void *p, void *hwnd)')(mp, hwnd);
    f('void libvlc_audio_set_volume(void *p, int volume)')(mp, 100);
    try { f('int libvlc_video_set_aspect_ratio(void *p, const char *ar)')(mp, '16:9'); } catch (e) {}
    f('void libvlc_media_player_play(void *p)')(mp);
    if (posMs > 0) {
      setTimeout(() => {
        try { f('void libvlc_media_player_set_time(void *p, int64_t ms)')(mp, BigInt(Math.round(posMs))); } catch (e) {}
      }, 1000);
    }
    playing = true;
    console.log('[vlc] play:', String(url).slice(0, 120));
    return true;
  } catch (e) {
    console.log('[vlc] play failed:', e && e.message);
    playing = false;
    return false;
  }
}

function stopInternal() {
  try { if (mp && playing) f('void libvlc_media_player_stop(void *p)')(mp); } catch (e) {}
  playing = false;
}

function pause() { try { if (mp && playing) f('void libvlc_media_player_pause(void *p)')(mp); } catch (e) {} }
function resume() { try { if (mp && playing) f('void libvlc_media_player_play(void *p)')(mp); } catch (e) {} }
function stop() { stopInternal(); }
function seekRel(ms) {
  try {
    if (!mp || !playing) return;
    const t = Number(f('int64_t libvlc_media_player_get_time(void *p)')(mp) || 0n);
    const next = Math.max(0, t + (Number(ms) || 0));
    f('void libvlc_media_player_set_time(void *p, int64_t ms)')(mp, BigInt(next));
  } catch (e) {}
}

function status() { return { ready: !!mp, playing }; }

function isPlaying() {
  try { return !!mp && Number(f('int libvlc_media_player_is_playing(void *p)')(mp)) > 0; } catch (e) { return false; }
}

function registerIpc() {
  try {
    ipcMain.removeHandler('vlc:play');
    ipcMain.removeHandler('vlc:status');
  } catch (e) {}
  ipcMain.handle('vlc:play', (ev, a) => play(a && a.url, (a && a.posMs) || 0));
  ipcMain.on('vlc:ctrl', (ev, c) => {
    if (c === 'pause') pause();
    else if (c === 'resume') resume();
    else if (c === 'stop') stop();
    else if (c && c.cmd === 'seekRel') seekRel(c.ms);
  });
  ipcMain.on('vlc:rect', (ev, r) => {
    if (!r) return;
    lastRect = { x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 0, h: Number(r.h) || 0 };
    setRect(lastRect.x, lastRect.y, lastRect.w, lastRect.h);
  });
  ipcMain.handle('vlc:status', () => status());
  ipcMain.handle('vlc:isPlaying', () => isPlaying());
}

function dispose() {
  try { stopInternal(); } catch (e) {}
  try { if (overlay && !overlay.isDestroyed()) overlay.destroy(); } catch (e) {}
  try { if (mp) f('void libvlc_media_player_release(void *p)')(mp); } catch (e) {}
  try { if (inst) f('void libvlc_release(void *p)')(inst); } catch (e) {}
  mp = null; inst = null; media = null; overlay = null;
}

module.exports = { init, play, pause, resume, stop, seekRel, setRect, setZoom, status, isPlaying, dispose };
