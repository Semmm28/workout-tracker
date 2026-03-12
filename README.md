# Workout Log PWA

A browser-based, offline-first workout tracker optimized for iPhone Safari and Home Screen installation.

## What is included

- Brands overview with search, manual sorting, add/edit/delete, and swipe-left actions
- Machines screen per brand with search, manual sorting, add/edit/delete, and swipe-left actions
- Machine detail screen with:
  - Weight / Reps / Volume line chart
  - Date-grouped workout history
  - Set labels (Set 1, Set 2, ...)
  - Add/edit/delete set entries with optional metadata
- Local-only persistence with IndexedDB
- Offline shell caching through a service worker
- PWA manifest, Apple touch icon, theme color, and standalone-friendly meta tags

## File structure

- `index.html` – app shell and meta tags
- `styles.css` – dark iPhone-style UI
- `app.js` – SPA logic, rendering, IndexedDB, navigation, gestures
- `sw.js` – service worker for offline shell caching
- `manifest.json` – PWA metadata
- `assets/` – icons for install and Home Screen

## How to run locally on your computer

Because service workers require a secure context, do **not** open `index.html` directly from Finder.

Use a simple local server instead.

### Option A — Python

```bash
cd workout-tracker-pwa
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173
```

### Option B — VS Code Live Server or any static server

Serve the folder and open it in a browser at `http://localhost:<port>`.

## How to test in Safari on iPhone

### Important note

To get the service worker and full PWA behavior on iPhone, the app should be served from **HTTPS**.
`localhost` works on the same device, but when you open the app from your iPhone using another machine's LAN IP over plain HTTP, service worker registration may fail.

### Recommended approach

1. Serve the folder on your computer.
2. Expose it over **HTTPS** using one of these methods:
   - a local HTTPS setup
   - a secure tunnel such as Cloudflare Tunnel or ngrok
   - a temporary HTTPS host for testing
3. Open the HTTPS URL in **Safari on iPhone**.
4. Use the app once while online so the service worker caches the shell.
5. Then install it from Safari.

## Add to Home Screen on iPhone

1. Open the app in **Safari**.
2. Tap the **Share** button.
3. Choose **Add to Home Screen**.
4. Confirm the name.
5. Tap **Add**.
6. Launch it from the Home Screen.

When opened from the Home Screen, the app uses standalone display mode and feels more like a native app.

## Data storage

- All data is stored in **IndexedDB** on the device/browser only.
- No login, backend, sync, or cloud database is used.
- Deleting a brand also deletes its machines and set history.
- Deleting a machine also deletes its set history.
- Deleting a set supports a lightweight undo.

## Suggested deployment

Because this is a static app, it can also be hosted on any static HTTPS host:

- GitHub Pages
- Netlify
- Vercel static hosting
- Cloudflare Pages

The app still remains local-first because workout data is stored on the user's device in IndexedDB.
