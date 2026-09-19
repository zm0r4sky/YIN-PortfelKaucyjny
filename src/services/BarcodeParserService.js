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

    // WZORZEC 2: Lidl Butelkomat Standard (Code 128 - 24 cyfry)
    // Format: 2010[4 cyfry kwota bez kaucji w gr]20[4 cyfry kaucja w gr][4 cyfry sklep][6 cyfr transakcja]
    // Przykłady: 
    // 2010 0710 20 0450 1944 115498 -> 7.10 zł + 4.50 zł = 11.60 zł (Sklep 1944)
    // 2010 0000 20 0650 1458 106421 -> 0.00 zł + 6.50 zł = 6.50 zł (Sklep 1458)
    if (code.length === 24 && code.startsWith('2010') && /^\d+$/.test(code)) {
      try {
        const nonDepositGrosze = parseInt(code.slice(4, 8), 10);
        const depositGrosze = parseInt(code.slice(10, 14), 10);
        const totalGrosze = nonDepositGrosze + depositGrosze;
        const totalPln = totalGrosze / 100;
        const storeId = code.slice(14, 18);
        const ticketId = code.slice(18, 24);

        return {
          shop_name: 'Lidl',
          amount: totalPln > 0 ? totalPln : 2.00,
          non_deposit_amount: nonDepositGrosze / 100,
          deposit_amount: depositGrosze / 100,
          store_id: storeId,
          ticket_id: ticketId,
          expiration_date: this.getDefaultExpirationDate(),
          detected: true,
          pattern_name: 'Lidl Butelkomat (Code 128 - 24 cyfry)'
        };
      } catch (err) {
        console.warn('[BarcodeParserService] Error parsing Lidl 24-digit pattern:', err);
      }
    }

    // WZORZEC 3: Lidl / Tomra Format Pilotażowy (Code 128 - 19 cyfr)
    // Format: 200[4 cyfry sklep][6 cyfr transakcja][6 cyfr kwota w groszach]
    // Przykład: 200 1173 100505 000050 -> 0.50 zł (Sklep 1173)
    if (code.length === 19 && code.startsWith('200') && /^\d+$/.test(code)) {
      try {
        const storeId = code.slice(3, 7);
        const ticketId = code.slice(7, 13);
        const amountGrosze = parseInt(code.slice(13, 19), 10);
        const totalPln = amountGrosze / 100;

        return {
          shop_name: 'Lidl',
          amount: totalPln > 0 ? totalPln : 1.00,
          store_id: storeId,
          ticket_id: ticketId,
          expiration_date: this.getDefaultExpirationDate(),
          detected: true,
          pattern_name: 'Lidl Pilotażowy (19 cyfr)'
        };
      } catch (err) {
        console.warn('[BarcodeParserService] Error parsing Lidl 19-digit pattern:', err);
      }
    }

    // WZORZEC 4: Bon EAN-13 (13 cyfr z prefiksem 99 lub 98)
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
