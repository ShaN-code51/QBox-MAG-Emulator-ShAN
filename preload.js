const { ipcRenderer } = require('electron');

let display = null;
try { display = ipcRenderer.sendSync('display:get'); } catch (e) {}
const displayW = (display && display.w) || 1920;
const displayH = (display && display.h) || 1080;

window.__ppWin = {
  minimize() { try { ipcRenderer.send('win:ctrl', 'minimize'); } catch (e) {} },
  close() { try { ipcRenderer.send('win:ctrl', 'close'); } catch (e) {} }
};

window.__ppGpu = () =>
  ipcRenderer.invoke('gpu:status').catch((e) => ({ error: String(e && e.message) }));

window.__ppVlc = {
  play(url, posMs) { return ipcRenderer.invoke('vlc:play', { url, posMs }).catch(() => false); },
  pause() { ipcRenderer.send('vlc:ctrl', 'pause'); },
  resume() { ipcRenderer.send('vlc:ctrl', 'resume'); },
  stop() { ipcRenderer.send('vlc:ctrl', 'stop'); },
  seekRel(ms) { ipcRenderer.send('vlc:ctrl', { cmd: 'seekRel', ms }); },
  rect(x, y, w, h) { ipcRenderer.send('vlc:rect', { x, y, w, h }); },
  status() { return ipcRenderer.invoke('vlc:status').catch(() => null); },
  isPlaying() { return ipcRenderer.invoke('vlc:isPlaying').catch(() => false); }
};

window.__ppSetup = {
  save(cfg) { try { ipcRenderer.send('setup:save', cfg); return true; } catch (e) { return false; } }
};

let profile = null;
try { profile = ipcRenderer.sendSync('profile:get'); } catch (e) {}
const mac = (profile && profile.mac_address) || '';
const serial = (profile && profile.serial_number) || '';
const model = (profile && profile.device_model) || '';
const firmware = (profile && profile.firmware_version) || '';
const appVersion = (profile && profile.app_version) || '';
const serverVersion = (profile && profile.server_version) || '';

const deviceProfile = {
  getDeviceType: model,
  getDeviceVersion: model,
  getDeviceModel: model,
  getSerialNumber: serial,
  getFirmwareVersion: firmware,
  getAppVersion: appVersion,
  getServerVersion: serverVersion,
  getMacAddress: mac,
  getDeviceUID: mac,
  getDisplayWidth: () => displayW,
  getDisplayHeight: () => displayH
};

function applyProfile(device) {
  if (!device || device.__ppQboxProfile) return;
  for (const [method, value] of Object.entries(deviceProfile)) {
    const fn = typeof value === 'function' ? value : () => value;
    try {
      Object.defineProperty(device, method, { configurable: true, value: fn });
    } catch (e) {
      device[method] = fn;
    }
  }
  try { Object.defineProperty(device, '__ppQboxProfile', { value: true }); } catch (e) {}
}

let deviceObject;
try {
  Object.defineProperty(window, 'Device', {
    configurable: true,
    get: () => deviceObject,
    set: (value) => {
      deviceObject = value;
      applyProfile(value);
    }
  });
} catch (e) {}

const timer = setInterval(() => applyProfile(window.Device), 20);
window.addEventListener('load', () => {
  applyProfile(window.Device);
  clearInterval(timer);
});
