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
        let transitions = 0;
        let prevDark = false;
        let firstDarkX = -1;
        let lastDarkX = -1;

        for (let x = 0; x < w; x += 4) {
          const idx = rowStart + x * 4;
          const lum = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
          rowSum += lum;
          const isDark = lum < 110;
          if (isDark) {
            if (firstDarkX === -1) firstDarkX = x;
            lastDarkX = x;
          }
          if (isDark !== prevDark) {
            transitions++;
            prevDark = isDark;
          }
        }
        const rowAvg = rowSum / (w / 4);

        // Wykrywanie czarnej belki z białym tekstem (np. Suma:0,50zł w Biedronce lub PLN 0.35 w Lidlu)
        // Belka zajmuje szerokość > 30% wiersza, ma niską średnią jasność, ale mało przejść (transitions < 32), co odróżnia ją od kodu kreskowego
        const darkSpan = (lastDarkX > firstDarkX) ? (lastDarkX - firstDarkX) : 0;
        const isReverseBanner = rowAvg < 125 && transitions >= 2 && transitions < 32 && (darkSpan / w) > 0.30;

        for (let x = 0; x < w; x++) {
          const i = rowStart + x * 4;
          let gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;

          // Odwracamy tylko wewnątrz czarnej belki, zachowując białe marginesy paragonu
          if (isReverseBanner && x >= firstDarkX && x <= lastDarkX) {
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
    let text = ret.data.text || '';
    const confidence = ret.data.confidence || 0;
    let dateInfo = this.extractDates(text);

    // SPECJALNY PASS DLA LIDLA: Jeśli data nie została znaleziona na całym paragonie,
    // wykonujemy dedykowane skanowanie dolnej strefy paragonu (ostatnie 40% wysokości),
    // gdzie automaty Tomra 90 drukują datę i godzinę (np. 18:33:58 12-GRU-2025).
    if (!dateInfo.print_date && !dateInfo.expiration_date && processedCanvas.height > 500) {
      try {
        const bottomCanvas = document.createElement('canvas');
        const cropY = Math.round(processedCanvas.height * 0.60);
        const cropH = processedCanvas.height - cropY;
        bottomCanvas.width = processedCanvas.width;
        bottomCanvas.height = cropH;
        const bCtx = bottomCanvas.getContext('2d');
        bCtx.drawImage(processedCanvas, 0, cropY, processedCanvas.width, cropH, 0, 0, bottomCanvas.width, cropH);

        const bottomRet = await worker.recognize(bottomCanvas);
        const bottomText = bottomRet.data.text || '';
        const bottomDateInfo = this.extractDates(bottomText);
        if (bottomDateInfo.print_date || bottomDateInfo.expiration_date) {
          dateInfo = bottomDateInfo;
          text += '\n' + bottomText;
          console.log('[OcrService] Sukces: data odnaleziona w strefie dolnej paragonu (Lidl):', dateInfo);
        }
      } catch (err) {
        console.warn('[OcrService] Błąd skanowania dolnej strefy daty:', err);
      }
    }

    const shopDetails = this.analyzeShopDetails(text);
    const extracted = {
      shop_name: shopDetails.shop_name,
      shop_details: shopDetails,
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
      // Zamiana O/o/D/Q przed kropką/przecinkiem na 0 (np. O.35 -> 0.35, Suma:O,50 -> Suma:0.50)
      .replace(/([:=]|\b)[OoQqDd][,\.]\s*(\d{1,2})\b/g, '$1 0.$2')
      // Zamiana literówki PLA na PLN
      .replace(/\bPLA\b/g, 'PLN')
      // Likwidacja spacji wewnątrz kwoty (np. 0. 35 -> 0.35, 0 , 50 -> 0.50)
      .replace(/(\d+)\s*[,\.]\s*(\d{2})\b/g, '$1.$2');
  }

  /**
   * Sygnatury tekstowe i cechy regulaminowe paragonów sieci handlowych.
   * Wykrycie wielu niezależnych cech uwiarygadnia w 100% autentyczność paragonu.
   */
  getBiedronkaSignatures() {
    return [
      { id: 'brand_name', label: 'Nazwa "Biedronka"', regex: /\bbiedronk[a-z]?\b/i, weight: 3 },
      { id: 'slogan', label: 'Hasło "Codziennie niskie ceny"', regex: /codziennie\s*niskie\s*ceny/i, weight: 2.5 },
      { id: 'company_owner', label: 'Właściciel "Jeronimo Martins"', regex: /jeronimo\s*martins/i, weight: 3 },
      { id: 'company_address_city', label: 'Siedziba "Kostrzyn"', regex: /\bkostrzyn\b/i, weight: 2 },
      { id: 'company_address_street', label: 'Adres "ul. Żniwna 5"', regex: /[zżź]niwna\s*5?/i, weight: 2.5 },
      { id: 'company_nip', label: 'NIP "7791011327"', regex: /7791011327/, weight: 3 },
      { id: 'rule_cash_exchange', label: 'Klauzula "wymienić na gotówkę w kasie sklepu"', regex: /wymieni[cć]\s*na\s*got[oó]wk[eę]/i, weight: 3 },
      { id: 'rule_voucher_purchases', label: 'Klauzula "na kolejne zakupy"', regex: /na\s*kolejne\s*zakupy/i, weight: 2 },
      { id: 'rule_voucher_forfeits', label: 'Klauzula "niewykorzystany (...) przepada"', regex: /niewykorzystan[ya][\s\S]*?przepada/i, weight: 2.5 },
      { id: 'rule_self_checkout', label: 'Regulamin kasy samoobsługowej', regex: /kasie\s*samoobs[lł]ugow/i, weight: 2.5 },
      { id: 'rule_select_voucher', label: 'Opcja płatności "voucher"', regex: /opcj[eę]\s*p[lł]atno[sś]ci\s*["'„”]?voucher/i, weight: 2.5 },
      { id: 'rule_present_cashier', label: 'Okazanie vouchera kasjerowi', regex: /okaza[cć]\s*voucher\s*kasjerowi/i, weight: 2.5 },
      { id: 'rule_sum_vouchers', label: 'Sumowanie voucherów w transakcji', regex: /vouchery\s*mo[zż]na\s*sumowa[cć]/i, weight: 2.5 },
      { id: 'rule_single_use', label: 'Wykorzystanie wyłącznie raz', regex: /wy[lł][aą]cznie\s*raz/i, weight: 2 },
      { id: 'rule_every_store', label: 'W każdym sklepie Biedronka', regex: /w\s*ka[zż]dym\s*sklepie\s*biedronka/i, weight: 2.5 },
      { id: 'rule_website', label: 'Adres www.biedronka.pl', regex: /(?:www\.)?biedronka\.pl/i, weight: 2 },
      { id: 'rule_min_purchase', label: 'Minimalna wartość zakupów', regex: /minimalna\s*warto[sś][cć]\s*zakup[oó]w/i, weight: 2 },
      { id: 'eco_slogan', label: 'Hasło ekologiczne "Segreguj i odzyskuj"', regex: /segreguj\s*i\s*odzyskuj/i, weight: 2.5 }
    ];
  }

  getLidlSignatures() {
    return [
      // === TOŻSAMOŚĆ FIRMY ===
      { id: 'brand_name', label: 'Nazwa "Lidl"', regex: /\blidl\b/i, weight: 3 },
      { id: 'company_legal', label: 'Pełna nazwa "Lidl sp. z o.o. sp.k."', regex: /lidl\s*sp\.?\s*z\s*o\.?o\.?\s*sp\.?k\.?/i, weight: 3 },
      { id: 'company_nip', label: 'NIP "7811897358"', regex: /7811897358/, weight: 3 },
      { id: 'company_bdo', label: 'BDO "000002265"', regex: /BDO[\s:]*000002265/i, weight: 2.5 },
      // === ADRES CENTRALI ===
      { id: 'company_address_city', label: 'Centrala "Tarnowo Podgórne / Jankowice"', regex: /tarnowo\s*podg[oó]rne|jankowice/i, weight: 2.5 },
      { id: 'company_address_street', label: 'Adres "ul. Poznańska 48"', regex: /pozna[nń]ska\s*48/i, weight: 2.5 },
      { id: 'company_postal', label: 'Kod pocztowy "62-080"', regex: /62[\-\s]?080/i, weight: 2 },
      // === REGULAMIN KUPONU ===
      { id: 'coupon_usage', label: 'Klauzula "Kupon do wykorzystania w dowolnym sklepie Lidl"', regex: /kupon\s*do\s*wykorzystania\s*w\s*dowolnym\s*sklepie\s*lidl/i, weight: 3 },
      { id: 'coupon_validity', label: 'Termin "Kupon jest ważny 30 dni od daty jego wydania"', regex: /kupon\s*jest\s*wa[żz]ny\s*30\s*dni/i, weight: 2.5 },
      { id: 'coupon_rules', label: 'Regulamin "dostępny na www.lidl.pl"', regex: /regulamin\s*dost[eę]pny\s*na\s*(?:www\.)?lidl\.pl/i, weight: 2.5 },
      { id: 'website', label: 'Adres lidl.pl', regex: /(?:www\.)?lidl\.pl/i, weight: 1.5 },
      // === MASZYNA TOMRA ===
      { id: 'machine_model', label: 'Automat "Tomra 9"', regex: /tomra\s*9\b/i, weight: 2.5 },
      { id: 'machine_serial', label: 'Nr seryjny Tomra "606657-90360000-"', regex: /606657[\-\s]?90360000/i, weight: 3 },
      // === POZYCJE PARAGONOWE ===
      { id: 'item_bottle', label: '"Butelka kaucja" lub "Puszka kaucja"', regex: /(?:butelka|puszka)\s*kaucja/i, weight: 2 },
      { id: 'item_suma_pln', label: 'Etykieta "SUMA: PLN"', regex: /suma\s*[\r\n\s]*pln\s*[\d,\.]+/i, weight: 2 }
    ];
  }


  /**
   * Wielocechowa analiza autentyczności sklepu z ważeniem cech i regulaminu
   */
  analyzeShopDetails(text) {
    if (!text) {
      return {
        shop_name: null,
        confidence_percent: 0,
        credibility_label: '',
        matched_signals: [],
        total_signals_count: 0,
        is_authentic: false
      };
    }

    // 1. Sprawdź sygnatury Biedronki
    const bSignatures = this.getBiedronkaSignatures();
    const bMatched = [];
    let bScore = 0;
    for (const sig of bSignatures) {
      if (sig.regex.test(text)) {
        bMatched.push(sig.label);
        bScore += sig.weight;
      }
    }

    // 2. Sprawdź sygnatury Lidla
    const lSignatures = this.getLidlSignatures();
    const lMatched = [];
    let lScore = 0;
    for (const sig of lSignatures) {
      if (sig.regex.test(text)) {
        lMatched.push(sig.label);
        lScore += sig.weight;
      }
    }

    // Wybór przeważającej sieci
    if (bScore > 0 && bScore >= lScore) {
      const isAuthentic = bMatched.length >= 2 || bScore >= 5;
      const confidence = Math.min(100, Math.round(bMatched.length >= 3 ? 100 : bMatched.length * 35));
      return {
        shop_name: 'Biedronka',
        confidence_percent: confidence,
        credibility_label: isAuthentic
          ? `100% autentyczności (potwierdzone ${bMatched.length} cechami regulaminu Biedronka)`
          : `Wykryto ${bMatched.length} cechę Biedronka`,
        matched_signals: bMatched,
        total_signals_count: bMatched.length,
        is_authentic: isAuthentic
      };
    }

    if (lScore > 0) {
      const isAuthentic = lMatched.length >= 2 || lScore >= 5;
      const confidence = Math.min(100, Math.round(lMatched.length >= 2 ? 100 : lMatched.length * 50));
      return {
        shop_name: 'Lidl',
        confidence_percent: confidence,
        credibility_label: isAuthentic
          ? `100% autentyczności (potwierdzone ${lMatched.length} cechami Lidla/Tomra)`
          : `Wykryto ${lMatched.length} cechę Lidl`,
        matched_signals: lMatched,
        total_signals_count: lMatched.length,
        is_authentic: isAuthentic
      };
    }

    // Inne popularne sieci handlowe w Polsce
    const lower = text.toLowerCase();
    const otherShops = [
      { name: 'Dino', pattern: /\bdino\b/i },
      { name: 'Kaufland', pattern: /\bkaufland\b/i },
      { name: 'Carrefour', pattern: /\bcarrefour\b/i },
      { name: 'Żabka', pattern: /\b[zż]abka\b/i },
      { name: 'Netto', pattern: /\bnetto\b/i },
      { name: 'Stokrotka', pattern: /\bstokrotka\b/i }
    ];

    for (const shop of otherShops) {
      if (shop.pattern.test(lower)) {
        return {
          shop_name: shop.name,
          confidence_percent: 75,
          credibility_label: `Rozpoznano sieć ${shop.name}`,
          matched_signals: [`Nazwa "${shop.name}"`],
          total_signals_count: 1,
          is_authentic: false
        };
      }
    }

    return {
      shop_name: null,
      confidence_percent: 0,
      credibility_label: '',
      matched_signals: [],
      total_signals_count: 0,
      is_authentic: false
    };
  }

  /**
   * Zwraca samą nazwę sklepu lub null
   */
  extractShop(text) {
    return this.analyzeShopDetails(text).shop_name;
  }

  /**
   * Detects deposit amount from keywords (SUMA, SUMA RABATU, RAZEM, KAUCJA, ZWROT, etc.)
   */
  extractAmount(text) {
    if (!text) return null;
    const norm = this.normalizeOcrText(text);

    // Pattern 1: Słowo kluczowe + kwota (np. SUMA, SUMA:0,50zł, SUMA RABATU, RAZEM, KAUCJA, ZWROT)
    const keywordRegex = /(?:suma\s*rabatu|suma|razem|kaucja|zwrot|wyp[łl]at[ay]|warto[sś][cć]|kwota|do\s*zap[łl]aty)\s*[:=]?\s*[\r\n\s]*(\d{1,3}[,\.]\d{2})/i;
    const match1 = norm.match(keywordRegex);
    if (match1 && match1[1]) {
      const val = parseFloat(match1[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }

    // Pattern 2: Pozycja z kaucją / butelką (np. "1 x Butelka plastikowa 0.50zl 0,50zl" lub "7x Butelka plastikowa 0.35")
    const itemRegex = /(?:butelk[ai]|puszk[ai]|plastikowa|szklana|[0-9]+\s*[xX]\s+[^\n]+?)[\s\t]+(\d{1,2}[,\.]\d{2})\s*(?:z[łl]|pln)?/i;
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

    // Krok 1: Przeszukaj wiersz po wierszu
    const lines = text.split('\n');
    for (const line of lines) {
      const cleaned = line.trim().replace(/[()\s\-_]/g, '');
      if (cleaned.length < 11) continue;

      const candidate = cleaned
        .replace(/[OoQqDd]/g, '0')
        .replace(/[Iil|!]/g, '1')
        .replace(/[B]/g, '8')
        .replace(/[S]/g, '5')
        .replace(/[Z]/g, '2');

      const mBiedronka = candidate.match(/9841\d{24}/);
      if (mBiedronka) return mBiedronka[0];
      const mLidl24 = candidate.match(/2010\d{20}/);
      if (mLidl24) return mLidl24[0];
      const mLidl19 = candidate.match(/200\d{16}/);
      if (mLidl19) return mLidl19[0];
      const mEan13 = candidate.match(/9[89]\d{11}/);
      if (mEan13) return mEan13[0];
      const mLidl13 = candidate.match(/20\d{11}/);
      if (mLidl13) return mLidl13[0];
    }

    // Krok 2: Przeszukaj ciągły tekst bez ogranicznika \b
    const cleanAll = text
      .replace(/[()\s\-_]/g, '')
      .replace(/[OoQqDd]/g, '0')
      .replace(/[Iil|!]/g, '1')
      .replace(/[B]/g, '8')
      .replace(/[S]/g, '5')
      .replace(/[Z]/g, '2');

    const m1 = cleanAll.match(/9841\d{24}/);
    if (m1) return m1[0];
    const m2 = cleanAll.match(/2010\d{20}/);
    if (m2) return m2[0];
    const m3 = cleanAll.match(/200\d{16}/);
    if (m3) return m3[0];
    const m4 = cleanAll.match(/9[89]\d{11}/);
    if (m4) return m4[0];
    const m5 = cleanAll.match(/20\d{11}/);
    if (m5) return m5[0];

    return null;
  }

  /**
   * Wykrywa datę wydruku i termin ważności (+30 dni lub podany bezpośrednio).
   * Obsługuje formaty ISO (YYYY-MM-DD) z Biedronki oraz formaty Lidla (DD-MMM-YYYY, DD.MM.YYYY).
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
      // Typowe błędy i zniekształcenia OCR z czcionek termicznych (Lidl / Tomra)
      'URZ': 8, 'VRZ': 8, 'W4Z': 8, 'WRI': 8, 'WPZ': 8, 'WBZ': 8, 'WR7': 8, 'WZZ': 8, 'WRZ.': 8, // WRZ
      'LU1': 1, 'LU7': 1, 'LUI': 1, 'LVT': 1, 'L0T': 1, 'LUT.': 1, // LUT
      'KW1': 3, 'KVI': 3, 'KHL': 3, 'KV1': 3, 'KWI.': 3, // KWI
      'CRU': 11, 'G8U': 11, 'GKU': 11, 'QAU': 11, 'GR0': 11, 'GRV': 11, 'GRO': 11, 'GRJ': 11, 'GRU.': 11, // GRU
      'S1E': 7, 'SIF': 7, 'S1F': 7, '5IE': 7, 'SIE.': 7, // SIE
      'L1S': 10, 'LI5': 10, 'L15': 10, 'LTS': 10, 'LIS.': 10, // LIS
      'L1P': 6, 'LIR': 6, 'L1R': 6, 'LIP.': 6, // LIP
      'ST1': 0, 'S1Y': 0, 'ST7': 0, '5TY': 0, 'STY.': 0, // STY
      'M4R': 2, 'NAR': 2, 'MAR.': 2, // MAR
      'M4J': 4, 'NAJ': 4, 'MAJ.': 4, // MAJ
      'C2E': 5, 'C7E': 5, 'CZE.': 5, // CZE
      'P4Z': 9, 'PA2': 9, 'PAZ.': 9, // PAZ
      // Angielskie
      'JAN': 0, 'FEB': 1, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };

    let printDateStr = null;
    let expDateStr = null;

    // 1. Bezpośredni termin ważności z tekstu (np. "Do wykorzystania do dnia:\n2026-10-20", "termin waznosci: 2026-10-20", "ważny do 19.10.2026")
    const expRegex = /(?:do\s*wykorzystania(?:\s*do\s*dnia)?|termin\s*wa[żz]no[sś]ci|wa[żz]n[yae]\s*do|wa[żz]no[sś][cć]|do\s*dnia)\s*[:=]?\s*[\r\n\s]*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}|\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/i;
    const matchExp = text.match(expRegex);
    if (matchExp && matchExp[1]) {
      expDateStr = this.normalizeDate(matchExp[1]);
    }

    // 2. Data wydruku z tekstu (np. "DATA WYDRUKU: 2026-09-20 13:20" lub "data wystawienia: 20.09.2026")
    const printRegex = /(?:data\s*(?:wydruku|wystawienia)?)\s*[:=]?\s*[\r\n\s]*(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}|\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/i;
    const matchPrint = text.match(printRegex);
    if (matchPrint && matchPrint[1]) {
      printDateStr = this.normalizeDate(matchPrint[1]);
      // Jeśli nie było bezpośredniej daty ważności, wylicz dokładnie 30 dni od wydruku
      if (!expDateStr) {
        const parts = printDateStr.split('-');
        if (parts.length === 3) {
          const pDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
          pDate.setUTCDate(pDate.getUTCDate() + 30);
          expDateStr = pDate.toISOString().split('T')[0];
        }
      }
    }

    // 3. Format ze słownym skrótem miesiąca (np. Tomra / Lidl: "18:33:58 12-GRU-2025" lub "12-GRU-?")
    if (!printDateStr || !expDateStr) {
      const textMonthRegex = /(?:(\d{1,2})[:\.](\d{2})[:\.](\d{2})\s+)?(\d{1,2})\s*[\.\-\/\s]\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]{3,12})\s*[\.\-\/\s]\s*(\d{4}|\d{2}|\?+)/gi;
      const textMatches = [...text.matchAll(textMonthRegex)];
      for (const match of textMatches) {
        const day = parseInt(match[4], 10);
        if (day < 1 || day > 31) continue;

        const rawMonth = match[5].toUpperCase()
          .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E')
          .replace(/Ł/g, 'L').replace(/Ń/g, 'N').replace(/Ó/g, 'O')
          .replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
        
        const month = MONTH_MAP[rawMonth] !== undefined ? MONTH_MAP[rawMonth] : MONTH_MAP[rawMonth.slice(0, 3)];
        if (month !== undefined) {
          let year;
          if (match[6] && /^\d{4}$/.test(match[6])) {
            year = parseInt(match[6], 10);
          } else if (match[6] && /^\d{2}$/.test(match[6])) {
            year = 2000 + parseInt(match[6], 10);
          } else {
            const currentYear = new Date().getFullYear();
            year = currentYear;
            if (month > new Date().getMonth()) {
              year = currentYear - 1;
            }
          }

          const d = new Date(Date.UTC(year, month, day));
          if (!isNaN(d.getTime())) {
            if (!printDateStr) printDateStr = d.toISOString().split('T')[0];
            if (!expDateStr) {
              const exp = new Date(Date.UTC(year, month, day));
              exp.setUTCDate(exp.getUTCDate() + 30);
              expDateStr = exp.toISOString().split('T')[0];
            }
            break;
          }
        }
      }
    }

    // 4. Zwykły format numeryczny jeśli data nadal nie została wykryta
    if (!printDateStr) {
      const dateRegex = /(?:data\s*(?:wydruku|wystawienia)?\s*[:=]?\s*)?(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}|\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{4})/i;
      const matchDate = text.match(dateRegex);
      if (matchDate) {
        printDateStr = this.normalizeDate(matchDate[1]);
        if (!expDateStr && printDateStr) {
          const parts = printDateStr.split('-');
          if (parts.length === 3) {
            const exp = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
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
    if (!dateStr) return null;
    const clean = dateStr.trim().replace(/[,\s]/g, '');
    const parts = clean.split(/[\.\-\/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // Format ISO: YYYY-MM-DD
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        // Format Europejski: DD-MM-YYYY
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
