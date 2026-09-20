<template>
  <div class="wallet-container">
    <!-- Górny panel podsumowania salda -->
    <header class="wallet-header">
      <div class="balance-card glass-card">
        <span class="balance-label">Dostępne środki z kaucji</span>
        <div class="balance-amount">
          {{ totalActiveAmount.toFixed(2) }} <span class="currency">zł</span>
        </div>
        <div class="balance-meta">
          <span>Aktywne paragony: <strong>{{ activeReceipts.length }}</strong></span>
          <span v-if="urgentCount > 0" class="urgent-warning">
            ⚠️ <strong>{{ urgentCount }}</strong> kończy się wkrótce!
          </span>
        </div>
        <router-link to="/scan" class="btn btn-action-scan">
          📷 Skanuj nowy paragon
        </router-link>
      </div>
    </header>

    <!-- Nawigacja zakładek: Aktywne vs Archiwum -->
    <div class="tabs-nav">
      <button 
        class="tab-btn" 
        :class="{ active: currentTab === 'active' }"
        @click="currentTab = 'active'"
      >
        Aktywne ({{ activeReceipts.length }})
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: currentTab === 'archived' }"
        @click="currentTab = 'archived'"
      >
        Archiwum ({{ archivedReceipts.length }})
      </button>
    </div>

    <!-- Pasek filtrów sklepów -->
    <div class="shop-filter-bar" v-if="uniqueShops.length > 1">
      <button 
        class="shop-pill" 
        :class="{ active: selectedShopFilter === 'ALL' }"
        @click="selectedShopFilter = 'ALL'"
      >
        Wszystkie sklepy
      </button>
      <button 
        v-for="shop in uniqueShops" 
        :key="shop"
        class="shop-pill" 
        :class="{ active: selectedShopFilter === shop }"
        @click="selectedShopFilter = shop"
      >
        {{ shop }}
      </button>
    </div>

    <!-- Lista paragonów aktywnych zgrupowana po sklepach -->
    <div v-if="currentTab === 'active'" class="receipts-content">
      <div v-if="filteredActiveReceipts.length === 0" class="empty-state glass-card">
        <div class="empty-icon">🧾</div>
        <h3>Twój portfel jest pusty</h3>
        <p>Zeskanuj paragon z butelkomatu, aby zabezpieczyć swoje środki.</p>
        <router-link to="/scan" class="btn btn-primary">
          Rozpocznij skanowanie
        </router-link>
      </div>

      <!-- Grupy sklepów -->
      <div 
        v-for="group in groupedActiveReceipts" 
        :key="group.shopName" 
        class="shop-group-section"
      >
        <div class="shop-group-header">
          <div class="shop-title-row">
            <span class="shop-badge" :class="getShopClass(group.shopName)">
              {{ group.shopName }}
            </span>
            <span class="shop-receipts-count">{{ group.receipts.length }} szt.</span>
          </div>
          <span class="shop-subtotal">{{ group.subtotal.toFixed(2) }} zł</span>
        </div>

        <div class="receipts-grid">
          <div 
            v-for="receipt in group.receipts" 
            :key="receipt.id" 
            class="receipt-card glass-card"
            :class="{ 'card-urgent': receipt.expirationInfo.urgent }"
          >
            <div class="card-main-info">
              <div class="amount-badge">
                {{ receipt.amount.toFixed(2) }} <span class="card-curr">zł</span>
              </div>
              <div class="validity-box">
                <span 
                  class="validity-badge" 
                  :class="'badge-' + receipt.expirationInfo.status"
                >
                  {{ receipt.expirationInfo.label }}
                </span>
                <span class="barcode-preview-text" title="Kliknij, aby skopiować" @click="copyBarcode(receipt.barcode)">
                  #{{ receipt.barcode }}
                </span>
              </div>
            </div>

            <!-- Przyciski akcji na karcie -->
            <div class="card-actions-row">
              <button 
                class="btn btn-card-show" 
                @click="openBarcodePresenter(receipt)"
                title="Pokaż powiększony kod dla kasjera"
              >
                📱 Pokaż kod
              </button>
              <button 
                class="btn btn-card-done" 
                @click="markAsUsed(receipt.id)"
                title="Oznacz jako wykorzystany"
              >
                ✓ Wykorzystano
              </button>
              <button 
                class="btn btn-card-edit" 
                @click="openEditModal(receipt)"
                title="Edytuj dane paragonu"
              >
                ✏️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Lista paragonów w Archiwum -->
    <div v-if="currentTab === 'archived'" class="receipts-content">
      <div v-if="archivedReceipts.length === 0" class="empty-state glass-card">
        <div class="empty-icon">📦</div>
        <h3>Brak paragonów w archiwum</h3>
        <p>Tu trafią zrealizowane lub wygasłe paragony.</p>
      </div>

      <div class="receipts-grid" v-else>
        <div 
          v-for="receipt in filteredArchivedReceipts" 
          :key="receipt.id" 
          class="receipt-card glass-card card-archived"
        >
          <div class="card-main-info">
            <div class="amount-badge strike">
              {{ receipt.amount.toFixed(2) }} <span class="card-curr">zł</span>
            </div>
            <div class="validity-box">
              <span class="shop-badge mini" :class="getShopClass(receipt.shop_name)">
                {{ receipt.shop_name }}
              </span>
              <span class="validity-badge badge-archived">Wykorzystany</span>
              <span class="barcode-preview-text">#{{ receipt.barcode }}</span>
            </div>
          </div>

          <div class="card-actions-row">
            <button 
              class="btn btn-card-restore" 
              @click="restoreReceipt(receipt.id)"
            >
              ↩ Przywróć
            </button>
            <button 
              class="btn btn-card-delete" 
              @click="confirmDelete(receipt)"
            >
              🗑️ Usuń
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: Prezenter Kodu Kreskowego dla Kasjera -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="activePresenterReceipt" class="modal-backdrop" @click.self="closeBarcodePresenter">
          <div class="cashier-modal">
            <button type="button" class="modal-close-btn" @click="closeBarcodePresenter" title="Zamknij">✕</button>
            <div class="cashier-header">
              <span class="shop-badge large" :class="getShopClass(activePresenterReceipt.shop_name)">
                {{ activePresenterReceipt.shop_name }}
              </span>
              <div class="cashier-amount">
                {{ activePresenterReceipt.amount.toFixed(2) }} <span>zł</span>
              </div>
              <p class="cashier-hint">Skieruj kod do czytnika kasowego lub automatu</p>
            </div>

            <!-- Wygenerowany obraz kodu kreskowego -->
            <div class="barcode-display-box">
              <div v-if="isGeneratingBarcode" class="barcode-spinner">
                Generowanie ostrości kodu...
              </div>
              <img 
                v-else-if="presenterBarcodeUrl" 
                :src="presenterBarcodeUrl" 
                alt="Kod kreskowy" 
                class="generated-barcode-img" 
              />
              <div class="barcode-human-text">{{ activePresenterReceipt.barcode }}</div>
            </div>

            <div class="cashier-actions">
              <button class="btn btn-primary btn-large" @click="markAsUsedFromPresenter">
                ✓ Zrealizowano kaucję (Archiwizuj)
              </button>
              <button class="btn btn-secondary" @click="closeBarcodePresenter">
                Zamknij
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- MODAL: Edycja Paragonu -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="editingReceipt" class="modal-backdrop" @click.self="editingReceipt = null">
          <div class="edit-modal glass-card">
            <button type="button" class="modal-close-btn" @click="editingReceipt = null" title="Zamknij">✕</button>
            <h3>Edytuj Paragon</h3>
            
            <div class="form-group">
              <label>Sklep:</label>
              <select v-model="editForm.shop_name" class="modal-select">
                <option v-for="shop in popularShops" :key="shop" :value="shop">{{ shop }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>Wartość kaucji (zł):</label>
              <input 
                type="text" 
                inputmode="decimal" 
                v-model="editAmountText" 
                @input="onEditAmountInput"
                @blur="formatEditAmount"
                class="modal-input" 
                placeholder="0,50"
              />
              <span v-if="editForm.shop_name === 'Biedronka'" style="font-size: 0.72rem; color: #38bdf8; margin-top: 2px;">Wielokrotność 0,50 zł</span>
              <span v-else-if="editForm.shop_name === 'Lidl'" style="font-size: 0.72rem; color: #38bdf8; margin-top: 2px;">Wielokrotność 0,10 zł (min. 0,10 zł)</span>
            </div>

            <div class="form-group">
              <label>Data ważności:</label>
              <input 
                type="date" 
                v-model="editForm.expiration_date" 
                class="modal-input" 
              />
            </div>

            <div class="modal-actions-grid">
              <button class="btn btn-primary" @click="saveEditedReceipt">Zapisz zmiany</button>
              <button class="btn btn-secondary" @click="editingReceipt = null">Anuluj</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- MODAL: Potwierdzenie trwałego usunięcia paragonu (Faza 1 tryb testowy) -->
    <teleport to="body">
      <transition name="fade">
        <div v-if="receiptToDelete" class="modal-backdrop" @click.self="receiptToDelete = null">
          <div class="delete-modal glass-card">
            <button type="button" class="modal-close-btn" @click="receiptToDelete = null" title="Zamknij">✕</button>
            <div class="delete-icon">🗑️</div>
            <h3 class="delete-title">Usunąć paragon?</h3>
            <p class="delete-subtitle">
              Czy na pewno chcesz trwale usunąć ten paragon z archiwum?
            </p>

            <div class="delete-receipt-preview">
              <span class="shop-badge mini" :class="getShopClass(receiptToDelete.shop_name)">
                {{ receiptToDelete.shop_name }}
              </span>
              <span class="delete-preview-amount">{{ receiptToDelete.amount.toFixed(2) }} zł</span>
              <div class="delete-preview-code">#{{ receiptToDelete.barcode }}</div>
            </div>

            <p class="delete-note">
              ⚠️ <em>W Fazie 1 funkcja jest dostępna do celów testowych. W Fazie 2 usuwanie z archiwum będzie zablokowane.</em>
            </p>

            <div class="delete-actions">
              <button class="btn btn-danger" @click="executeDelete">
                🗑️ Usuń trwale
              </button>
              <button class="btn btn-secondary" @click="receiptToDelete = null">
                Anuluj
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Toast powiadomień -->
    <transition name="fade">
      <div v-if="toastMsg" class="toast-notification">
        {{ toastMsg }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ReceiptService } from '../services/ReceiptService';

const receipts = ref([]);
const currentTab = ref('active');
const selectedShopFilter = ref('ALL');
const popularShops = ['Biedronka', 'Lidl', 'Dino', 'Kaufland', 'Carrefour', 'Żabka', 'Inny'];

// Stan prezentera kodu
const activePresenterReceipt = ref(null);
const presenterBarcodeUrl = ref(null);
const isGeneratingBarcode = ref(false);

// Stan edycji
const editingReceipt = ref(null);
const editForm = ref({ shop_name: '', amount: 0, expiration_date: '' });

// Stan usuwania (Faza 1 tryb testowy)
const receiptToDelete = ref(null);

// Toast
const toastMsg = ref('');

const showToast = (msg) => {
  toastMsg.value = msg;
  setTimeout(() => { toastMsg.value = ''; }, 3000);
};

// Ładowanie danych
const loadReceipts = async () => {
  try {
    const all = await ReceiptService.getAllReceipts();
    receipts.value = all.map(r => ({
      ...r,
      expirationInfo: ReceiptService.getExpirationInfo(r.expiration_date)
    }));
  } catch (err) {
    console.error('Błąd ładowania paragonów:', err);
  }
};

// Podział
const activeReceipts = computed(() => {
  return receipts.value
    .filter(r => r.status === 'active')
    .sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
});

const archivedReceipts = computed(() => {
  return receipts.value
    .filter(r => r.status !== 'active')
    .sort((a, b) => b.id - a.id);
});

// Suma kaucji
const totalActiveAmount = computed(() => {
  return activeReceipts.value.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
});

// Liczba paragonów wygasających za <= 3 dni
const urgentCount = computed(() => {
  return activeReceipts.value.filter(r => r.expirationInfo.urgent).length;
});

// Unikalne sklepy z aktywnych
const uniqueShops = computed(() => {
  const set = new Set(activeReceipts.value.map(r => r.shop_name));
  return Array.from(set).filter(Boolean);
});

// Filtrowanie
const filteredActiveReceipts = computed(() => {
  if (selectedShopFilter.value === 'ALL') return activeReceipts.value;
  return activeReceipts.value.filter(r => r.shop_name === selectedShopFilter.value);
});

const filteredArchivedReceipts = computed(() => {
  if (selectedShopFilter.value === 'ALL') return archivedReceipts.value;
  return archivedReceipts.value.filter(r => r.shop_name === selectedShopFilter.value);
});

// Grupowanie po sklepach
const groupedActiveReceipts = computed(() => {
  const groups = {};
  filteredActiveReceipts.value.forEach(receipt => {
    const shop = receipt.shop_name || 'Inny';
    if (!groups[shop]) {
      groups[shop] = {
        shopName: shop,
        receipts: [],
        subtotal: 0
      };
    }
    groups[shop].receipts.push(receipt);
    groups[shop].subtotal += parseFloat(receipt.amount) || 0;
  });

  return Object.values(groups).sort((a, b) => b.subtotal - a.subtotal);
});

// Klasy kolorystyczne dla sklepów
const getShopClass = (shopName) => {
  const name = (shopName || '').toLowerCase();
  if (name.includes('biedronka')) return 'shop-biedronka';
  if (name.includes('lidl')) return 'shop-lidl';
  if (name.includes('dino')) return 'shop-dino';
  if (name.includes('kaufland')) return 'shop-kaufland';
  if (name.includes('carrefour')) return 'shop-carrefour';
  if (name.includes('żabka') || name.includes('zabka')) return 'shop-zabka';
  return 'shop-default';
};

// Akcje
const markAsUsed = async (id) => {
  await ReceiptService.updateReceiptStatus(id, 'used');
  showToast('✓ Paragon oznaczony jako wykorzystany');
  await loadReceipts();
};

const restoreReceipt = async (id) => {
  await ReceiptService.updateReceiptStatus(id, 'active');
  showToast('↩ Paragon przywrócony do aktywnych');
  await loadReceipts();
};

const confirmDelete = (receipt) => {
  receiptToDelete.value = receipt;
};

const executeDelete = async () => {
  if (!receiptToDelete.value) return;
  try {
    const id = receiptToDelete.value.id;
    await ReceiptService.deleteReceipt(id);
    receiptToDelete.value = null;
    showToast('🗑️ Paragon został trwale usunięty');
    await loadReceipts();
  } catch (err) {
    console.error('Błąd usuwania paragonu:', err);
    showToast('Błąd podczas usuwania paragonu');
  }
};

const copyBarcode = (code) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code);
    showToast('📋 Skopiowano numer kodu');
  }
};

// Prezenter Kodu Kreskowego
const openBarcodePresenter = async (receipt) => {
  activePresenterReceipt.value = receipt;
  isGeneratingBarcode.value = true;
  presenterBarcodeUrl.value = null;

  try {
    const url = await ReceiptService.generateBarcodeImage(receipt.barcode);
    presenterBarcodeUrl.value = url;
  } catch (err) {
    console.error('Błąd generowania kodu:', err);
    showToast('Błąd generowania kodu kreskowego');
  } finally {
    isGeneratingBarcode.value = false;
  }
};

const closeBarcodePresenter = () => {
  if (presenterBarcodeUrl.value) {
    URL.revokeObjectURL(presenterBarcodeUrl.value);
    presenterBarcodeUrl.value = null;
  }
  activePresenterReceipt.value = null;
};

const markAsUsedFromPresenter = async () => {
  if (!activePresenterReceipt.value) return;
  await markAsUsed(activePresenterReceipt.value.id);
  closeBarcodePresenter();
};

// Edycja
const editAmountText = ref('0,50');

const openEditModal = (receipt) => {
  editingReceipt.value = receipt;
  editForm.value = {
    shop_name: receipt.shop_name,
    amount: receipt.amount,
    expiration_date: receipt.expiration_date
  };
  editAmountText.value = Number(receipt.amount).toFixed(2).replace('.', ',');
};

const onEditAmountInput = (e) => {
  editAmountText.value = e.target.value;
  const num = parseFloat(e.target.value.replace(',', '.'));
  editForm.value.amount = !isNaN(num) ? num : 0;
};

const formatEditAmount = () => {
  if (editForm.value.amount && !isNaN(editForm.value.amount) && editForm.value.amount > 0) {
    editAmountText.value = Number(editForm.value.amount).toFixed(2).replace('.', ',');
  }
};

const saveEditedReceipt = async () => {
  if (!editingReceipt.value) return;
  const amt = parseFloat(String(editAmountText.value).replace(',', '.'));
  if (!amt || isNaN(amt) || amt <= 0) {
    showToast('⚠️ Podaj poprawną kwotę kaucji');
    return;
  }
  const grosze = Math.round(amt * 100);
  if (editForm.value.shop_name === 'Biedronka') {
    if (grosze % 50 !== 0) {
      showToast('⚠️ Dla Biedronki kwota musi być wielokrotnością 0,50 zł');
      return;
    }
    if (amt < 0.50) {
      showToast('⚠️ Minimalna kwota w Biedronce to 0,50 zł');
      return;
    }
  } else if (editForm.value.shop_name === 'Lidl') {
    if (grosze % 10 !== 0) {
      showToast('⚠️ Dla Lidla kwota musi być wielokrotnością 0,10 zł');
      return;
    }
    if (amt < 0.10) {
      showToast('⚠️ Minimalna kwota w Lidlu to 0,10 zł');
      return;
    }
  }

  await ReceiptService.updateReceipt(editingReceipt.value.id, {
    ...editForm.value,
    amount: amt
  });
  editingReceipt.value = null;
  showToast('✓ Zmiany zapisane pomyślnie');
  await loadReceipts();
};

onMounted(() => {
  loadReceipts();
});
</script>

<style scoped>
.wallet-container {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}

/* Karta salda */
.wallet-header {
  margin-bottom: 20px;
}

.glass-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.balance-card {
  text-align: center;
  background: linear-gradient(135deg, #1b263b 0%, #0d1b2a 100%);
  color: white;
  box-shadow: 0 10px 30px rgba(13, 27, 42, 0.25);
  border: none;
}

.balance-label {
  font-size: 0.85rem;
  color: #a0aec0;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.balance-amount {
  font-size: 2.8rem;
  font-weight: 800;
  color: #4fc08d;
  margin: 4px 0 10px;
  letter-spacing: -0.5px;
}

.balance-amount .currency {
  font-size: 1.5rem;
  color: #e2e8f0;
}

.balance-meta {
  display: flex;
  justify-content: center;
  gap: 14px;
  font-size: 0.85rem;
  color: #cbd5e1;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.urgent-warning {
  color: #ff6b6b;
  font-weight: 600;
}

.btn-action-scan {
  display: inline-block;
  background: #4fc08d;
  color: #0b1a20;
  font-weight: 700;
  padding: 12px 24px;
  border-radius: 12px;
  text-decoration: none;
  font-size: 0.95rem;
  box-shadow: 0 4px 14px rgba(79, 192, 141, 0.4);
  transition: transform 0.1s;
}
.btn-action-scan:active {
  transform: scale(0.97);
}

/* Zakładki */
.tabs-nav {
  display: flex;
  background: #e2e8f0;
  padding: 4px;
  border-radius: 14px;
  margin-bottom: 16px;
  gap: 4px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  font-weight: 700;
  font-size: 0.9rem;
  color: #4a5568;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: #ffffff;
  color: #1a202c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Filtry sklepów */
.shop-filter-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
  margin-bottom: 14px;
  -webkit-overflow-scrolling: touch;
}

.shop-pill {
  white-space: nowrap;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;
  color: #4a5568;
  cursor: pointer;
}

.shop-pill.active {
  background: #1b263b;
  color: #ffffff;
  border-color: #1b263b;
}

/* Pusty stan */
.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 10px;
}

.empty-state h3 {
  margin: 0 0 6px;
  color: #2d3748;
}

.empty-state p {
  color: #718096;
  font-size: 0.9rem;
  margin: 0 0 20px;
}

/* Sekcje grup sklepów */
.shop-group-section {
  margin-bottom: 24px;
}

.shop-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 0 4px;
}

.shop-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shop-receipts-count {
  font-size: 0.8rem;
  color: #718096;
  font-weight: 600;
}

.shop-subtotal {
  font-size: 1.1rem;
  font-weight: 800;
  color: #2d3748;
}

/* Etykiety sklepów */
.shop-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.shop-biedronka { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.shop-lidl { background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }
.shop-dino { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.shop-kaufland { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
.shop-carrefour { background: #e0e7ff; color: #4338ca; border: 1px solid #a5b4fc; }
.shop-zabka { background: #d1fae5; color: #047857; border: 1px solid #6ee7b7; }
.shop-default { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

.shop-badge.mini {
  padding: 2px 6px;
  font-size: 0.7rem;
}

.shop-badge.large {
  font-size: 1.1rem;
  padding: 6px 16px;
  border-radius: 12px;
}

/* Karty paragonów */
.receipts-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.receipt-card {
  padding: 16px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.card-urgent {
  border-left: 4px solid #ef4444;
  background: #fff8f8;
}

.card-archived {
  opacity: 0.75;
  background: #f8fafc;
}

.card-main-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
}

.amount-badge {
  font-size: 1.6rem;
  font-weight: 800;
  color: #1a202c;
  line-height: 1.1;
}

.amount-badge.strike {
  text-decoration: line-through;
  color: #a0aec0;
}

.card-curr {
  font-size: 0.95rem;
  color: #718096;
}

.validity-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.validity-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}

.badge-normal { background: #edf2f7; color: #4a5568; }
.badge-warning { background: #fef3c7; color: #b45309; }
.badge-urgent { background: #fee2e2; color: #b91c1c; font-weight: 800; animation: pulse 2s infinite; }
.badge-expired { background: #f3f4f6; color: #6b7280; text-decoration: line-through; }
.badge-archived { background: #e2e8f0; color: #475569; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.barcode-preview-text {
  font-family: monospace;
  font-size: 0.75rem;
  color: #94a3b8;
  cursor: pointer;
}

/* Przyciski na karcie */
.card-actions-row {
  display: flex;
  gap: 8px;
  border-top: 1px solid #f1f5f9;
  padding-top: 12px;
}

.btn-card-show {
  flex: 2;
  background: #1b263b;
  color: white;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
}

.btn-card-done {
  flex: 2;
  background: #e2e8f0;
  color: #2d3748;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.btn-card-edit {
  padding: 9px 12px;
  background: #f1f5f9;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}

.btn-card-restore {
  flex: 1;
  background: #dbeafe;
  color: #1e40af;
  padding: 9px 12px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  border: none;
  cursor: pointer;
}

.btn-card-delete {
  padding: 9px 14px;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.85rem;
  border: none;
  cursor: pointer;
}

/* Modale */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 16px 95px 16px;
  z-index: 25000;
  box-sizing: border-box;
  overflow-x: hidden;
  max-width: 100vw;
}

.modal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.07);
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #475569;
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s, transform 0.1s;
}

.modal-close-btn:active {
  background: rgba(239, 68, 68, 0.2);
  color: #b91c1c;
  transform: scale(0.92);
}

.cashier-modal {
  position: relative;
  background: #ffffff;
  width: 100%;
  max-width: 420px;
  max-height: min(78dvh, 580px);
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  border-radius: 20px;
  padding: 20px 18px 24px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cashier-amount {
  font-size: 2.8rem;
  font-weight: 800;
  color: #1b263b;
  margin: 10px 0 4px;
}

.cashier-amount span {
  font-size: 1.5rem;
  color: #64748b;
}

.cashier-hint {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0 0 20px;
}

.barcode-display-box {
  background: #ffffff;
  padding: 16px;
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  margin-bottom: 24px;
  box-sizing: border-box;
  overflow-x: hidden;
  max-width: 100%;
}

.generated-barcode-img {
  width: 100%;
  height: auto;
  max-height: 140px;
  display: block;
  object-fit: contain;
  margin: 0 auto 10px;
}

.barcode-human-text {
  font-family: monospace;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 1px;
  color: #0f172a;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: normal;
  max-width: 100%;
  box-sizing: border-box;
}

.cashier-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-modal {
  position: relative;
  width: 100%;
  max-width: 400px;
  max-height: min(78dvh, 560px);
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  border-radius: 20px;
  padding: 20px 18px 24px;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.modal-select, .modal-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 1rem;
  box-sizing: border-box;
  margin-top: 4px;
}

.modal-actions-grid {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.modal-actions-grid button {
  flex: 1;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #4a5568;
}

.btn {
  padding: 12px 18px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  transition: transform 0.1s;
}
.btn:active { transform: scale(0.97); }

.btn-primary { background: #4fc08d; color: #0b1a20; }
.btn-secondary { background: #e2e8f0; color: #2d3748; }
.btn-danger {
  background: #ef4444;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
}
.btn-danger:active {
  background: #dc2626;
}

/* Modal usuwania */
.delete-modal {
  position: relative;
  width: 100%;
  max-width: 380px;
  max-height: min(78dvh, 540px);
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  background: #ffffff;
  border-radius: 20px;
  padding: 20px 18px 24px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.delete-icon {
  font-size: 2.8rem;
  margin-bottom: 8px;
}

.delete-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 6px;
}

.delete-subtitle {
  font-size: 0.88rem;
  color: #64748b;
  margin: 0 0 16px;
  line-height: 1.4;
}

.delete-receipt-preview {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.delete-preview-amount {
  font-size: 1.8rem;
  font-weight: 800;
  color: #0f172a;
}

.delete-preview-code {
  font-family: monospace;
  font-size: 0.82rem;
  color: #64748b;
  word-break: break-all;
}

.delete-note {
  font-size: 0.78rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  padding: 8px 12px;
  border-radius: 10px;
  margin: 0 0 18px;
  line-height: 1.35;
  text-align: left;
}

.delete-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast-notification {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: #1b263b;
  color: #4fc08d;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 0.9rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 10001;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
