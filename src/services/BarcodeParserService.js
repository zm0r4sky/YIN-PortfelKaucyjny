/**
 * @project YIN-PortfelKaucyjny
 * @file BarcodeParserService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * Reverse-engineered barcode parser for Polish RVM & retail deposit receipts.
 * Extracts shop, amount, and dates directly from barcode data without needing heavy OCR.
 */

export const BarcodeParserService = {
  /**
   * Tries to parse barcode data into receipt fields
   * @param {string} barcode
   * @returns {{ shop_name?: string, amount?: number, expiration_date?: string, detected: boolean }}
   */
  parseBarcode(barcode) {
    if (!barcode) return { detected: false };
    const code = barcode.trim();

    // WZORZEC 1: Biedronka Recyklomat (Code 128 - 28 cyfr)
    // Przykład: 9841 01614 5531 178982337 1 00650
    if (code.length === 28 && code.startsWith('9841') && /^\d+$/.test(code)) {
      try {
        const storeId = code.slice(4, 9);
        const rawTimestamp = code.slice(13, 22);
        const amountGrosze = parseInt(code.slice(23, 28), 10);
        const amountPln = amountGrosze / 100;

        // Dekodowanie Unix timestamp (178982337 -> 1789823370 sekund)
        const timestampSeconds = parseInt(rawTimestamp, 10) * 10;
        const printDate = new Date(timestampSeconds * 1000);

        // Ważność: dokładnie 30 dni od wydruku
        const expDate = new Date(printDate);
        expDate.setDate(expDate.getDate() + 30);

        const expDateStr = !isNaN(expDate.getTime()) 
          ? expDate.toISOString().split('T')[0] 
          : this.getDefaultExpirationDate();

        return {
          shop_name: 'Biedronka',
          amount: amountPln > 0 ? amountPln : 2.00,
          expiration_date: expDateStr,
          store_id: storeId,
          detected: true,
          pattern_name: 'Biedronka Recyklomat (Code 128)'
        };
      } catch (err) {
        console.warn('[BarcodeParserService] Error parsing Biedronka pattern:', err);
      }
    }

    // WZORZEC 2: Bon EAN-13 (13 cyfr z prefiksem 99 lub 98)
    if (code.length === 13 && /^\d+$/.test(code) && (code.startsWith('99') || code.startsWith('98'))) {
      return {
        shop_name: 'Lidl', // Częsty prefiks bonów kaucji
        amount: 1.00,
        expiration_date: this.getDefaultExpirationDate(),
        detected: true,
        pattern_name: 'Kupon EAN-13'
      };
    }

    // Domyślne wartości dla nierozpoznanych kodów
    return {
      shop_name: 'Biedronka',
      amount: 2.00,
      expiration_date: this.getDefaultExpirationDate(),
      detected: false
    };
  },

  getDefaultExpirationDate() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
};
