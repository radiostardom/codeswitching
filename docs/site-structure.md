# website structure map (index.html)

this project intentionally keeps most kiosk logic in one `index.html` file. this doc is a quick map so people can navigate it without getting lost.

## high-level layout

- **head**
  - script loader for `face-api` + `html2canvas` with local-first and cdn fallback.
  - design-token css and all component styling.
- **body**
  - phase-based screens (`.phase`) that represent the kiosk flow.
  - overlays, controls, and receipt-related markup.
- **main script (bottom of file)**
  - state, flow control, scoring, camera/detection, receipt population, printing, audio, and loop/reset logic.

## js sections in practical order

1. **flow + phase management**
   - routing between phases, interstitials, timers, idle/reset behavior.
2. **screening/scoring**
   - fake hiring-model factors and rollups.
   - final score + verdict calculation.
3. **camera + detection loop**
   - setup, draw overlays, aggregate face signals.
4. **results + receipt rendering**
   - build scorecards and truth text.
   - populate on-screen results and printable receipt.
5. **print integration**
   - receipt capture (`html2canvas`) and post to local print server.
   - fallback to virtual receipt if print fails.
6. **audio + ambient effects**
   - sfx, hum loop, particle animation.
7. **bootstrapping**
   - startup hooks, tweak panel sync, persistent knobs.

## style guidance for future edits

- keep new helpers small and single-purpose (like `captureReceiptImage` or `postPrintRequest`).
- prefer named constants over inline numbers when values affect timing or layout.
- when touching printer/camera code, separate:
  - **prepare data**
  - **execute side effect**
  - **cleanup/restore ui**
- add comments in plain lowercase voice for non-obvious browser quirks.

## suggested next cleanup pass (safe + incremental)

- move pure scoring helpers into a standalone js module file.
- keep phase/dom wiring in `index.html` for now.
- extract all print-related helpers into one clearly labeled block (already started).
- add tiny smoke checks (manual checklist) in repo docs for camera/print flow.
