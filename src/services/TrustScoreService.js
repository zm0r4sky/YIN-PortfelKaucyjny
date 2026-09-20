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
   * @param {boolean} params.isBarcodeVerified Czy kod ze skanera jest w 100% identyczny z tekstem OCR
   * @param {boolean|null} params.isChecksumValid Czy cyfra kontrolna GS1 Modulo 10 jest poprawna
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
    let ocrScore = 0;
    if (ocrConfidence >= 80) {
      ocrScore = 25;
      signals.push(`Wysoka czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence >= 65) {
      ocrScore = 20;
      signals.push(`Dobra czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence >= 50) {
      ocrScore = 12;
      signals.push(`Umiarkowana czytelność tekstu OCR (${ocrConfidence.toFixed(0)}%)`);
    } else if (ocrConfidence > 0) {
      ocrScore = 5;
    }
    score += ocrScore;

    // --- FILAR 2: Semantyczna podwójna weryfikacja (max 75 pkt) ---

    // 1. Zgodność numeru kodu kreskowego (max 25 pkt)
    let barcodeScore = 0;
    if (isBarcodeVerified) {
      barcodeScore = 25;
      signals.push('100% zgodność kodu kreskowego (skaner + OCR)');
    }
    score += barcodeScore;

    // 2. Suma kontrolna GS1 Modulo 10 (max 10 pkt)
    let checksumScore = 0;
    if (isChecksumValid === true) {
      checksumScore = 10;
      signals.push('Prawidłowa suma kontrolna GS1 Modulo 10');
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
    // 2. Czytelność OCR >= 55%
    // 3. Kod kreskowy zgodny ze skanem i tekstem OCR
    // 4. Sklep zweryfikowany z regulaminem lub kodem
    // 5. Kwota zweryfikowana
    // 6. Dla Lidla: odnaleziona data w stopce (ochrona przed fraudem)
    const essentialChecksPassed =
      isBarcodeVerified &&
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
