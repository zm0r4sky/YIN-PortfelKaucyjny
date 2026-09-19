import { db } from './db';

/**
 * Zunifikowana warstwa dostępu do danych (Repository Pattern).
 * W Fazie 1 korzysta z lokalnej bazy Dexie.js (Offline PWA).
 * W Fazie 2 zawartość tych metod zostanie przepisana na zapytania Axios/Fetch do serwera,
 * co pozwoli na płynną integrację API bez zmiany kodu w komponentach Vue.
 */
export const ReceiptService = {
  /**
   * Pobiera wszystkie paragony.
   */
  async getAllReceipts() {
    return await db.receipts.toArray();
  },

  /**
   * Pobiera paragon po konkretnym kodzie kreskowym.
   */
  async getReceiptByBarcode(barcode) {
    return await db.receipts.where('barcode').equals(barcode).first();
  },

  /**
   * Dodaje nowy paragon do wirtualnego portfela.
   * @param {Object} receiptData - Dane (shop_name, amount, expiration_date, barcode, status)
   */
  async addReceipt(receiptData) {
    return await db.receipts.add({
      ...receiptData,
      status: receiptData.status || 'active'
    });
  },

  /**
   * Aktualizuje status wykorzystania (np. 'active' -> 'used').
   */
  async updateReceiptStatus(id, newStatus) {
    return await db.receipts.update(id, { status: newStatus });
  },

  /**
   * Całościowa aktualizacja danych.
   */
  async updateReceipt(id, updatedData) {
    return await db.receipts.update(id, updatedData);
  },

  /**
   * Usuwa paragon.
   */
  async deleteReceipt(id) {
    return await db.receipts.delete(id);
  }
};
