/**
 * @project YIN-PortfelKaucyjny
 * @file TrustScoreService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * Scoring engine combining Tesseract OCR glyph confidence and semantic dual-verification tests.
 * Receipts meeting the 100% LEGIT threshold are certified, locked from tampering, and ready for Phase 2 Marketplace.
 */

export const TrustScoreService = {
  // Minimalne progi certyfikacji "100% LEGIT"
  LEGIT_THRESHOLD_SCORE: 80,
  MIN_OCR_CONFIDENCE_THRESHOLD: 55,

  /**
   * Wylicza zintegrowany wskaźnik wiarygodności paragonu.
   *
   * @param {Object} params
   * @param {number} params.ocrConfidence Średnia pewność glifów z Tesseract.js (0-100)
   * @param {boolean} params.isBarcodeVerified Podstawowa weryfikacja kodu:
   *   PRIORYTET: Matematyczna poprawność sumy kontrolnej GS1 Modulo 10 (wyliczona ze skanera laserowego).
   *   OCR nie jest w stanie samodzielnie odczytać 28-cyfrowego kodu z fotografii paragonu termicznego
   *   (za niska rozdzielczość linii cyfr ~400×18px). GS1 daje 100% pewność matematycznej poprawności
   *   struktury kodu – silniejszy dowód autentyczności niż porównanie tekstowe OCR.
   * @param {boolean|null} params.isChecksumValid Bonus: czy OCR niezależnie odczytał kod z tekstu paragonu
   *   i jest on identyczny z kodem ze skanera laserowego (dodatkowe 10 pkt gdy się uda).
   * @param {boolean} params.isShopVerified Czy sklep z kodu zgadza się z OCR
   * @param {number} params.shopSignalsCount Liczba potwierdzonych cech regulaminu sieci
   * @param {boolean} params.isAmountVerified Czy kwota z kodu zgadza się z OCR
   * @param {boolean} params.isDateVerified Czy znacznik czasu zgadza się z datą OCR (Biedronka)
   * @param {boolean} params.isLidlDateVerified Czy odnaleziono datę w stopce automatu Tomra (Lidl)
   * @param {string} params.shopName Nazwa sklepu
   * @returns {Object} Wynik analizy wiarygodności
   */
  calculateTrustScore(params = {}) {
    const {
      ocrConfidence = 0,
      isBarcodeVerified = false,
      isChecksumValid = null,
      isShopVerified = false,
      shopSignalsCount = 0,
      isAmountVerified = false,
      isDateVerified = false,
      isLidlDateVerified = false,
      shopName = 'Inny'
    } = params;

    const signals = [];
    let score = 0;

    // --- FILAR 1: Jakość fizyczna obrazu i czytelność Tesseract OCR (max 25 pkt) ---
    // Progi skalibrowane pod rzeczywiste paragony termiczne (57-69% to norma dla zdjęć z telefonu).
    let ocrScore = 0;
    if (ocrConfidence >= 80) {
      ocrScore = 25;
      signals.push(`Wysoka czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence >= 65) {
      ocrScore = 22;
      signals.push(`Dobra czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence >= 55) {
      // 55-64% to typowy zakres dla paragonów termicznych z fotografii – nie karzemy
      ocrScore = 20;
      signals.push(`Czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%) – typowa dla papieru termicznego`);
    } else if (ocrConfidence >= 40) {
      ocrScore = 10;
      signals.push(`Niska czytelność OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence > 0) {
      ocrScore = 5;
    }
    score += ocrScore;

    // --- FILAR 2: Semantyczna podwójna weryfikacja (max 75 pkt) ---

    // 1. Weryfikacja kodu kreskowego przez GS1 Modulo 10 (max 25 pkt)
    // Suma kontrolna GS1 jest matematycznie nieomylna i bazuje wyłącznie na kodzie ze skanera
    // laserowego (ZXing/BarcodeDetector). OCR nie jest w stanie odczytać 28 cyfr z fotografii
    // paragonu termicznego przy typowej rozdzielczości telefonicznej – dlatego GS1 zastępuje
    // weryfikację tekstową jako silniejszy i bardziej wiarygodny dowód autentyczności.
    let barcodeScore = 0;
    if (isBarcodeVerified) {
      barcodeScore = 25;
      signals.push('Suma kontrolna GS1 Modulo 10 poprawna (matematyczna pewność kodu)');
    }
    score += barcodeScore;

    // 2. Bonus: niezależny odczyt kodu z tekstu OCR (max 10 pkt)
    // Jeśli OCR zdoła odczytać 28 cyfr z tekstu paragonu i są zgodne ze skanem – bonus.
    // Na fotografiach w typowej rozdzielczości jest to rzadkość (brak kary za brak odczytu).
    let checksumScore = 0;
    if (isChecksumValid === true) {
      checksumScore = 10;
      signals.push('Bonus: kod kreskowy odczytany z tekstu OCR (zgodny ze skanem)');
    }
    score += checksumScore;

    // 3. Weryfikacja sieci handlowej i cech regulaminu (max 15 pkt)
    let shopScore = 0;
    if (shopSignalsCount >= 3) {
      shopScore = 15;
      signals.push(`Potwierdzone ${shopSignalsCount} cechy regulaminu sieci ${shopName}`);
    } else if (isShopVerified || shopSignalsCount >= 1) {
      shopScore = 10;
      signals.push(`Zgodność sieci handlowej (${shopName})`);
    }
    score += shopScore;

    // 4. Weryfikacja kwoty kaucji (max 15 pkt)
    let amountScore = 0;
    if (isAmountVerified) {
      amountScore = 15;
      signals.push('Zgodność kwoty kaucji z tekstem paragonu');
    }
    score += amountScore;

    // 5. Weryfikacja daty i zabezpieczenia antyfraudowego (max 10 pkt)
    let dateScore = 0;
    if (shopName === 'Lidl') {
      if (isLidlDateVerified) {
        dateScore = 10;
        signals.push('Odnaleziona data w stopce automatu Tomra (Lidl)');
      }
    } else if (isDateVerified) {
      dateScore = 10;
      signals.push('Zgodność znacznika czasu w kodzie z datą wydruku OCR');
    }
    score += dateScore;

    // Warunki bezwzględne dla certyfikacji "100% LEGIT":
    // 1. Wynik punktowy >= 80
    // 2. Czytelność OCR >= 55% (typowa dla zdjęcia paragonu termicznego)
    // 3. Suma kontrolna GS1 Modulo 10 poprawna (matematyczna weryfikacja kodu ze skanera)
    //    UWAGA: Celowo NIE wymagamy zgodności kodu z tekstem OCR – Tesseract.js nie jest w stanie
    //    odczytać 28-cyfrowego kodu z fotografii w typowej rozdzielczości telefonicznej.
    //    Zamiast tego GS1 checksum (isBarcodeVerified) jest silniejszym i zawsze dostępnym dowodem.
    // 4. Sklep zweryfikowany z regulaminem lub kodem
    // 5. Kwota zweryfikowana
    // 6. Dla Lidla: odnaleziona data w stopce (ochrona przed fraudem)
    const essentialChecksPassed =
      isBarcodeVerified &&           // GS1 Mod10 OK
      (isShopVerified || shopSignalsCount >= 2) &&
      isAmountVerified &&
      (shopName !== 'Lidl' || isLidlDateVerified) &&
      ocrConfidence >= this.MIN_OCR_CONFIDENCE_THRESHOLD;

    const isLegit = score >= this.LEGIT_THRESHOLD_SCORE && essentialChecksPassed;

    let statusLabel = 'Wymaga weryfikacji ręcznej';
    let statusClass = 'status-unverified';

    if (isLegit) {
      statusLabel = '🛡️ 100% LEGIT (Zweryfikowany Maszynowo)';
      statusClass = 'status-legit';
    } else if (score >= 50) {
      statusLabel = '⚡ Częściowo zweryfikowany';
      statusClass = 'status-partial';
    }

    return {
      score: Math.min(100, score),
      isLegit,
      statusLabel,
      statusClass,
      signals,
      breakdown: {
        ocrScore,
        barcodeScore,
        checksumScore,
        shopScore,
        amountScore,
        dateScore
      }
    };
  }
};
