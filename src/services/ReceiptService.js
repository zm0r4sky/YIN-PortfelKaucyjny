/**
 * @project YIN-PortfelKaucyjny
 * @file ReceiptService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * Repository layer for receipts in offline Dexie.js database.
 * Pre-configured for Phase 2 API swap (Axios/Fetch).
 */

import { db } from './db';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

// Configure local WASM for barcode generation offline
const writerWasmUrl = (import.meta.env?.BASE_URL || '/') + 'zxing_writer.wasm';
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => {
      if (path.endsWith('.wasm')) return writerWasmUrl;
      return prefix + path;
    }
  }
});

export const ReceiptService = {
  /**
   * Pobiera wszystkie paragony.
   */
  async getAllReceipts() {
    return await db.receipts.toArray();
  },

  /**
   * Pobiera aktywne paragony posortowane wg terminu ważności (od najpilniejszych).
   */
  async getActiveReceipts() {
    const list = await db.receipts.where('status').equals('active').toArray();
    return list.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  },

  /**
   * Pobiera archiwalne paragony (wykorzystane lub anulowane).
   */
  async getArchivedReceipts() {
    return await db.receipts
      .where('status')
      .notEqual('active')
      .reverse()
      .sortBy('id');
  },

  /**
   * Pobiera paragon po konkretnym kodzie kreskowym.
   */
  async getReceiptByBarcode(barcode) {
    return await db.receipts.where('barcode').equals(barcode).first();
  },

  /**
   * Sprawdza czy kod kreskowy istnieje już w bazie danych (aktywny lub w archiwum).
   * @param {string} barcode
   * @returns {Promise<{ isDuplicate: boolean, receipt: Object|null, status: 'none'|'active'|'used' }>}
   */
  async checkReceiptDuplicate(barcode) {
    if (!barcode) return { isDuplicate: false, receipt: null, status: 'none' };
    const existing = await this.getReceiptByBarcode(barcode.trim());
    if (!existing) {
      return { isDuplicate: false, receipt: null, status: 'none' };
    }
    return {
      isDuplicate: true,
      receipt: existing,
      status: existing.status
    };
  },

  /**
   * Dodaje nowy paragon do wirtualnego portfela.
   * @param {Object} receiptData
   */
  async addReceipt(receiptData) {
    const existing = await this.getReceiptByBarcode(receiptData.barcode);
    if (existing && existing.status === 'active') {
      throw new Error(`Ten kod (${receiptData.barcode}) znajduje się już w Twoim portfelu!`);
    }

    const payload = {
      barcode: receiptData.barcode.trim(),
      shop_name: receiptData.shop_name || 'Biedronka',
      amount: parseFloat(receiptData.amount) || 1.00,
      expiration_date: receiptData.expiration_date || this.getDefaultExpirationDate(),
      status: receiptData.status || 'active',
      created_at: new Date().toISOString()
    };

    return await db.receipts.add(payload);
  },

  /**
   * Aktualizuje status paragonu (np. 'active' -> 'used').
   */
  async updateReceiptStatus(id, newStatus) {
    return await db.receipts.update(id, { 
      status: newStatus,
      updated_at: new Date().toISOString()
    });
  },

  /**
   * Całościowa edycja danych paragonu.
   */
  async updateReceipt(id, updatedData) {
    const payload = {
      ...updatedData,
      amount: parseFloat(updatedData.amount) || 0,
      updated_at: new Date().toISOString()
    };
    return await db.receipts.update(id, payload);
  },

  /**
   * Trwale usuwa paragon z bazy (Faza 1 tryb testowy).
   */
  async deleteReceipt(id) {
    if (id === undefined || id === null) {
      console.warn('[ReceiptService] deleteReceipt: brak ID');
      return false;
    }
    const key = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
    await db.receipts.delete(key);
    return true;
  },

  /**
   * Oblicza status terminu ważności paragonu
   * @param {string} expDateStr YYYY-MM-DD
   */
  getExpirationInfo(expDateStr) {
    if (!expDateStr) return { daysLeft: 999, status: 'normal', label: 'Brak terminu' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDate = new Date(expDateStr);
    expDate.setHours(0, 0, 0, 0);

    const diffTime = expDate - today;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { daysLeft, status: 'expired', label: 'Przeterminowany', urgent: true };
    }
    if (daysLeft === 0) {
      return { daysLeft, status: 'urgent', label: 'Wygasa dzisiaj!', urgent: true };
    }
    if (daysLeft === 1) {
      return { daysLeft, status: 'urgent', label: 'Wygasa jutro!', urgent: true };
    }
    if (daysLeft <= 3) {
      return { daysLeft, status: 'urgent', label: `Wygasa za ${daysLeft} dni`, urgent: true };
    }
    if (daysLeft <= 7) {
      return { daysLeft, status: 'warning', label: `Zostało ${daysLeft} dni`, urgent: false };
    }

    return { daysLeft, status: 'normal', label: `Ważny do ${expDateStr}`, urgent: false };
  },

  /**
   * Generuje obraz PNG kodu kreskowego w wysokiej rozdzielczości do zeskanowania przez kasjera
   * @param {string} barcode
   * @returns {Promise<string>} Blob Object URL
   */
  async generateBarcodeImage(barcode) {
    const cleanCode = barcode.trim();
    // Dobór formatu wg specyfiki kodu
    let format = 'Code128';
    if (cleanCode.length === 13 && /^\d+$/.test(cleanCode)) {
      format = 'EAN13';
    }

    const res = await writeBarcode(cleanCode, {
      format,
      width: cleanCode.length > 20 ? 900 : 600,
      height: 220
    });

    return URL.createObjectURL(res.image);
  },

  /**
   * Pomocnicza data: 30 dni od teraz w formacie YYYY-MM-DD
   */
  getDefaultExpirationDate() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
};
