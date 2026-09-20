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
  async preprocessImageForOcr(imageSource) {
    const img = await this.loadImage(imageSource);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Scale to standard readable width (e.g. 1400px)
    const naturalW = img.naturalWidth || img.width || 1200;
    const naturalH = img.naturalHeight || img.height || 1600;
    const scale = Math.min(2, 1400 / naturalW);
    canvas.width = Math.round(naturalW * scale);
    canvas.height = Math.round(naturalH * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Apply high contrast filter tailored for thermal paper
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        // High contrast curve
        const enhanced = gray > 140 ? 255 : (gray < 80 ? 0 : Math.round((gray - 80) * (255 / 60)));
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {}

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
  extractShop(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // NIP lub nazwy spółek
    if (
      lower.includes('7811897358') || 
      lower.includes('jankowice') || 
      lower.includes('tarnowo podgórne') || 
      lower.includes('tarnowo podgorne') || 
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

    // Pattern 1: Słowo kluczowe + kwota (np. SUMA, SUMA RABATU, RAZEM, KAUCJA, ZWROT)
    const keywordRegex = /(?:suma\s*rabatu|suma|razem|kaucja|zwrot|wyp[łl]at[ay]|warto[sś][cć]|kwota|do\s*zap[łl]aty)\s*[:=]?\s*(\d{1,3}[,\.]\d{2})/i;
    const match1 = text.match(keywordRegex);
    if (match1 && match1[1]) {
      const val = parseFloat(match1[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 2: Kwota + PLN / ZŁ
    const currRegex = /(\d{1,3}[,\.]\d{2})\s*(?:z[łl]|pln)/i;
    const match2 = text.match(currRegex);
    if (match2 && match2[1]) {
      const val = parseFloat(match2[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 3: Wyszukaj wszystkie kwoty w tekście
    const allAmountsRegex = /\b(\d{1,2}[,\.]\d{2})\b/g;
    const matches = [...text.matchAll(allAmountsRegex)];
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
    // Biedronka (28 cyfr z prefiksem 9841)
    const b1 = text.match(/\b(9841\d{24})\b/);
    if (b1) return b1[1];
    // Lidl 24 cyfry (z prefiksem 2010)
    const b2 = text.match(/\b(2010\d{20})\b/);
    if (b2) return b2[1];
    // Lidl / pilotaż 19 cyfr (z prefiksem 200)
    const b3 = text.match(/\b(200\d{16})\b/);
    if (b3) return b3[1];
    // EAN-13 (13 cyfr z 99 lub 98)
    const b4 = text.match(/\b(9[89]\d{11})\b/);
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
