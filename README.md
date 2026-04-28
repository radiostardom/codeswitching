# Code-Switching

WholeYou™ kiosk installation. Senior thesis, May 2026.

## Quick start

```bash
cd print-server
npm install      # one time
node server.js   # every show
```

Then open `index.html` in Chrome.

See `print-server/README.md` for the full rundown including troubleshooting.

## Contents

- `index.html` — the kiosk (HTML/CSS/JS, single file)
- `styles/v3-flow.css` — the calmer-pass override (loaded by index.html)
- `print-server/` — local Node bridge between the browser and the thermal printer
