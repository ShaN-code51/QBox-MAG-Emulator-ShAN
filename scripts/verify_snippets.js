const fs = require('fs');
const src = fs.readFileSync('main.js', 'utf8');
function extract(name) {
  const marker = 'const ' + name + ' = `';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(name + ' marker not found');
  const bodyStart = start + marker.length;
  const end = src.indexOf('`;', bodyStart);
  if (end < 0) throw new Error(name + ' closing backtick not found');
  return src.slice(bodyStart, end);
}
const names = ['SOFT_REINIT', 'PLAY_WRAP', 'VLC_WRAP', 'WATCHER'];
const snips = {};
for (const n of names) {
  snips[n] = extract(n);
  if (n !== 'WATCHER') { new Function(snips[n]); console.log(n + ' syntax OK (' + snips[n].length + ' chars)'); }
}
const watcherCompiled = snips.WATCHER
  .split('${SOFT_REINIT}').join(snips.SOFT_REINIT)
  .split('${PLAY_WRAP}').join(snips.PLAY_WRAP)
  .split('${VLC_WRAP}').join(snips.VLC_WRAP);
new Function(watcherCompiled);
console.log('WATCHER (all embeds) syntax OK');
