import Dexie from 'dexie';

// Inicjalizacja bazy IndexedDB
export const db = new Dexie('PortfelKaucyjnyDB');

// Definicja schematu
// ++id - autoinkrementowany klucz główny
// shop_name, expiration_date, barcode, status - indeksowane pola do wyszukiwania
db.version(1).stores({
  receipts: '++id, shop_name, expiration_date, barcode, status'
});
