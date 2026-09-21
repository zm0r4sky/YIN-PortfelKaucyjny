/**
 * Multi-pass barcode text OCR - v2
 * Better strategy: 
 * 1. Find the white paper strip (receipt) boundaries
 * 2. Focus on the zone between "Suma" area and "Do wykorzystania" (where the barcode number is printed)
 * 3. Slide a narrow window through that zone and OCR each strip with digits-only
 */
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';

const IMG_DIR = 'C:/Users/ZMoRa/.gemini/antigravity-ide/brain/d32aa62d-4479-4d1f-b92e-bdc124a4b706/.user_uploaded';

const KNOWN_BARCODES = {
  'media_1789904363599.jpg': '9841243272171178990681600055',
  'media_1789904363616.jpg': '9841243272171178990683800057',
  'media_1789904363638.jpg': '9841243272171178990684700059',
  'media_1789904363658.jpg': '9841243272171178990681600055',
};

/**
 * Find white paper strip boundaries (left/right edges of receipt)
 */
function findPaperBounds(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // Column brightness profile
  const colBright = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      if (lum > 150) colBright[x]++;
    }
  }

  const threshold = h * 0.3;
  let left = 0, right = w - 1;
  for (let x = 0; x < w; x++) { if (colBright[x] > threshold) { left = x; break; } }
  for (let x = w - 1; x >= 0; x--) { if (colBright[x] > threshold) { right = x; break; } }

  // Row brightness profile (for top/bottom)
  const rowBright = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = left; x <= right; x++) {
      const idx = (y * w + x) * 4;
      const lum = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      if (lum > 150) rowBright[y]++;
    }
  }

  const rThreshold = (right - left) * 0.3;
  let top = 0, bottom = h - 1;
  for (let y = 0; y < h; y++) { if (rowBright[y] > rThreshold) { top = y; break; } }
  for (let y = h - 1; y >= 0; y--) { if (rowBright[y] > rThreshold) { bottom = y; break; } }

  return { left, right, top, bottom, paperW: right - left, paperH: bottom - top };
}

/**
 * Extract just the barcode number region.
 * On Biedronka receipts, the barcode is roughly in the middle 40-60% of the receipt height.
 * The number text is a single narrow line between the barcode bars and "Do wykorzystania do dnia:".
 * We'll use a sliding window approach to find it.
 */
function createSlidingStrips(canvas, paper, fullHeight) {
  const strips = [];
  const receiptW = paper.right - paper.left;
  const receiptH = paper.bottom - paper.top;

  // The barcode text on Biedronka is roughly at 45-60% of receipt height
  // Slide a narrow window (3-6% of receipt height) through this zone
  const searchStartPct = 0.38;
  const searchEndPct = 0.62;
  const stripHeightPct = 0.035; // ~3.5% of receipt = one text line

  const searchStartY = paper.top + Math.round(receiptH * searchStartPct);
  const searchEndY = paper.top + Math.round(receiptH * searchEndPct);
  const stripH = Math.max(20, Math.round(receiptH * stripHeightPct));
  const step = Math.max(5, Math.round(stripH * 0.3));

  const scales = [4, 6, 8];
  const padX = Math.round(receiptW * 0.05); // 5% horizontal padding

  for (let y = searchStartY; y < searchEndY - stripH; y += step) {
    for (const scale of scales) {
      const cropX = paper.left + padX;
      const cropW = receiptW - 2 * padX;
      const cropY = y;
      const cropH = stripH;

      const outW = Math.round(cropW * scale);
      const outH = Math.round(cropH * scale);

      if (outW < 100 || outH < 20) continue;

      const out = createCanvas(outW, outH);
      const octx = out.getContext('2d');
      octx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      // Binarize
      const imgData = octx.getImageData(0, 0, outW, outH);
      const px = imgData.data;
      let sum = 0, cnt = 0;
      for (let i = 0; i < px.length; i += 4) {
        sum += (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
        cnt++;
      }
      const avg = sum / cnt;
      const threshold = Math.min(190, Math.max(110, avg * 0.82));

      for (let i = 0; i < px.length; i += 4) {
        const lum = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
        const val = lum > threshold ? 255 : 0;
        px[i] = px[i + 1] = px[i + 2] = val;
        px[i + 3] = 255;
      }
      octx.putImageData(imgData, 0, 0);

      const yPct = ((y - paper.top) / receiptH * 100).toFixed(0);
      strips.push({ name: `y${yPct}%_x${scale}`, canvas: out, yOffset: y, scale });
    }
  }

  return strips;
}

function extractBarcodeFromOcrText(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/\s+/g, '')
    .replace(/[OoQq]/g, '0')
    .replace(/[Iil|!]/g, '1')
    .replace(/[B]/g, '8')
    .replace(/[Ss]/g, '5')
    .replace(/[Zz]/g, '2')
    .replace(/[^0-9]/g, '');

  if (cleaned.length < 15) return null;

  const m = cleaned.match(/9841\d{24}/);
  if (m) return m[0];
  const m2 = cleaned.match(/98\d{26}/);
  if (m2) return m2[0];
  const m3 = cleaned.match(/984\d{20,25}/);
  if (m3) return m3[0].substring(0, Math.min(28, m3[0].length));

  return cleaned.length >= 20 ? cleaned : null;
}

function compareStrings(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  let matches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }
  return (matches / maxLen) * 100;
}

async function main() {
  console.log('Multi-Pass Barcode OCR v2 (Sliding Window)');
  console.log('============================================\n');

  const worker = await createWorker('eng');

  for (const [filename, knownBarcode] of Object.entries(KNOWN_BARCODES)) {
    const imgPath = path.join(IMG_DIR, filename);
    const img = await loadImage(imgPath);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${filename}`);
    console.log(`Znany: ${knownBarcode}`);
    console.log(`Image: ${img.width}x${img.height}`);

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const paper = findPaperBounds(canvas);
    console.log(`Paper: x=${paper.left}-${paper.right}, y=${paper.top}-${paper.bottom} (${paper.paperW}x${paper.paperH})`);

    const strips = createSlidingStrips(canvas, paper, img.height);
    console.log(`Strips: ${strips.length}\n`);

    let allResults = [];

    for (const strip of strips) {
      for (const psm of ['7', '13']) {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: psm,
            tessedit_char_whitelist: '0123456789',
            preserve_interword_spaces: '0'
          });

          const buf = strip.canvas.toBuffer('image/png');
          const ret = await worker.recognize(buf);
          const rawText = (ret.data.text || '').trim();
          const conf = ret.data.confidence || 0;

          if (rawText.replace(/\s/g, '').length < 10) continue;

          const extracted = extractBarcodeFromOcrText(rawText);
          if (extracted && extracted.length >= 15) {
            const matchPct = compareStrings(extracted, knownBarcode);
            allResults.push({ strip: strip.name, psm, raw: rawText.substring(0, 50), extracted, matchPct, conf });
          }
        } catch (e) {}
      }
    }

    allResults.sort((a, b) => b.matchPct - a.matchPct);
    const top = allResults.slice(0, 8);
    
    if (top.length > 0) {
      console.log('Top results:');
      for (const r of top) {
        const marker = r.matchPct >= 100 ? 'EXACT' : r.matchPct > 85 ? 'CLOSE' : r.matchPct > 60 ? 'PART' : 'LOW';
        console.log(`  [${marker.padEnd(5)}] ${r.matchPct.toFixed(0).padStart(3)}% | ${r.strip.padEnd(12)} | PSM${r.psm} | conf=${r.conf.toFixed(0).padStart(2)}% | ${r.extracted}`);
      }
      
      const best = top[0];
      console.log(`\n  BEST: ${best.matchPct.toFixed(0)}% match`);
      console.log(`  Got:  ${best.extracted}`);
      console.log(`  Want: ${knownBarcode}`);
      let diff = '  Diff: ';
      for (let i = 0; i < Math.max(best.extracted.length, knownBarcode.length); i++) {
        diff += (i < best.extracted.length && i < knownBarcode.length && best.extracted[i] === knownBarcode[i]) ? '.' : '^';
      }
      console.log(diff);
    } else {
      console.log('  NO MATCH FOUND (no strip produced 15+ digits)');
    }
  }

  await worker.terminate();
  console.log('\n\nDone.');
}

main().catch(console.error);
