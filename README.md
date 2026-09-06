# Nightscout Overlay

A tiny transparent glucose readout that floats above every other window, including games and
fullscreen apps. It reads from **your own Nightscout site** and shows the current value, trend
arrow, change since the last reading, how old the reading is, and a mini graph of the last few hours.

- Always on top, frameless, transparent. Drag it anywhere, resize from the corner. Position and size are remembered.
- Colour-coded by range (green in range, amber low/high, pulsing red urgent, grey when stale).
- A Rocket League style **rank** for your control over the last 3 days: Bronze I up to Supersonic Legend, 20 ranks, with the game's rank icons. Time in range decides the rank; the ladder is yours to tune, and you can drop in your own icons.
- Four looks: frosted glass (Windows 11 acrylic, the default there), dark card, light card, or text only. A soft outline keeps the text readable on any background when the card is see-through.
- Gentle alerts for low, high, urgent and missing data: a soft chime and an **I see it** button on the overlay. Replays once every 30 minutes for as long as the reading stays out of range, and comes through straight away if things get worse.
- Click-through mode so it never gets in the way of what is underneath.
- mg/dL or mmol/L, either from your site or forced.
- Runs in the system tray. Nothing else. No accounts, no telemetry, no server in the middle.
- Updates itself. Installed builds fetch new releases from GitHub in the background and apply them on restart.
- Windows, macOS and Linux.

## Install

Grab the latest build from the [Releases](../../releases) page:

| OS | File |
|----|------|
| Windows | `Nightscout Overlay-Setup-x.y.z-win-x64.exe` (installer) or `Nightscout Overlay-Portable-x.y.z-win-x64.exe` (no install, just run it) |
| macOS | `Nightscout Overlay-x.y.z-mac-*.dmg` |
| Linux | `Nightscout Overlay-x.y.z-linux-x86_64.AppImage` |

The builds are not code-signed, so Windows SmartScreen and macOS Gatekeeper will complain the first time.
On Windows click **More info** then **Run anyway**. On macOS run
`xattr -dr com.apple.quarantine "/Applications/Nightscout Overlay.app"` once, or right-click the app and choose Open.

## Set up

1. Start the app. The settings window opens on first run.
2. Enter your Nightscout URL, for example `https://mysite.example.com`.
3. If your site needs a login to read data, add an access token:
   Nightscout menu (hamburger) -> **Admin tools** -> **Add new subject**, give it the role `readable`,
   save, then copy the token that looks like `viewer-abc123...`. Paste it into the token field.
   If your site is readable without logging in, leave it blank.
4. Click **Test connection**, then **Save & close**.

## Using it

| Action | How |
|--------|-----|
| Move | drag the overlay |
| Resize | drag the bottom-right corner, `Ctrl+scroll` over it, or the Size slider in settings. It can grow until it fills the monitor it is on |
| Menu | right-click the overlay, click the `...` that appears on hover, or right-click the tray icon |
| Click-through on/off | `Ctrl+Alt+G` (`Cmd+Alt+G` on Mac) |
| Hide / show | `Ctrl+Alt+H`, or left-click the tray icon |
| Settings | `Ctrl+Alt+S` |
| Quit | tray menu -> Quit |

When an alert fires, the card glows, plays a short two-note chime at low volume, and shows an **I see it**
button. Clicking it hides the bar. While the reading stays out of range the alert replays once every
30 minutes (configurable), whether you dismissed it or not: dismissed, the bar comes back with a chime;
not dismissed, the bar stays and the chime repeats. If it gets worse, for example low turns into urgent
low, the alert comes through straight away. Back in range resets everything. Settings lets you pick the sound (soft chime, bell, beep, your own audio file, or silent), the volume,
which conditions alert, the replay interval, quiet hours with no sound, whether the border pulses,
and whether a system notification is shown too. A test button per condition shows and plays exactly
what that alert will look and sound like. Alerts always take the mouse, even in click-through mode,
so the button can be clicked.

In click-through mode the mouse passes straight through the overlay. Use the shortcut or the tray
menu to turn it off again.

**Rank.** Time in range over the last 3 days is placed on the Rocket League ladder: Bronze I, II, III,
Silver I to III, Gold, Platinum, Diamond, Champion I to III, Grand Champion, Supersonic Legend. Two
numbers in Settings shape it: where Silver I starts (default 45%) and where Supersonic Legend starts
(default 97%); the 16 ranks in between are spread evenly, and Bronze II and III sit 10 and 5 points
below Silver I. The row shows just the icon and rank name; hovering it shows your time in range and what the next
rank needs. A Preview picker shows any rank on the overlay, and you can point the app at a folder of your own icons named `bronze-1` ... `champion-3`,
`grand-champion`, `supersonic-legend` (.png/.svg/.webp/.jpg). The rank refreshes hourly and needs
about five hours of readings before it shows.

The built-in rank icons are the 16px Rocket League rank set from [tsicons.com](https://tsicons.com/detail/rocket-league-rank-icons-16x16),
via [this gist](https://gist.github.com/armollica/2d03767d66218066680493b1f16cb21f). They are small (16px), so they are
shown smooth at normal sizes and as crisp pixel art when the overlay is large; drop higher-resolution
files into your own icon folder if you have them. Rocket League and its
rank artwork belong to Psyonix / Epic Games; they are used here as fan content. Supersonic Legend has no
icon in that set, so a drawn badge stands in for it.

**Look.** Settings has a Look picker. *Frosted glass* uses Windows 11 acrylic so the card blurs whatever
is behind it and stays readable over white pages and dark games alike; it is the default on Windows 11.
*Dark card* and *Light card* are flat, and *No card* shows only the readout. When the card opacity is low,
an outline is added around the text and graph automatically so they still read on any backdrop; the
Text outline setting forces it always on or off.

Settings live in a plain JSON file. The path is shown at the bottom of the settings window.

## Run from source

```bash
npm install
npm run icons   # regenerates assets/*.png, only needed if you change the icon script
npm start
```

## Build installers

```bash
npm run dist:win     # or dist:mac / dist:linux, must run on that OS
```

Output goes to `dist/`.

On Windows, electron-builder needs permission to create symlinks while unpacking its code-signing helper,
so either turn on **Developer Mode** (Settings -> System -> For developers) or run the build from an
administrator terminal once. After that first run the cache is in place and a normal terminal works.

Pushing a tag like `v0.2.0` runs the GitHub Actions workflow in
`.github/workflows/release.yml`, which builds all three platforms and attaches them to a GitHub Release.

## Publishing an update

Every installed copy checks GitHub Releases about 15 seconds after launch and every 6 hours after that.
When a newer version exists it is downloaded in the background. Once it is ready a small bar appears
on the overlay with **Update** and **Later**. Update restarts into the new version right away; Later
hides the bar for a week (it comes back sooner if an even newer version appears). If you never press
anything, the update installs the next time you quit. The tray menu and the Settings window show the
same status. Portable builds cannot replace their own exe, so their bar offers **Download** instead.

The update is an in-place upgrade: the new installer runs silently over the existing install, so the
app keeps its folder, shortcuts, Start menu entry and all settings, and Windows still lists a single
"Nightscout Overlay". Nothing from the previous version is left behind. Installs under Program Files
ask for administrator approval at that moment.

To ship a new version:

```bash
npm run release:patch      # bumps 0.1.0 -> 0.1.1, commits, tags v0.1.1, pushes
```

Use `release:minor` for 0.1.x -> 0.2.0. The push of the tag triggers the release workflow, which builds
Windows, macOS and Linux and publishes a GitHub Release with the installers plus the `latest*.yml` files
that the updater reads. The release must be published (not a draft) for clients to see it; the workflow
does that automatically. Keep the GitHub repository public, or updates will not be reachable.

## How it works

Electron app. The main process polls `GET /api/v1/entries/sgv.json` on your site
(plus `/api/v1/status.json` once, for units and thresholds) and pushes a small payload to a
transparent, always-on-top `BrowserWindow`. Your token is only ever sent to the URL you entered.

- `src/main.js` window, tray, shortcuts, polling, IPC
- `src/nightscout.js` API client and the pure `buildPayload()` that turns entries into what is displayed
- `src/alerts.js` alert state machine (when to chime, repeat, snooze)
- `src/updater.js` auto-update via GitHub Releases
- `src/renderer/overlay.*` the overlay itself
- `src/renderer/settings.*` the settings window

## Disclaimer

This is a convenience display, not a medical device. Do not make treatment decisions from it.
Always confirm with your CGM app or meter.

## License

MIT
