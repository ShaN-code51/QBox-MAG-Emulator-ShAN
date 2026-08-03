# QBox.MAG Emulator ShAN

## Donate

If you find this app useful, consider a donation:

| Coin | Address |
|---|---|
| BTC | `1E9jzHK9C3zDGGmiiHmcU4spjRNZgXeCJQ` |
| USDT (TRC20) | `TMkLqQDgArrPGzov7ZKQFGXbBYWnxqvHt2` |

For Windows 10/11

Desktop emulator of QBox / MAG set-top boxes for OTT portals. It opens a
portal in a fullscreen window, presents itself to the portal as a set-top box
(QBox / MAG), and protects playback from common streaming issues: it restarts a
frozen archive stream at the same position, watches for missing audio after a
restart, and adds optional VLC decoding, mouse-wheel and gamepad navigation.

## First launch

On the first run a setup screen appears:

1. Choose a language — **English** or **Русский**.
2. **Required** block (bold labels with `*`):
   - `MAC address *` — device MAC address;
   - `Serial number *` — serial number;
   - `Portal URL *` — portal address;
   - `Device model *` — device model (e.g. `MAG254`).
3. **Optional** block (regular font, already pre-filled with common MAG values —
   keep them or enter your own):
   - `Firmware version`;
   - `App version`;
   - `Server version`.
4. Click **Save and launch** — the settings are saved and the portal opens.

If you clear an optional version field, it is filled back with the standard
values on save (`0.2.18-r23`, `5.0.16`, `5.2.1`).

## settings.txt

Settings are stored in `settings.txt` next to the executable (or in the
AppData folder if the directory is not writable). You can edit the file
manually and restart the app:

```
# QBox.MAG Emulator ShAN settings
# Enter your device MAC address, serial number, portal URL and device model.
# Version fields are optional - left empty they use common device values.
mac_address = 00:11:22:33:44:55
serial_number = YOUR_SERIAL
portal_url = http://your-portal.example/index.html
device_model = MAG254
firmware_version = 0.2.18-r23
app_version = 5.0.16
server_version = 5.2.1
language = en
```

> ⚠️ Do not publish this file — it contains your MAC address and serial number.

## Keys

Some keys are handled by the app itself, the rest emulate remote-control buttons
and are passed to the portal.

### ⚙️ 1. System keys (app)

| Key | Action |
|---|---|
| `F8` | Restore sound (restart the media player, archive position is kept) |
| `F9` | Open the current stream in external VLC |
| `F11` | Toggle fullscreen / window |
| `F12` | Developer tools (DevTools) |
| `Ctrl+R` | Reload the portal |
| `Ctrl+Q` | Quit the app |

### 🧭 2. Navigation

| Key | Action |
|---|---|
| `↑` / `PageUp` / `Tab` | Up |
| `↓` / `PageDown` | Down |
| `←` | Left |
| `→` | Right |
| `Enter` | OK / Select |
| `Backspace` | Back |
| `Esc` | Exit |
| `0`–`9` | Enter channel number |

### ▶️ 3. Player control

| Key | Action |
|---|---|
| `Space` | Pause / Resume |
| `Alt` (right) | Stop, return to Live |
| `.` | Next program |
| `,` | Previous program |
| `;` | Fast rewind |
| `'` | Fast forward |
| `[` | Previous channel |
| `]` | Next channel |
| `I` | Info |
| `Enter` | Infobar / player menu |

### 🔊 4. Sound

| Key | Action |
|---|---|
| `=` / `-` / `` ` `` | Disabled — volume is forced to 100% |

### 🎨 5. Color buttons

| Key | Action |
|---|---|
| `F1` | Red — Now/Archive (TV), Channels (player) |
| `F2` | Green — Search / Favorites (VOD) |
| `F3` | Yellow — List view / Favorites |
| `F4` | Blue — TV guide (EPG) |

### 🖥 6. Extra functions

| Key | Action |
|---|---|
| `F10` | TV screen |
| `A` | Aspect ratio |
| `M` | Main menu |
| `U` | Power |
| `L` | Virtual keyboard |

### 🩺 7. Diagnostics

| Key | Action |
|---|---|
| `F12` → `window.__ppDiag()` | Codec and player state info |
| `F12` → Console | View `[pp]` logs |
| `F8` | Manual sound restore |
| `F9` | Check the stream via VLC |

### 🚀 8. Most useful keys

| Key | Action |
|---|---|
| `F4` | EPG |
| `F8` | Restore sound |
| `F9` | Open the stream in VLC |
| `F10` | TV screen |
| `F11` | Fullscreen |
| `Ctrl+R` | Reload the portal |
| `Space` | Pause |
| `[` / `]` | Switch channels |
| `I` | Info |
| `Backspace` | Back |
| `Esc` | Exit |

Note: `F8` restores sound, the TV guide opens with `F4`.

## Gamepad and mouse wheel

**Mouse wheel:** in menus — up/down arrows; in the player — disabled (does not
switch channels).

**Xbox gamepad:**
- D-pad / left stick — navigation;
- `A` = OK, `B` = Back, `X` = Info, `Y` = Menu;
- `LB` / `RB` — channel −/+;
- `LT` / `RT` — red / blue;
- `Back` = Exit, `Start` = Menu;
- `L3` = Pause, `R3` = Stop;
- right stick — fast rewind / fast forward.

## VLC overlay

If VLC is installed, TV streams are decoded by libvlc in a native overlay
window instead of the in-page hls.js player. To disable, set the environment
variable `USE_VLC=0`.

## Build

```
pnpm install
pnpm dist
```

The portable executable is written to `dist/QBox.MAG Emulator ShAN.exe`.

## Layout

- `main.js` — main process, portal injections, first-launch setup and settings;
- `preload.js` — device profile and setup bridge;
- `vlc-engine.js` — optional VLC overlay;
- `scripts/` — logic tests for the injections.
