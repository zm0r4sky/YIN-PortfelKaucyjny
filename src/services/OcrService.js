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
    const scale = Math.min(2, 1400 / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Apply high contrast filter
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
   * @param {Blob|File|string} imageSource
   * @param {Function} onProgress
   * @returns {Promise<{ rawText: string, confidence: number, extracted: { shop_name: string|null, amount: number|null, expiration_date: string|null } }>}
   */
  async recognizeReceipt(imageSource, onProgress) {
    const worker = await this.getWorker(onProgress);
    const processedCanvas = await this.preprocessImageForOcr(imageSource);

    const ret = await worker.recognize(processedCanvas);
    const text = ret.data.text || '';
    const confidence = ret.data.confidence || 0;

    const extracted = {
      shop_name: this.extractShop(text),
      amount: this.extractAmount(text),
      expiration_date: this.extractExpirationDate(text)
    };

    return {
      rawText: text,
      confidence,
      extracted
    };
  }

  /**
   * Detects shop name from keywords
   */
  extractShop(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    if (lower.includes('biedronka') || lower.includes('jeronimo') || lower.includes('martins')) {
      return 'Biedronka';
    }
    if (lower.includes('lidl')) {
      return 'Lidl';
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
      return 'Biedronka'; // Najczęstszy recyklomat Tomra w Polsce
    }

    return null;
  }

  /**
   * Detects deposit amount from keywords (SUMA, RAZEM, KAUCJA, ZWROT, etc.)
   */
  extractAmount(text) {
    if (!text) return null;

    // Pattern 1: Słowo kluczowe + kwota
    const keywordRegex = /(?:suma|razem|kaucja|zwrot|wyp[łl]at[ay]|warto[sś][cć]|kwota|do\s*zap[łl]aty)\s*[:=]?\s*(\d{1,3}[,\.]\d{2})/i;
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

    // Pattern 3: Wyszukaj wszystkie kwoty w tekście i weź sensowną wartość kaucji
    const allAmountsRegex = /\b(\d{1,2}[,\.]\d{2})\b/g;
    const matches = [...text.matchAll(allAmountsRegex)];
    if (matches.length > 0) {
      // Ostatnia wymieniona kwota na paragonie często jest sumą końcową
      const lastMatch = matches[matches.length - 1];
      const val = parseFloat(lastMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    return null;
  }

  /**
   * Detects expiration date or receipt date (+ 30 days)
   */
  extractExpirationDate(text) {
    if (!text) return null;

    // 1. Wyszukaj bezpośredni termin ważności po słowach: termin, ważny do, ważność
    const expRegex = /(?:termin\s*wa[żz]no[sś]ci|wa[żz]n[yae]\s*do|wa[żz]no[sś][cć]|do\s*dnia)\s*[:=]?\s*(\d{2}[\.\-\/]\d{2}[\.\-\/]\d{4})/i;
    const matchExp = text.match(expRegex);
    if (matchExp && matchExp[1]) {
      return this.normalizeDate(matchExp[1]);
    }

    // 2. Wyszukaj datę wydruku DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY lub YYYY-MM-DD
    const dateRegex = /(?:data\s*(?:wydruku|wystawienia)?\s*[:=]?\s*)?(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{4})/i;
    const matchDate = text.match(dateRegex);
    if (matchDate) {
      // Data wydruku -> dodajemy 30 dni ważności (standard sklepowy)
      const day = parseInt(matchDate[1], 10);
      const month = parseInt(matchDate[2], 10) - 1;
      const year = parseInt(matchDate[3], 10);
      const printDate = new Date(year, month, day);

      if (!isNaN(printDate.getTime())) {
        const exp = new Date(printDate);
        exp.setDate(exp.getDate() + 30);
        return exp.toISOString().split('T')[0];
      }
    }

    return null;
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
      if (source instanceof Image) return resolve(source);

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
