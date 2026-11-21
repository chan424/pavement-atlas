# Pavement Atlas
### AI road and pavement condition survey: photos, live camera, map and register

**Live app:** https://chan424.github.io/pavement-atlas/ · RGUKT Ongole R&D

Pavement Atlas finds road damage (cracks and potholes) in road photos and in the **live phone camera**, lets a reviewer correct the result, saves location-aware survey records, shows them **on a map**, and exports the register. Everything runs in the browser from static files on GitHub Pages. Photos, notes and locations stay on the device. No server, API key or paid service is needed, and once installed it **works offline**.

---

## What's new in v2

| Area | What you get |
|---|---|
| **Live camera (real time)** | Rear camera on phones, camera switch, continuous detection in a background worker (frames are dropped while the model is busy, so the screen never freezes), live FPS and latency readout, coloured boxes with confidence, confidence slider, pause/resume, **Snapshot & save** into the register. |
| **GPS auto-log** | Turn on *Auto-log damage with GPS*: geotagged frames are saved automatically when damage is visible, at most once every N seconds and only after moving M metres (defaults 5 s and 20 m). |
| **Video analysis** | Pick a recorded video. It is checked moment by moment, with a coloured timeline of the worst damage found. Tap the timeline to jump there, and save any moment. |
| **Map** | Leaflet + OpenStreetMap. Each geotagged record is a dot coloured by its worst damage class. Its popup shows the photo, road and damage counts, with an *Open* button. Shows your live GPS position and a road condition summary. |
| **Dashboard** | Saved records, detections, geotagged share, potholes, damage mix by class, condition by road, recent activity and quick actions. |
| **Tutorial** | First-run guided tour with spotlight steps (skip anytime, replay from Help). A plain-English *How to use* page covering every task, the D00/D10/D20/D40 classes with real dataset examples, and limitations. |
| **Professional polish** | Responsive layout for phones and desktops (bottom navigation on phones), light/dark theme, toasts, loading states, model download progress, keyboard shortcuts, skip link, focus styles and reduced-motion support. |
| **Installable app (PWA)** | Web app manifest, PNG icons (including maskable) and a service worker. *Make available offline* stores the app shell, the 10.6 MB model and the 11 MB WebAssembly runtime on the device. |
| **Data safety** | The IndexedDB database is upgraded from version 1 to 2 in place, and existing records are kept and normalised. **Backup** (JSON with photos) and **Import** restore records on any device. |
| **Phone fix** | On phones narrower than 650 px, the survey desk's frame viewer used to collapse to zero height. The frame and detail lens are now stacked. |

All v1 features still work: survey desk, reference layer, detail lens, box review/editing, manual boxes, field register, route summary, CSV/GeoJSON/JSON exports, model study, attributions and licences.

## How to use it (field staff)

1. **Survey an image:** *Survey desk* → **Open road image** (or **Take photo** on a phone) → **Run detector** → move the **Confidence cutoff** slider.
2. **Live camera:** *Live camera* → **Start camera** → allow camera access → point at the road. Use **Snapshot & save** to keep a frame, or turn on **Auto-log damage with GPS**.
3. **Review boxes:** *Box review* → **Edit** to change the class or to accept or reject a box. **＋ Draw box** adds damage the model missed.
4. **Save:** enter the road name, tap **Use device location**, add notes, then **Save survey record**.
5. **Map:** *Map* shows located records. Red marks a pothole, orange alligator cracking, blue a transverse crack and green a longitudinal crack.
6. **Export:** *Field register* offers **CSV** (spreadsheets), **GeoJSON** (QGIS), **JSON**, **Backup** (with photos) and **Import**.

The in-app **Help (?)** page explains each step in simple English, and **Take the guided tour** replays the tour.

### Keyboard shortcuts
`1`–`7` switch views (Home, Survey desk, Live, Register, Map, Study, Help) · `R` run detector · `B` show/hide boxes · `D` draw box · `S` save record · `←`/`→` reference pages · `L` start/stop camera · `Space` pause live · `C` snapshot · `T` theme · `?` shortcut list · `Esc` close.

## Host and deploy (GitHub Pages)

The site is served from the **`docs/`** folder of the **`main`** branch.

1. On GitHub, open **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, select **main** and **/docs**, then **Save**.
2. Wait for the Pages deployment to finish (the *Actions* tab shows it). The app is at `https://chan424.github.io/pavement-atlas/`.
3. Camera and GPS need **https**. GitHub Pages provides it automatically.

### Update the app
- **In the browser:** open a file under `docs/` on GitHub → ✏️ *Edit* → *Commit changes*. Pages redeploys in about a minute.
- **With git:**
  ```sh
  git clone https://github.com/chan424/pavement-atlas.git
  cd pavement-atlas
  # edit files in docs/
  git add -A && git commit -m "Describe the change" && git push
  ```
- **Important:** after changing any app file, bump `VERSION` at the top of `docs/sw.js` (e.g. `pa-v2.0.1`). Installed apps then fetch the new files and show a *"new version ready → Reload"* message. The app always tries the network first, so online users get changes straight away.
- Regenerate `docs/assets/source.zip` (the footer's *Application source* link) when you change the source. Zip the `docs/` text files together with `README.md`, `LICENSE`, `scripts/` and `research/` from the previous archive.

### Preview locally
```sh
python -m http.server 8000 --directory docs
# open http://localhost:8000  (localhost counts as secure, so the camera works)
```
Opening `index.html` directly as a file does not work, because workers, the service worker and fetch need a web server.

### Automated checks used for this release
Headless Chrome with Playwright, at 1366×768 and 390×844, using Chromium's fake camera (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=road.y4m`, where the y4m was made from a dataset image with ffmpeg). The checks confirmed:
- no console errors
- detection on reference images, and box drawing and editing
- saving records and the v1 → v2 database migration
- all five exports, and Backup → Import in a fresh browser
- map markers and popups
- the full 14-step tour
- live mode at about 4 FPS (about 230 ms per frame, single-threaded WASM on a server CPU), with auto-log and snapshots
- video timeline analysis
- no horizontal overflow on any phone view

## Project layout

| Path | Contents |
|---|---|
| `docs/index.html` | All views: Dashboard, Survey desk, Live camera, Field register, Map, Model study, How to use |
| `docs/app.js` | Survey desk, register, exports, backup/import, routing |
| `docs/live.js` | Live camera, GPS auto-log, video analysis |
| `docs/mapview.js` | Leaflet map (loaded on demand from unpkg with SRI) and condition summary |
| `docs/home.js` | Dashboard |
| `docs/tour.js`, `docs/help.js` | Guided tour and help page |
| `docs/ui.js`, `docs/shared.js` | Theme, shortcuts, toasts, PWA install/offline, shared helpers |
| `docs/storage.js` | IndexedDB (schema v2 with migration) and preferences |
| `docs/study.js` | Model study page |
| `docs/sw.js`, `docs/manifest.webmanifest`, `docs/assets/icons/` | Installable offline app |
| `docs/model/` | ONNX weights, config, model card, decoder, inference worker, ONNX Runtime Web 1.20.1 (WASM) and licences |
| `docs/data/` | 16 RDD2022 India reference images, boxes, attribution and evaluation |

## Detector, results and limits

The release ships a public **YOLO11n** checkpoint by Vivek Vagale, trained on RDD2022 India, with 4 classes: **D00** longitudinal crack, **D10** transverse crack, **D20** alligator crack and **D40** pothole. It runs with ONNX Runtime Web in a module worker. The weights are SHA-256 verified before use.

| Release detector on its 775-frame India block test | Result |
|---|---:|
| mAP50 (101-point) | 0.402 |
| Precision / recall at confidence 0.25 | 0.643 / 0.421 |
| D00 / D10 / D20 / D40 AP50 | 0.351 / 0.144 / 0.687 / 0.426 |

- At the default cutoff, transverse cracks (D10) were never detected (0 of 8). A missing box does not mean the road is sound.
- Only visible surface distress is recorded. Depth, structure, length and repair urgency need site inspection. The condition bands (Good / Fair / Poor / Very poor) are indicative and are **not** a Pavement Condition Index.
- Live mode checks roughly 2–6 frames per second, depending on the phone, so fast driving can miss damage.
- **WebGPU:** the vendored runtime is the WASM-only build (`ort.wasm.min.mjs`), so the app uses WebAssembly even where the browser supports WebGPU. Swapping in ONNX Runtime Web's WebGPU bundle (`ort.webgpu.min.mjs` + its JSEP `.wasm`) and requesting `executionProviders: ['webgpu','wasm']` in `docs/model/inference-worker.mjs` would enable it. Re-verify the outputs if you do.
- Multi-threaded WASM needs cross-origin isolation, which GitHub Pages does not offer, so inference uses one thread.

Details: [Model card](docs/model/MODEL_CARD.md) · [Data attribution](docs/data/ATTRIBUTION.md). Katumala Sarala's five training runs are summarised in *Model study*. To deploy her checkpoint, follow the export steps in `scripts/export_student_model.py` (included in `docs/assets/source.zip`). Then copy the ONNX and its matching `config.json` into `docs/model/` together.

## Troubleshooting

| Symptom | Check |
|---|---|
| Camera does not start | Use the https site (or localhost). Allow **Camera** in the browser's site settings. Close other apps using the camera. |
| Auto-log never saves | Allow **Location**. Make sure damage is visible above the cutoff and you moved more than the set distance. |
| Pages shows 404 | **main /docs** must be selected, with `docs/index.html` at exactly that path. |
| Model checksum mismatch | Restore the original `.onnx` and `config.json` as a pair. A Git LFS pointer is not the binary. |
| Old version still showing | Reload once (the app shows *Reload* when an update is ready), or bump `VERSION` in `docs/sw.js`. |
| Records missing | Records live in one browser on one device. Use **Backup** / **Import** to move them. Clearing site data deletes them. |

## Licences and attribution

The application code is GNU AGPL-3.0 (see `LICENSE`), and the checkpoint embeds an AGPL-3.0 notice. ONNX Runtime Web is MIT, with its third-party notices in `docs/model/vendor/`. Leaflet is BSD-2-Clause, and map data is © OpenStreetMap contributors (ODbL). The RDD2022 imagery and reference boxes are by Arya et al., CC BY 4.0. Keep the licences and data attribution with redistributed versions.
