// ═══════════════════════════════════════════════════════════
//  WholeYou™ Print Server — DIRECT USB EDITION
//  ─────────────────────────────────────────────────────────
//  CUPS-bypass version. Talks straight to the thermal printer
//  over USB using the `usb` library. This sidesteps the bug
//  where CUPS corrupts the second print of a session.
//
//  First-time setup:
//    npm install usb sharp
//
//  If CUPS still has the printer claimed, unhook it once before
//  starting this server:
//    sudo cupsdisable PrinterCMD_ESCPO_POS80_Printer_USB
//
//  Then run normally:
//    node server.js
// ═══════════════════════════════════════════════════════════

const http = require('http');
const sharp = require('sharp');
const usb = require('usb');

const PORT = 3000;
const PRINT_WIDTH_DOTS = 576;

// USB IDs for the POS80 Printer USB (confirmed from `ioreg`)
const VENDOR_ID  = 0x0416;          // 1046 decimal
const PRODUCT_ID = 0x5011;          // typical for POS80; auto-fallback below

function findPrinter() {
  let device = usb.findByIds(VENDOR_ID, PRODUCT_ID);
  if (device) return device;
  // fallback: any device matching just the vendor ID
  for (const d of usb.getDeviceList()) {
    if (d.deviceDescriptor.idVendor === VENDOR_ID) return d;
  }
  return null;
}

async function imageToEscpos(pngBuffer) {
  const { data: rawGray, info } = await sharp(pngBuffer)
    .resize({ width: PRINT_WIDTH_DOTS, withoutEnlargement: false })
    .greyscale()
    .gamma(2.2)
    .linear(1.05, 15)
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const buf = new Int16Array(width * height);
  for (let i = 0; i < rawGray.length; i++) buf[i] = rawGray[i];

  // Floyd-Steinberg dithering
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const newPixel = old < 128 ? 0 : 255;
      buf[idx] = newPixel;
      const err = old - newPixel;
      if (x + 1 < width)              buf[idx + 1]         += (err * 7) >> 4;
      if (y + 1 < height) {
        if (x > 0)                    buf[idx + width - 1] += (err * 3) >> 4;
                                      buf[idx + width]     += (err * 5) >> 4;
        if (x + 1 < width)            buf[idx + width + 1] += (err * 1) >> 4;
      }
    }
  }

  const bytesPerRow = Math.ceil(width / 8);
  const rasterBytes = Buffer.alloc(bytesPerRow * height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (buf[y * width + x] === 0) {
        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
        rasterBytes[byteIdx] |= (1 << (7 - (x % 8)));
      }
    }
  }

  const header = Buffer.from([
    0x1b, 0x40,
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff
  ]);
  const tail = Buffer.from([
    0x0a, 0x0a, 0x0a, 0x0a,
    0x1d, 0x56, 0x42, 0x00
  ]);
  return Buffer.concat([header, rasterBytes, tail]);
}

function sendOverUsb(escposBuffer) {
  return new Promise((resolve, reject) => {
    const device = findPrinter();
    if (!device) return reject(new Error('Printer not found on USB'));

    try {
      device.open();
    } catch (e) {
      return reject(new Error(
        `Failed to open USB: ${e.message}. ` +
        `Is CUPS holding the printer? Try: sudo cupsdisable PrinterCMD_ESCPO_POS80_Printer_USB`
      ));
    }

    const iface = device.interfaces[0];
    try {
      if (iface.isKernelDriverActive && iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
      }
      iface.claim();
    } catch (e) {
      try { device.close(); } catch (_) {}
      return reject(new Error(`Failed to claim USB interface: ${e.message}`));
    }

    const outEndpoint = iface.endpoints.find(ep => ep.direction === 'out');
    if (!outEndpoint) {
      iface.release(true, () => { try { device.close(); } catch (_) {} });
      return reject(new Error('No OUT endpoint found on printer'));
    }

    outEndpoint.transfer(escposBuffer, (err) => {
      iface.release(true, () => {
        try { device.close(); } catch (_) {}
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

let printQueue = Promise.resolve();
function enqueue(job) {
  const next = printQueue.then(job, job);
  printQueue = next.catch(() => {});
  return next;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let image;
      try {
        ({ image } = JSON.parse(body));
        if (!image) throw new Error('no image in request body');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
        return;
      }

      enqueue(async () => {
        const base64 = image.replace(/^data:image\/\w+;base64,/, '');
        const pngBuffer = Buffer.from(base64, 'base64');
        const escpos = await imageToEscpos(pngBuffer);
        await sendOverUsb(escpos);
        // direct USB doesn't have the CUPS overlap bug, but a brief pause
        // gives the printer time to cut paper before the next job
        await new Promise(r => setTimeout(r, 1500));
      })
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        console.log('✓ printed receipt at', new Date().toLocaleTimeString());
      })
      .catch(e => {
        console.error('✗ print error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const dev = findPrinter();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printerFound: !!dev }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  const dev = findPrinter();
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  WholeYou™ print server (DIRECT USB)`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → printer: ${dev ? '✓ found' : '✗ NOT FOUND'}`);
  if (!dev) {
    console.log(`  → check that the printer is plugged in via USB.`);
    console.log(`  → if it is, run: sudo cupsdisable PrinterCMD_ESCPO_POS80_Printer_USB`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});
