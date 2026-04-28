# Code-Switching / WholeYou™ Kiosk

This is the full bundle: kiosk HTML + override stylesheet + local print server.

## What's in here

```
code-switching/
├── index.html              ← the kiosk itself, open this in Chrome
├── styles/
│   └── v3-flow.css         ← the calmer-pass override (loaded automatically)
└── print-server/
    ├── server.js           ← bridges browser → thermal printer
    ├── package.json
    └── (node_modules/)     ← created by `npm install`
```

## First-time setup

You need Node.js installed. If you don't have it: `brew install node`.

```bash
cd print-server
npm install
```

That pulls in `sharp` for image processing. It takes a minute.

## Running the show

Two terminals. Always two terminals.

**Terminal 1 — print server:**
```bash
cd print-server
node server.js
```

You should see:
```
✓ CUPS reset for PrinterCMD_ESCPO_POS80_Printer_USB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WholeYou™ print server
  → http://localhost:3000
  → printer: PrinterCMD_ESCPO_POS80_Printer_USB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Leave that terminal open. Don't close it. Don't even look at it funny.

**Terminal 2 — open the kiosk:**
```bash
open index.html
```

Or just double-click `index.html` from Finder. Chrome handles `file://` access fine for this.

## How printing actually works

When the candidate hits "Print My Verdict" on the receipt screen, the kiosk:
1. Captures the visible receipt as a PNG using html2canvas
2. POSTs it to `http://localhost:3000/print` as base64
3. The server resizes to 576px wide (the printer's true dot width), normalizes contrast, thresholds to 1-bit, builds an ESC/POS raster command, and pipes to `lpr -o raw`
4. Printer chunks out the receipt, cuts the paper, you wave it around triumphantly

If the server is unreachable (printer offline, server not running, you forgot Terminal 1), the kiosk silently falls back to the virtual receipt path so the candidate's experience still completes. Nothing breaks visibly during a show.

## Troubleshooting

**"Printed ✓" appears but nothing comes out**
CUPS likely auto-disabled the printer after a previous bad job. Ctrl-C the server and restart it; the startup block runs `cancel -a` and `cupsenable` to clear that state. If it keeps happening, run those two commands manually:
```bash
cancel -a PrinterCMD_ESCPO_POS80_Printer_USB
cupsenable PrinterCMD_ESCPO_POS80_Printer_USB
```

**Receipt prints garbled random characters**
CUPS isn't passing raw bytes through. Check that the printer is set to "Generic Raw Printer" in System Settings → Printers & Scanners. The `-o raw` flag in the server should handle this, but some macOS versions get weird about it.

**Print is too dark / too light**
Open `server.js` and change the `threshold(140)` value in `imageToEscpos`. Higher number = lighter print, lower = darker. 140 is a decent middle ground for the WholeYou™ aesthetic.

**Print is too narrow / cut off on the right**
Confirm `PRINT_WIDTH_DOTS = 576` matches your printer. Run a printer self-test (hold the feed button while powering on) and check the reported max dot count. If yours says 384 or 832, change the constant.

**"sharp" install fails**
Sharp uses native bindings. If `npm install` errors out, try:
```bash
npm install --include=optional sharp
```
Or as a last resort, `npm rebuild sharp`.

## Day-of checklist

- [ ] Printer plugged in via USB
- [ ] Thermal paper roll loaded (and a backup nearby)
- [ ] `node server.js` running and showing the green checkmarks
- [ ] `index.html` open in Chrome
- [ ] Test receipt printed once before doors open
- [ ] Phone charger nearby (laptop will be doing a lot)

Good luck out there!
