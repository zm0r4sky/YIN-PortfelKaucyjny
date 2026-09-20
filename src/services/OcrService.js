/**
 * @project YIN-PortfelKaucyjny
 * @file OcrService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * Tesseract.js OCR Service with Polish receipt & thermal paper regex analyzers.
 * Used for testing and as an intelligent fallback when a barcode cannot be decoded via patterns.
 */

import { createWorker } from 'tesseract.js';

class OcrServiceClass {
  constructor() {
    this.worker = null;
    this.isInitializing = false;
    this.initPromise = null;
  }

  async getWorker(onProgress) {
    if (this.worker) return this.worker;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        console.log('[OcrService] Initializing Tesseract worker...');
        const worker = await createWorker('pol+eng', 1, {
          logger: m => {
            if (onProgress && typeof onProgress === 'function') {
              onProgress(m);
            }
          }
        });
        await worker.setParameters({
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1'
        });
        this.worker = worker;
        console.log('[OcrService] Tesseract worker ready');
        return worker;
      })();
    }

    return await this.initPromise;
  }

  /**
   * Preprocesses image on canvas for thermal receipt readability (grayscale + contrast)
   */
  /**
   * Preprocesses image on canvas for thermal receipt readability:
   * 1. Detects receipt paper bounding box (white vertical strip) to eliminate dark room & hand background.
   * 2. Crops directly to the receipt and scales up so text characters reach optimal OCR size (25-35px).
   * 3. Normalizes paper to bright white and ink to deep black.
   * 4. Inverts dark horizontal reverse bands (such as white 'PLN 0.35' on black background).
   */
  async preprocessImageForOcr(imageSource) {
    const img = await this.loadImage(imageSource);
    const naturalW = img.naturalWidth || img.width || 1200;
    const naturalH = img.naturalHeight || img.height || 1600;

    // KROK 1: Szybki canvas pomocniczy do detekcji granic papieru paragonu
    const sampleW = 400;
    const sampleH = Math.round((naturalH / naturalW) * sampleW);
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleW;
    sampleCanvas.height = sampleH;
    const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(img, 0, 0, sampleW, sampleH);

    let cropRect = { x: 0, y: 0, w: naturalW, h: naturalH };

    try {
      const sData = sCtx.getImageData(0, 0, sampleW, sampleH).data;
      
      // Profil jasności pionowej i poziomej (szukanie jasnego paska papieru termicznego)
      const colBright = new Float32Array(sampleW);
      const rowBright = new Float32Array(sampleH);

      for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
          const idx = (y * sampleW + x) * 4;
          const lum = (sData[idx] * 77 + sData[idx + 1] * 150 + sData[idx + 2] * 29) >> 8;
          if (lum > 140) {
            colBright[x]++;
            rowBright[y]++;
          }
        }
      }

      const thresholdY = sampleH * 0.15;
      const thresholdX = sampleW * 0.15;

      let minX = 0, maxX = sampleW - 1;
      let minY = 0, maxY = sampleH - 1;

      for (let x = 0; x < sampleW; x++) {
        if (colBright[x] > thresholdY) { minX = x; break; }
      }
      for (let x = sampleW - 1; x >= 0; x--) {
        if (colBright[x] > thresholdY) { maxX = x; break; }
      }

      for (let y = 0; y < sampleH; y++) {
        if (rowBright[y] > thresholdX) { minY = y; break; }
      }
      for (let y = sampleH - 1; y >= 0; y--) {
        if (rowBright[y] > thresholdX) { maxY = y; break; }
      }

      const detectedW = (maxX - minX) / sampleW;
      const detectedH = (maxY - minY) / sampleH;

      if (detectedW > 0.25 && detectedW < 0.95 && detectedH > 0.3) {
        const marginX = Math.round(sampleW * 0.04);
        const marginY = Math.round(sampleH * 0.04);
        const clX = Math.max(0, minX - marginX) / sampleW;
        const crX = Math.min(sampleW, maxX + marginX) / sampleW;
        const ctY = Math.max(0, minY - marginY) / sampleH;
        const cbY = Math.min(sampleH, maxY + marginY) / sampleH;

        cropRect = {
          x: Math.round(clX * naturalW),
          y: Math.round(ctY * naturalH),
          w: Math.round((crX - clX) * naturalW),
          h: Math.round((cbY - ctY) * naturalH)
        };
      }
    } catch (err) {
      console.warn('[OcrService] Receipt ROI detection fallback to full frame', err);
    }

    // KROK 2: Renderowanie wykadrowanego paragonu w docelowej rozdzielczości (~1400px szerokości)
    const targetW = 1400;
    const renderScale = targetW / cropRect.w;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = Math.round(cropRect.h * renderScale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, canvas.width, canvas.height);

    // KROK 3: Normalizacja kontrastu i odwrócenie czarnych pasków
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;

      let sumLum = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 16) {
        const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        sumLum += lum;
        count++;
      }
      const avgLum = sumLum / count;
      const whiteThreshold = Math.max(130, Math.min(200, avgLum + 20));
      const darkThreshold = Math.max(60, Math.min(110, avgLum - 40));
      const range = Math.max(20, whiteThreshold - darkThreshold);

      for (let y = 0; y < h; y++) {
        let rowSum = 0;
        const rowStart = y * w * 4;
        for (let x = 0; x < w; x += 8) {
          const idx = rowStart + x * 4;
          rowSum += (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
        }
        const rowAvg = rowSum / (w / 8);
        const isReverseBanner = rowAvg < 65;

        for (let x = 0; x < w; x++) {
          const i = rowStart + x * 4;
          let gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;

          if (isReverseBanner) {
            gray = 255 - gray;
          }

          let enhanced;
          if (gray >= whiteThreshold) {
            enhanced = 255;
          } else if (gray <= darkThreshold) {
            enhanced = 0;
          } else {
            enhanced = Math.round(((gray - darkThreshold) * 255) / range);
          }

          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('[OcrService] Contrast processing error:', e);
    }

    return canvas;
  }

  /**
   * Recognizes text on a receipt photo and extracts structured data
   * @param {Blob|File|string|HTMLCanvasElement} imageSource
   * @param {Function} onProgress
   * @returns {Promise<{ rawText: string, confidence: number, extracted: { shop_name: string|null, amount: number|null, expiration_date: string|null, print_date: string|null } }>}
   */
  async recognizeReceipt(imageSource, onProgress) {
    const worker = await this.getWorker(onProgress);
    const processedCanvas = await this.preprocessImageForOcr(imageSource);

    const ret = await worker.recognize(processedCanvas);
    const text = ret.data.text || '';
    const confidence = ret.data.confidence || 0;

    const dateInfo = this.extractDates(text);

    const extracted = {
      shop_name: this.extractShop(text),
      amount: this.extractAmount(text),
      expiration_date: dateInfo.expiration_date,
      print_date: dateInfo.print_date,
      barcode: this.extractBarcode(text)
    };

    return {
      rawText: text,
      confidence,
      processedCanvas,
      extracted
    };
  }

  /**
   * Detects shop name from keywords and NIP
   */
  /**
   * Normalizuje częste artefakty OCR z czcionek termicznych i igłowych
   */
  normalizeOcrText(text) {
    if (!text) return '';
    return text
      // Zamiana O/o/D/Q przed kropką/przecinkiem na 0 (np. O.35 -> 0.35, O. 33 -> 0.33)
      .replace(/\b[OoQqDd][,\.]\s*(\d{1,2})\b/g, '0.$1')
      // Zamiana literówki PLA na PLN
      .replace(/\bPLA\b/g, 'PLN')
      // Likwidacja spacji wewnątrz kwoty (np. 0. 35 -> 0.35)
      .replace(/(\d+)[,\.]\s+(\d{2})\b/g, '$1.$2');
  }

  /**
   * Detects shop name from keywords, addresses, and NIP
   */
  extractShop(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // NIP lub nazwy spółek i lokalizacje
    if (
      lower.includes('7811897358') || 
      lower.includes('jankowice') || 
      lower.includes('tarnowo podgórne') || 
      lower.includes('tarnowo podgorne') || 
      lower.includes('braniborska') ||
      lower.includes('poznańska') ||
      lower.includes('poznanska') ||
      lower.includes('wrocław') ||
      lower.includes('wroclaw') ||
      lower.includes('lidl')
    ) {
      return 'Lidl';
    }
    if (
      lower.includes('7791011327') || 
      lower.includes('biedronka') || 
      lower.includes('jeronimo') || 
      lower.includes('martins')
    ) {
      return 'Biedronka';
    }
    if (lower.includes('dino')) {
      return 'Dino';
    }
    if (lower.includes('kaufland')) {
      return 'Kaufland';
    }
    if (lower.includes('carrefour')) {
      return 'Carrefour';
    }
    if (lower.includes('żabka') || lower.includes('zabka')) {
      return 'Żabka';
    }
    if (lower.includes('netto')) {
      return 'Netto';
    }
    if (lower.includes('stokrotka')) {
      return 'Stokrotka';
    }
    if (lower.includes('tomra') || lower.includes('butelkomat') || lower.includes('recyklomat')) {
      return 'Lidl'; // Większość recyklomatów Tomra 90 w Polsce z tym układem to Lidl
    }

    return null;
  }

  /**
   * Detects deposit amount from keywords (SUMA, SUMA RABATU, RAZEM, KAUCJA, ZWROT, etc.)
   */
  extractAmount(text) {
    if (!text) return null;
    const norm = this.normalizeOcrText(text);

    // Pattern 1: Słowo kluczowe + kwota (np. SUMA, SUMA RABATU, RAZEM, KAUCJA, ZWROT)
    const keywordRegex = /(?:suma\s*rabatu|suma|razem|kaucja|zwrot|wyp[łl]at[ay]|warto[sś][cć]|kwota|do\s*zap[łl]aty)\s*[:=]?\s*[\r\n\s]*(\d{1,3}[,\.]\d{2})/i;
    const match1 = norm.match(keywordRegex);
    if (match1 && match1[1]) {
      const val = parseFloat(match1[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 2: Pozycja ze sztukami (np. "7x Butelka plastikowa 0.35")
    const itemRegex = /\d+\s*[xX]\s+[^\d\n]+[\s\t]+(\d{1,2}[,\.]\d{2})/i;
    const matchItem = norm.match(itemRegex);
    if (matchItem && matchItem[1]) {
      const val = parseFloat(matchItem[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 3: Kwota + PLN / ZŁ lub PLN + Kwota
    const currRegex = /(?:pln|z[łl])\s*[:=]?\s*(\d{1,3}[,\.]\d{2})|(\d{1,3}[,\.]\d{2})\s*(?:z[łl]|pln)/i;
    const match2 = norm.match(currRegex);
    if (match2) {
      const numStr = match2[1] || match2[2];
      const val = parseFloat(numStr.replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 4: Wyszukaj wszystkie kwoty w tekście i weź ostatnią lub najbardziej sensowną
    const allAmountsRegex = /\b(\d{1,2}[,\.]\d{2})\b/g;
    const matches = [...norm.matchAll(allAmountsRegex)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const val = parseFloat(lastMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    return null;
  }

  /**
   * Attempts to detect numerical barcode text printed under or above the barcode
   */
  extractBarcode(text) {
    if (!text) return null;
    const clean = text.replace(/[()\s\-_]/g, '');
    // Biedronka (28 cyfr z prefiksem 9841)
    const b1 = clean.match(/\b(9841\d{24})\b/);
    if (b1) return b1[1];
    // Lidl 24 cyfry (z prefiksem 2010)
    const b2 = clean.match(/\b(2010\d{20})\b/);
    if (b2) return b2[1];
    // Lidl / pilotaż 19 cyfr (z prefiksem 200)
    const b3 = clean.match(/\b(200\d{16})\b/);
    if (b3) return b3[1];
    // EAN-13 (13 cyfr z 99 lub 98)
    const b4 = clean.match(/\b(9[89]\d{11})\b/);
    if (b4) return b4[1];

    return null;
  }

  /**
   * Wykrywa datę wydruku i termin ważności (+30 dni lub podany bezpośrednio).
   * Obsługuje m.in. format Lidla: HH:MM:SS DD-MMM-YYYY (np. 17:06:52 16-LUT-2026)
   */
  extractDates(text) {
    if (!text) return { print_date: null, expiration_date: null };

    const MONTH_MAP = {
      // Polskie standardowe skróty
      'STY': 0, 'LUT': 1, 'MAR': 2, 'KWI': 3, 'MAJ': 4, 'CZE': 5,
      'LIP': 6, 'SIE': 7, 'WRZ': 8, 'PAZ': 9, 'PAŹ': 9, 'LIS': 10, 'GRU': 11,
      // Polskie pełne nazwy i formy deklinacyjne
      'STYCZEN': 0, 'STYCZNIA': 0, 'LUTY': 1, 'LUTEGO': 1, 'MARZEC': 2, 'MARCA': 2,
      'KWIECIEN': 3, 'KWIETNIA': 3, 'MAJA': 4, 'CZERWIEC': 5, 'CZERWCA': 5,
      'LIPIEC': 6, 'LIPCA': 6, 'SIERPIEN': 7, 'SIERPNIA': 7, 'WRZESIEN': 8, 'WRZESNIA': 8,
      'PAZDZIERNIK': 9, 'PAZDZIERNIKA': 9, 'LISTOPAD': 10, 'LISTOPADA': 10, 'GRUDZIEN': 11, 'GRUDNIA': 11,
      // Typowe błędy i zniekształcenia OCR z czcionek termicznych
      'URZ': 8, 'VRZ': 8, 'W4Z': 8, 'WRI': 8, // WRZ
      'LU1': 1, 'LU7': 1, 'LUI': 1, 'LVT': 1, // LUT
      'KW1': 3, 'KVI': 3, 'KHL': 3, // KWI
      'CRU': 11, 'G8U': 11, 'GKU': 11, 'QAU': 11, // GRU
      'S1E': 7, 'SIF': 7, 'S1F': 7, // SIE
      'L1S': 10, 'LI5': 10, 'L15': 10, // LIS
      'L1P': 6, 'LIR': 6, // LIP
      'ST1': 0, 'S1Y': 0, 'ST7': 0, // STY
      // Angielskie
      'JAN': 0, 'FEB': 1, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };

    let printDateStr = null;
    let expDateStr = null;

    // 1. Bezpośredni termin ważności z tekstu (np. "termin waznosci: 19.10.2026" lub "ważny do 19-10-2026")
    const expRegex = /(?:termin\s*wa[żz]no[sś]ci|wa[żz]n[yae]\s*do|wa[żz]no[sś][cć]|do\s*dnia)\s*[:=]?\s*(\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4})/i;
    const matchExp = text.match(expRegex);
    if (matchExp && matchExp[1]) {
      expDateStr = this.normalizeDate(matchExp[1]);
    }

    // 2. Format ze słownym skrótem miesiąca (np. Tomra / Lidl: "18:33:58 12-GRU-2025" lub "12-GRU-?")
    const textMonthRegex = /(\d{1,2})[\.\-\/\s]([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]{3,12})[\.\-\/\s](\d{4}|\d{2}|\?+)/gi;
    const textMatches = [...text.matchAll(textMonthRegex)];
    for (const match of textMatches) {
      const day = parseInt(match[1], 10);
      if (day < 1 || day > 31) continue;

      const rawMonth = match[2].toUpperCase()
        .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E')
        .replace(/Ł/g, 'L').replace(/Ń/g, 'N').replace(/Ó/g, 'O')
        .replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
      
      const month = MONTH_MAP[rawMonth] !== undefined ? MONTH_MAP[rawMonth] : MONTH_MAP[rawMonth.slice(0, 3)];
      if (month !== undefined) {
        let year;
        if (match[3] && /^\d{4}$/.test(match[3])) {
          year = parseInt(match[3], 10);
        } else if (match[3] && /^\d{2}$/.test(match[3])) {
          year = 2000 + parseInt(match[3], 10);
        } else {
          // Rok nieczytelny (np. "?") - wywnioskuj z bieżącego roku
          const currentYear = new Date().getFullYear();
          year = currentYear;
          // Jeśli ten miesiąc był w przyszłości w stosunku do bieżącego, to paragon jest z zeszłego roku
          if (month > new Date().getMonth()) {
            year = currentYear - 1;
          }
        }

        const d = new Date(Date.UTC(year, month, day));
        if (!isNaN(d.getTime())) {
          printDateStr = d.toISOString().split('T')[0];
          if (!expDateStr) {
            const exp = new Date(Date.UTC(year, month, day));
            exp.setUTCDate(exp.getUTCDate() + 30);
            expDateStr = exp.toISOString().split('T')[0];
          }
          break;
        }
      }
    }

    // 3. Zwykły format numeryczny DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
    if (!printDateStr) {
      const dateRegex = /(?:data\s*(?:wydruku|wystawienia)?\s*[:=]?\s*)?(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{4})/i;
      const matchDate = text.match(dateRegex);
      if (matchDate) {
        const day = parseInt(matchDate[1], 10);
        const month = parseInt(matchDate[2], 10) - 1;
        const year = parseInt(matchDate[3], 10);
        const d = new Date(Date.UTC(year, month, day));
        if (!isNaN(d.getTime())) {
          printDateStr = d.toISOString().split('T')[0];
          if (!expDateStr) {
            const exp = new Date(Date.UTC(year, month, day));
            exp.setUTCDate(exp.getUTCDate() + 30);
            expDateStr = exp.toISOString().split('T')[0];
          }
        }
      }
    }

    return {
      print_date: printDateStr,
      expiration_date: expDateStr
    };
  }

  normalizeDate(dateStr) {
    const parts = dateStr.split(/[\.\-\/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return dateStr;
  }

  loadImage(source) {
    return new Promise((resolve, reject) => {
      if (source instanceof Image || (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement)) return resolve(source);

      const img = new Image();
      let url = source;
      let needRevoke = false;

      if (source instanceof Blob || source instanceof File) {
        url = URL.createObjectURL(source);
        needRevoke = true;
      }

      img.onload = () => {
        if (needRevoke) URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = e => {
        if (needRevoke) URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }
}

export const OcrService = new OcrServiceClass();
