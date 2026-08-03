const fs = require('fs');
const src = fs.readFileSync('main.js', 'utf8');
function extract(name) {
  const marker = 'const ' + name + ' = `';
  const start = src.indexOf(marker);
  const bodyStart = start + marker.length;
  return src.slice(bodyStart, src.indexOf('`;', bodyStart));
}
const softSrc = extract('SOFT_REINIT');
const wrapSrc = extract('PLAY_WRAP');
const vlcWrapSrc = extract('VLC_WRAP');
const watcherSrc = extract('WATCHER');

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  ok -', name); } else { fail++; console.log('  FAIL -', name); } }

function makePage(mode) {
  const calls = { destroy: 0, initPlayer: 0, requestActualStreamUrl: null, errorListeners: [], playCalls: [] };
  let replacedEl = null;
  const videoEl = {
    id: 'player-object',
    style: { cssText: 'top:0;width:100%;' },
    parentNode: { replaceChild: (nv) => { replacedEl = nv; } },
    removeAttribute() {}, load() {}, play() {}, pause() {}, currentTime: 0, src: ''
  };
  function HlsStub() {
    this.url = 'http://x/playlist.m3u8';
    this.levels = [{ audioCodec: 'mp4a.40.2', videoCodec: 'avc1' }];
    this.on = (ev, cb) => { calls.errorListeners.push({ ev, cb }); };
    this.destroy = () => { calls.destroy++; };
  }
  HlsStub.Events = { ERROR: 'error' };
  HlsStub.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  HlsStub.ErrorDetails = { MANIFEST_INCOMPATIBLE_CODECS_ERROR: 'manifestIncompatibleCodecsError' };
  const device = {
    hls: new HlsStub(),
    video: videoEl,
    play(url, live, restore, restorePos) { calls.playCalls.push({ url: String(url), live, restore, restorePos }); return 'played'; },
    initPlayer() { calls.initPlayer++; this.hls = new HlsStub(); },
    loadAudioTracksInfo() {}, onStreamInfoReady() {}, rewindAfterStreamInfoReady() {},
    onNetworkDisconnected() {}, onStreamNotFound() {}, onRenderError() {}, onStreamError() {},
    shiftPlaylist() { return false; },
    reconnectAttemptCount: 0
  };
  const player = {
    mode,
    getMode() { return this.mode; },
    getCurrentTime() { return 123; },
    setCurrentTime(v) { calls.setCurrentTime = v; },
    requestActualStreamUrl(a, b) { calls.requestActualStreamUrl = { a, b }; },
    getStreamUrl() { return 'http://x/stream.m3u8'; },
    play() { calls.playCount = (calls.playCount || 0) + 1; }
  };
  const wheelHandlers = [];
  const display = {
    _screenName: '',
    getCurrentScreenName() { return this._screenName; },
    keyDown(name) { (calls.keyDown = calls.keyDown || []).push(name); }
  };
  const App = { device, player, display };
  const window = {
    Device: device,
    App,
    Hls: HlsStub,
    addEventListener(type, cb) { if (type === 'wheel') wheelHandlers.push(cb); },
    document: {
      getElementById(id) { return replacedEl || videoEl; },
      createElement(tag) { return { id: tag, style: {} }; }
    }
  };
  return { window, calls, device, player, App, videoEl, wheelHandlers };
}

const makeRunner = (snippet) =>
  new Function('window', 'document', 'Hls', 'App', 'return (' + snippet + ');');

function installWatcher(page) {
  const cbs = [];
  const orig = global.setInterval;
  global.setInterval = (fn, ms) => { cbs.push(fn); return cbs.length; };
  makeRunner(watcherSrc
  .split('${SOFT_REINIT}').join(softSrc)
  .split('${PLAY_WRAP}').join(wrapSrc)
  .split('${VLC_WRAP}').join(vlcWrapSrc))(page.window, page.window.document, page.window.Hls, page.App);
  global.setInterval = orig;
  return () => { for (const c of cbs) c(); };
}

console.log('SOFT_REINIT:');
{
  const page = makePage(0);
  const r = makeRunner(softSrc)(page.window, page.window.document, page.window.Hls, page.App);
  check('live: device.play called', page.calls.playCalls.length === 1);
  check('live: no portal re-request', page.calls.requestActualStreamUrl === null);
  check('live: returns live-reloaded', typeof r === 'string' && r.indexOf('live-reloaded') === 0);
}
{
  const page = makePage(1);
  const r = makeRunner(softSrc)(page.window, page.window.document, page.window.Hls, page.App);
  check('archive: device.play called with same URL', page.calls.playCalls.length === 1 && page.calls.playCalls[0].url === 'http://x/playlist.m3u8');
  check('archive: live flag false', page.calls.playCalls.length === 1 && page.calls.playCalls[0].live === false);
  check('archive: returns archive-reloaded pos', typeof r === 'string' && r.indexOf('archive-reloaded pos=123') === 0);
}
{
  const page = makePage(2);
  const r = makeRunner(softSrc)(page.window, page.window.document, page.window.Hls, page.App);
  check('VOD mode: no replay', page.calls.playCalls.length === 0 && r === 'non-tv');
}

console.log('PLAY_WRAP:');
{
  const page = makePage(0);
  const r = makeRunner(wrapSrc)(page.window, page.window.document, page.window.Hls, page.App);
  check('installs and returns play-wrapped', r === 'play-wrapped');
  check('device flagged', page.device.__ppPlayWrapped === true);
  const oldHls = page.device.hls;
  const before = page.calls.playCalls.length;
  const pr = page.device.play('http://new/stream.m3u8', false, undefined, undefined);
  check('orig play called', page.calls.playCalls.length === before + 1);
  check('old hls destroyed', page.calls.destroy >= 1);
  check('fresh hls created', page.device.hls !== oldHls);
  check('video element replaced', page.device.video !== page.videoEl);
  check('replay returned', pr === 'played');
  check('idempotent', makeRunner(wrapSrc)(page.window, page.window.document, page.window.Hls, page.App) === 'already');
}
{
  const page = makePage(0);
  const r = makeRunner(wrapSrc)(page.window, page.window.document, page.window.Hls, page.App);
  page.device.hls.audioTrack = 2;
  page.device.play('http://x/arch.m3u8', false, true, 100);
  check('resumeRestart: media time kept', page.device.__ppResumeMediaTime === 100);
  check('resumeRestart: audio track not restored', page.device.__ppResumeAudioTrack === null);
  page.device.hls.audioTrack = 1;
  page.device.play('http://x/live.m3u8', true, undefined, undefined);
  check('live switch: audio track kept', page.device.__ppResumeAudioTrack === 1);
}

console.log('WATCHER:');
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  check('play-wrap installed by watcher', page.device.__ppPlayWrapped === true);
  check('hls ERROR listener attached', page.calls.errorListeners.length >= 1);
}
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  page.calls.playCalls.length = 0;
  page.calls.errorListeners[0].cb('e', { type: 'mediaError', details: 'manifestIncompatibleCodecsError', fatal: true });
  check('MEDIA_ERROR triggers reinit', page.calls.playCalls.length >= 1);
}
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  page.calls.playCalls.length = 0;
  page.calls.errorListeners[0].cb('e', { type: 'networkError', details: 'manifestLoadError', fatal: true });
  check('NETWORK_ERROR does NOT trigger reinit', page.calls.playCalls.length === 0);
}
{
  const page = makePage(2);
  const tick = installWatcher(page);
  tick();
  page.calls.playCalls.length = 0;
  page.calls.errorListeners[0].cb('e', { type: 'mediaError', details: 'fragParsingError', fatal: true });
  check('MEDIA_ERROR in VIDEO mode does NOT trigger reinit', page.calls.playCalls.length === 0);
}
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  page.player.mode = 1;
  page.device.hls.levels[0].audioCodec = 'mp3';
  page.calls.playCalls.length = 0;
  tick();
  check('codec change triggers reinit', page.calls.playCalls.length >= 1);
}
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  page.player.mode = 1;
  page.calls.playCalls.length = 0;
  tick();
  check('transition without codec change does NOT trigger reinit', page.calls.playCalls.length === 0);
}

console.log('INPUT MAPS:');
{
  const page = makePage(0);
  const tick = installWatcher(page);
  tick();
  check('wheel listener installed', page.wheelHandlers.length >= 1);
  const ev = (dy) => ({ deltaY: dy, preventDefault() {}, stopImmediatePropagation() {} });
  const h = page.wheelHandlers[0];
  const realNow = Date.now; let fakeNow = 0;
  Date.now = () => (fakeNow += 1000);
  page.App.display._screenName = 'tv';
  page.calls.keyDown = [];
  h.call(page.window, ev(-100));
  h.call(page.window, ev(100));
  Date.now = realNow;
  check('wheel in menu -> up', (page.calls.keyDown || []).includes('up'));
  check('wheel in menu -> down', (page.calls.keyDown || []).includes('down'));
  page.App.display._screenName = 'player';
  page.calls.keyDown = [];
  Date.now = () => (fakeNow += 1000);
  h.call(page.window, ev(-100));
  Date.now = realNow;
  check('wheel in player blocked', (page.calls.keyDown || []).length === 0);
}
{
  const page = makePage(0);
  const fakePad = { id: 'xbox-fake', connected: true, buttons: [], axes: [0, 0, 0, 0] };
  for (let i = 0; i < 16; i++) fakePad.buttons.push({ pressed: false });
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [fakePad] }, configurable: true });
  const tick = installWatcher(page);
  tick();
  page.calls.keyDown = [];
  fakePad.buttons[0].pressed = true;
  tick();
  check('gamepad A -> enter', page.calls.keyDown.includes('enter'));
  fakePad.buttons[0].pressed = false;
  tick();
  page.calls.keyDown = [];
  fakePad.buttons[12].pressed = true;
  tick();
  check('gamepad D-pad up -> up', page.calls.keyDown.includes('up'));
  fakePad.buttons[12].pressed = false;
  page.calls.keyDown = [];
  fakePad.axes[2] = 0.9;
  tick();
  check('gamepad right stick -> fast_fwd', page.calls.keyDown.includes('fast_fwd'));
  fakePad.axes[2] = 0;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
