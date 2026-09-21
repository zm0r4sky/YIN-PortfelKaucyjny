/**
 * Kalibracja OCR stopki paragonu Lidl
 * Cel: odczytać "11:00:28 21-WRZ-2026" z dołu paragonu
 * Strategia: 
 *   1. Wycięcie dolnych 20-30% obrazu (strefa Tomra: data + numer)
 *   2. Binarizacja z wieloma progami
 *   3. PSM 6 (blok), PSM 4 (kolumna tekstu) i PSM 3 (auto)
 *   4. Sprawdzenie czy regex WRZ/GRU/LIS itp. pasuje do wynik
 */
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from 'canvas';
import path from 'path';

const IMG_DIR = 'C:/Users/ZMoRa/.gemini/antigravity-ide/brain/d32aa62d-4479-4d1f-b92e-bdc124a4b706/.user_uploaded';

// Lidl images uploaded in current session (2026-09-21 ~13:19 local time)
const LIDL_IMAGES = [
  { file: 'media_1789989301040.jpg', expected_date: '2026-09-21', expected_time: '11:26:08', barcode: '201000002000502236145474', location: 'Odkryta 61' },
  { file: 'media_1789989301057.jpg', expected_date: '2026-09-21', expected_time: '06:24:27', barcode: '201000002002001083172521', location: 'Conrada 1 (Automat 1)' },
  { file: 'media_1789989301089.jpg', expected_date: '2026-09-21', expected_time: '10:48:07', barcode: '201000002000501083282139', location: 'Conrada 1 (Automat 2)' },
  { file: 'media_1789989301097.jpg', expected_date: '2026-09-21', expected_time: '11:00:28', barcode: '201000002000502175282311', location: 'Kasprowicza 117' },
  { file: 'media_1789989301103.jpg', expected_date: '2026-09-21', expected_time: '11:15:51', barcode: '201000002000501165171570', location: 'Myśliborska 94' },
];

// Polish month abbreviations for validation
const MONTH_MAP = {
  'STY': 0, 'LUT': 1, 'MAR': 2, 'KWI': 3, 'MAJ': 4, 'CZE': 5,
  'LIP': 6, 'SIE': 7, 'WRZ': 8, 'PAZ': 9, 'LIS': 10, 'GRU': 11,
  // OCR variants
  'URZ': 8, 'VRZ': 8, 'W4Z': 8, 'WRI': 8, 'WPZ': 8, 'WBZ': 8, 'WR7': 8, 'WZZ': 8,
};

function detectDateInText(text) {
  if (!text) return null;
  // Main pattern: HH:MM:SS DD-MMM-YYYY or just DD-MMM-YYYY
  const dateRegex = /(\d{1,2})[:\.](\d{2})[:\.](\d{2})\s+(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s](\d{4})/gi;
  const dateRegex2 = /(\d{1,2})[-\.]([A-Za-z]{3,4})[-\.](\d{4})/gi;
  
  for (const regex of [dateRegex, dateRegex2]) {
    const matches = [...text.matchAll(regex)];
    for (const m of matches) {
      const rawMonth = (regex === dateRegex ? m[5] : m[2]).toUpperCase()
        .replace(/[Ą]/g, 'A').replace(/[Ę]/g, 'E').replace(/[Ó]/g, 'O')
        .replace(/[Ś]/g, 'S').replace(/[Ź]/g, 'Z').replace(/[Ż]/g, 'Z');
      const monthIdx = MONTH_MAP[rawMonth] ?? MONTH_MAP[rawMonth.slice(0,3)];
      if (monthIdx !== undefined) {
        const day = parseInt(regex === dateRegex ? m[4] : m[1]);
        const year = parseInt(regex === dateRegex ? m[6] : m[3]);
        if (day >= 1 && day <= 31 && year >= 2024 && year <= 2030) {
          return {
            date: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            raw: m[0],
            month_raw: rawMonth
          };
        }
      }
    }
  }
  return null;
}

/**
 * Find the white paper region (left/right boundaries)
 */
function findPaperX(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  
  const colBright = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = (data[idx] * 77 + data[idx+1] * 150 + data[idx+2] * 29) >> 8;
      if (lum > 150) colBright[x]++;
    }
  }
  const threshold = h * 0.25;
  let left = 0, right = w - 1;
  for (let x = 0; x < w; x++) { if (colBright[x] > threshold) { left = x; break; } }
  for (let x = w-1; x >= 0; x--) { if (colBright[x] > threshold) { right = x; break; } }
  return { left, right };
}

/**
 * Create preprocessed strips of the bottom portion of the receipt.
 * The Tomra date is always in the last ~20% of the receipt.
 */
function createBottomStrips(canvas) {
  const { left, right } = findPaperX(canvas);
  const w = canvas.width;
  const h = canvas.height;
  
  // Test multiple bottom percentages: 15%, 20%, 25%, 30%
  const bottomPcts = [0.12, 0.18, 0.25, 0.32];
  const scales = [3, 4, 5];
  const strips = [];
  
  const padX = Math.round((right - left) * 0.04);
  const cropX = Math.max(0, left + padX);
  const cropW = Math.min(w, right - padX) - cropX;
  
  for (const pct of bottomPcts) {
    const cropY = Math.round(h * (1 - pct));
    const cropH = Math.round(h * pct);
    
    for (const scale of scales) {
      const outW = Math.round(cropW * scale);
      const outH = Math.round(cropH * scale);
      
      const out = createCanvas(outW, outH);
      const octx = out.getContext('2d');
      // White background
      octx.fillStyle = '#fff';
      octx.fillRect(0, 0, outW, outH);
      octx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
      
      // Get pixel data for threshold
      const imgData = octx.getImageData(0, 0, outW, outH);
      const px = imgData.data;
      let sum = 0, cnt = 0;
      for (let i = 0; i < px.length; i += 4) {
        sum += (px[i]*77 + px[i+1]*150 + px[i+2]*29) >> 8;
        cnt++;
      }
      const avg = sum / cnt;
      
      // Multiple threshold versions
      const thresholds = [
        { name: 'std', val: Math.min(190, avg * 0.82) },
        { name: 'hi', val: Math.min(220, avg * 0.92) },
        { name: 'lo', val: Math.max(90, avg * 0.70) },
      ];
      
      for (const thr of thresholds) {
        const binOut = createCanvas(outW, outH);
        const bctx = binOut.getContext('2d');
        const bData = octx.getImageData(0, 0, outW, outH);
        const bpx = bData.data;
        for (let i = 0; i < bpx.length; i += 4) {
          const lum = (bpx[i]*77 + bpx[i+1]*150 + bpx[i+2]*29) >> 8;
          const v = lum > thr.val ? 255 : 0;
          bpx[i] = bpx[i+1] = bpx[i+2] = v;
          bpx[i+3] = 255;
        }
        bctx.putImageData(bData, 0, 0);
        strips.push({
          name: `bot${Math.round(pct*100)}%_x${scale}_${thr.name}`,
          canvas: binOut,
          pct, scale, thr: thr.name
        });
      }
    }
  }
  
  return strips;
}

async function main() {
  console.log('Kalibracja OCR Stopki Paragonu Lidl (data Tomra)');
  console.log('=================================================\n');
  
  const worker = await createWorker('pol+eng');
  
  for (const imgInfo of LIDL_IMAGES) {
    const imgPath = path.join(IMG_DIR, imgInfo.file);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${imgInfo.file}`);
    console.log(`Oczekiwana data: ${imgInfo.expected_date} o ${imgInfo.expected_time}`);
    console.log(`${'='.repeat(60)}`);
    
    let img;
    try {
      img = await loadImage(imgPath);
    } catch (e) {
      console.log(`  BRAK PLIKU: ${e.message}`);
      continue;
    }
    
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    console.log(`  Rozmiar: ${img.width}x${img.height}`);
    
    const strips = createBottomStrips(canvas);
    console.log(`  Strips: ${strips.length}`);
    
    let allResults = [];
    
    for (const strip of strips) {
      for (const psm of ['6', '4', '3']) {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: psm,
            tessedit_char_whitelist: '',
          });
          
          const buf = strip.canvas.toBuffer('image/png');
          const ret = await worker.recognize(buf);
          const text = (ret.data.text || '').trim();
          const conf = ret.data.confidence || 0;
          
          const found = detectDateInText(text);
          if (found) {
            const isCorrect = found.date === imgInfo.expected_date;
            allResults.push({
              strip: strip.name,
              psm,
              found: found.date,
              raw: found.raw,
              month_raw: found.month_raw,
              conf,
              isCorrect
            });
          }
        } catch (e) {}
      }
    }
    
    // Sort: correct first, then by conf
    allResults.sort((a, b) => (b.isCorrect ? 1 : 0) - (a.isCorrect ? 1 : 0) || b.conf - a.conf);
    
    const correctResults = allResults.filter(r => r.isCorrect);
    const anyResults = allResults.slice(0, 5);
    
    if (correctResults.length > 0) {
      console.log(`\n  ✅ DATA POPRAWNA ZNALEZIONA! (${correctResults.length} konfiguracji)`);
      console.log(`  Najlepszy wynik:`);
      const best = correctResults[0];
      console.log(`    strip=${best.strip}, PSM=${best.psm}, conf=${best.conf.toFixed(0)}%`);
      console.log(`    Raw: "${best.raw}" → miesiąc: "${best.month_raw}"`);
    } else if (anyResults.length > 0) {
      console.log(`\n  ⚠️  Znaleziono datę ale BŁĘDNĄ:`);
      for (const r of anyResults.slice(0, 3)) {
        console.log(`    ${r.found} (oczekiwano ${imgInfo.expected_date}) | "${r.raw}" | PSM${r.psm} | ${r.strip}`);
      }
    } else {
      console.log(`\n  ❌ Nie znaleziono żadnej daty z miesiącem słownym`);
      
      // Debug: show raw OCR of best strip
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
        const strip0 = strips.find(s => s.pct === 0.25 && s.scale === 4 && s.thr === 'std');
        if (strip0) {
          const buf = strip0.canvas.toBuffer('image/png');
          const ret = await worker.recognize(buf);
          const text = (ret.data.text || '').trim();
          console.log(`  Debug OCR (bot25%_x4_std, PSM6): conf=${ret.data.confidence?.toFixed(0)}%`);
          console.log(`  Raw text:\n${text.split('\n').map(l => '    ' + l).join('\n')}`);
        }
      } catch (e) {}
    }
    
    // Also show overall OCR config summary
    if (correctResults.length > 0) {
      const configs = [...new Set(correctResults.map(r => `${r.strip}+PSM${r.psm}`))];
      console.log(`  Działające konfiguracje (${configs.length} szt): ${configs.slice(0,5).join(', ')}`);
    }
  }
  
  await worker.terminate();
  console.log('\n\nDone.');
}

main().catch(console.error);
