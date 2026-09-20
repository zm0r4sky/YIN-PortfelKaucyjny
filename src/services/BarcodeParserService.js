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
   * Oczyszcza kod z nawiasów GS1 Application Identifier (np. (20)01(94)... -> 200194...), spacji i myślników
   * @param {string} barcode
   * @returns {string}
   */
  cleanBarcode(barcode) {
    if (!barcode) return '';
    return String(barcode).trim().replace(/[()\s\-_]/g, '');
  },

  /**
   * Tries to parse barcode data into receipt fields
   * @param {string} barcode
   * @returns {{ shop_name?: string, amount?: number, expiration_date?: string, detected: boolean }}
   */
  parseBarcode(barcode) {
    if (!barcode) return { detected: false };
    const code = this.cleanBarcode(barcode);

    // WZORZEC 1: Biedronka Recyklomat (Code 128 - 28 cyfr)
    // Struktura GS1: [9841 prefix 4c][sklep 5c][terminal 4c][Unix timestamp 10c][kwota w jedn. 10gr 4c][cyfra kontrolna GS1 Modulo 10 1c]
    // Przykłady:
    // 9841 01614 5531 1789823370 0065 0 -> 6.50 zł, data 2026-09-19 13:09:30 UTC, suma = 0
    // 9841 24327 2171 1789906816 0005 5 -> 0.50 zł, data 2026-09-20 12:20:16 UTC, suma = 5
    // 9841 24327 2171 1789906827 0005 1 -> 0.50 zł, data 2026-09-20 12:20:27 UTC, suma = 1
    // 9841 24327 2171 1789906838 0005 7 -> 0.50 zł, data 2026-09-20 12:20:38 UTC, suma = 7
    // 9841 24327 2171 1789906847 0005 9 -> 0.50 zł, data 2026-09-20 12:20:47 UTC, suma = 9
    if (code.length === 28 && code.startsWith('9841') && /^\d+$/.test(code)) {
      try {
        const storeId = code.slice(4, 9);
        const terminalId = code.slice(9, 13);
        const rawTimestamp = code.slice(13, 23);
        const amountUnits = parseInt(code.slice(23, 27), 10);
        const amountPln = amountUnits * 0.10;
        const checkDigit = parseInt(code[27], 10);
        const isChecksumValid = this.validateBiedronkaCheckDigit(code);

        // Dekodowanie Unix timestamp (10 cyfr sekund)
        const timestampSeconds = parseInt(rawTimestamp, 10);
        const printDate = new Date(timestampSeconds * 1000);

        // Ważność: dokładnie 30 dni od wydruku
        const expDate = new Date(printDate);
        expDate.setDate(expDate.getDate() + 30);

        const expDateStr = !isNaN(expDate.getTime()) 
          ? expDate.toISOString().split('T')[0] 
          : this.getDefaultExpirationDate();

        return {
          shop_name: 'Biedronka',
          amount: amountPln > 0 ? parseFloat(amountPln.toFixed(2)) : 0.50,
          expiration_date: expDateStr,
          store_id: storeId,
          terminal_id: terminalId,
          print_date: !isNaN(printDate.getTime()) ? printDate.toISOString() : null,
          check_digit: checkDigit,
          checksum_valid: isChecksumValid,
          has_date: true,
          detected: true,
          pattern_name: 'Biedronka Recyklomat (Code 128 - 28 cyfr)'
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
          has_date: false,
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
          has_date: false,
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
        has_date: false,
        detected: true,
        pattern_name: 'Kupon EAN-13'
      };
    }

    // Domyślne wartości dla nierozpoznanych kodów
    return {
      shop_name: 'Inny',
      amount: 0,
      expiration_date: this.getDefaultExpirationDate(),
      has_date: false,
      detected: false
    };
  },

  getDefaultExpirationDate() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  },

  /**
   * Oblicza cyfrę kontrolną GS1 Modulo 10 dla pierwszych 27 cyfr kodu Biedronki.
   * Wagi naprzemienne 3 i 1 od prawej do lewej (indeks 26 waga 3).
   * @param {string} code 28-cyfrowy lub 27-cyfrowy ciąg cyfr
   * @returns {number}
   */
  calculateBiedronkaCheckDigit(code) {
    if (!code || code.length < 27) return -1;
    let sum = 0;
    for (let i = 0; i < 27; i++) {
      const digit = parseInt(code[i], 10);
      const weight = (26 - i) % 2 === 0 ? 3 : 1;
      sum += digit * weight;
    }
    return (10 - (sum % 10)) % 10;
  },

  /**
   * Sprawdza poprawność cyfry kontrolnej w 28-cyfrowym kodzie Biedronki (28. cyfra, indeks 27)
   * @param {string} code
   * @returns {boolean}
   */
  validateBiedronkaCheckDigit(code) {
    if (!code || code.length !== 28 || !/^\d+$/.test(code)) return false;
    const calculated = this.calculateBiedronkaCheckDigit(code);
    const actual = parseInt(code[27], 10);
    return calculated === actual;
  }
};
