<template>
  <div class="scanner-container">
    <!-- Czysty element video dla podglądu kamery -->
    <video ref="videoElement" class="scanner-reader" autoplay muted playsinline></video>

    <!-- Nakładka UI skanera -->
    <div class="scanner-ui-overlay" :class="{ 'scanning': isScanning, 'success': scanResult }">
      
      <!-- Górny nagłówek z kontrolkami -->
      <div class="scanner-header" v-if="!showSaveDialog && !showDuplicateModal && !showArchivedDuplicateModal">
        <div class="engine-badge" v-if="isScanning">
          {{ engineName }}
        </div>
        <h1>Skaner Paragonów</h1>
        <p>Umieść kod kreskowy w celowniku</p>

        <!-- Pasek szybkich narzędzi kamery (Latarka + Zoom) -->
        <div class="camera-controls" v-if="isScanning && (hasTorch || hasZoom)">
          <button 
            v-if="hasTorch" 
            class="ctrl-btn torch-btn" 
            :class="{ 'active': isTorchOn }"
            @click="toggleTorch"
            title="Włącz/Wyłącz latarkę"
          >
            {{ isTorchOn ? '🔦 Wyłącz światło' : '💡 Włącz latarkę' }}
          </button>

          <div v-if="hasZoom" class="zoom-group">
            <span class="ctrl-label">Zoom:</span>
            <button 
              class="ctrl-btn zoom-btn" 
              :class="{ 'active': currentZoom === 1 }"
              @click="setZoom(1)"
            >1x</button>
            <button 
              class="ctrl-btn zoom-btn" 
              :class="{ 'active': currentZoom === 2 }"
              @click="setZoom(2)"
            >2x</button>
            <button 
              class="ctrl-btn zoom-btn" 
              :class="{ 'active': currentZoom === 3 }"
              @click="setZoom(3)"
            >3x</button>
          </div>
        </div>
        
        <!-- Przyciski akcji: Zdjęcie oraz Test OCR -->
        <div class="fallback-row" v-if="!scanResult">
          <button class="btn-fallback" @click="triggerFileInput" :disabled="isAnalyzingPhoto || isOcrRunning">
            <span v-if="isAnalyzingPhoto">⏳ Analizuję zdjęcie...</span>
            <span v-else-if="isOcrRunning">🔍 Trwa OCR ({{ (ocrProgress * 100).toFixed(0) }}%)...</span>
            <span v-else>📷 Zrób zdjęcie / Wgraj plik</span>
          </button>
        </div>
        
        <input 
          type="file" 
          ref="fileInput" 
          accept="image/*" 
          capture="environment" 
          style="display: none;" 
          @change="handleFileUpload"
        />
      </div>

      <!-- Ramka celownika z laserem i czujnikiem aktywnego celowania -->
      <div ref="targetBoxElement" class="scan-target" v-if="!scanResult">
        <div class="scan-target-corner top-left"></div>
        <div class="scan-target-corner top-right"></div>
        <div class="scan-target-corner bottom-left"></div>
        <div class="scan-target-corner bottom-right"></div>
        
        <!-- GPU-przyspieszony płynny laser 60 FPS -->
        <div class="scan-laser"></div>
        <div class="target-crosshair"></div>
        <div class="target-hint">Trzymaj aparat w odległości 20–30 cm</div>
      </div>

      <!-- Dynamiczna ramka zlokalizowanego kodu (współrzędne na ekranie) -->
      <div 
        v-if="localizedBoxStyle && !showSaveDialog && !showDuplicateModal && !showArchivedDuplicateModal" 
        class="localized-bounding-box" 
        :style="localizedBoxStyle"
      >
        <span class="localized-tag">Kod wykryty</span>
      </div>

      <!-- MODAL 1: Ostrzeżenie o DUPLIKACIE w aktywnym portfelu -->
      <teleport to="body">
        <transition name="fade-up">
          <div v-if="showDuplicateModal" class="save-modal-overlay" @click.self="resetScan">
            <div class="save-modal glass-panel duplicate-modal">
              <button type="button" class="modal-close-btn" @click="resetScan" title="Zamknij">✕</button>
              <div class="modal-header">
                <div class="warning-icon">⚠️</div>
                <h3 class="warning-title">Ten kod jest już w portfelu!</h3>
                <p class="barcode-preview">#{{ duplicateReceipt?.barcode }}</p>
              </div>

              <div class="duplicate-details">
                <p>Zeskanowany paragon został już wcześniej dodany do Twoich aktywnych środków:</p>
                <div class="duplicate-info-card">
                  <div class="dup-row">
                    <span>Sklep:</span>
                    <strong>{{ duplicateReceipt?.shop_name }}</strong>
                  </div>
                  <div class="dup-row">
                    <span>Wartość kaucji:</span>
                    <strong class="dup-amount">{{ duplicateReceipt?.amount.toFixed(2) }} zł</strong>
                  </div>
                  <div class="dup-row">
                    <span>Termin ważności:</span>
                    <strong>{{ duplicateReceipt?.expiration_date }}</strong>
                  </div>
                </div>
              </div>

              <div class="modal-actions">
                <button class="btn btn-primary" @click="goToWallet">
                  👛 Przejdź do tego paragonu w portfelu
                </button>
                <button class="btn btn-secondary" @click="resetScan">
                  Skanuj inny paragon
                </button>
              </div>
            </div>
          </div>
        </transition>
      </teleport>

      <!-- MODAL 2: Informacja o DUPLIKACIE w ARCHIWUM -->
      <teleport to="body">
        <transition name="fade-up">
          <div v-if="showArchivedDuplicateModal" class="save-modal-overlay" @click.self="resetScan">
            <div class="save-modal glass-panel archived-dup-modal">
              <button type="button" class="modal-close-btn" @click="resetScan" title="Zamknij">✕</button>
              <div class="modal-header">
                <div class="info-icon">ℹ️</div>
                <h3>Paragon był już wykorzystany!</h3>
                <p class="barcode-preview">#{{ duplicateReceipt?.barcode }}</p>
              </div>

              <div class="duplicate-details">
                <p>Ten kod znajduje się w Twoim <strong>Archiwum</strong> jako zrealizowany:</p>
                <div class="duplicate-info-card">
                  <div class="dup-row">
                    <span>Sklep:</span>
                    <strong>{{ duplicateReceipt?.shop_name }}</strong>
                  </div>
                  <div class="dup-row">
                    <span>Kwota:</span>
                    <strong>{{ duplicateReceipt?.amount.toFixed(2) }} zł</strong>
                  </div>
                </div>
              </div>

              <div class="modal-actions">
                <button class="btn btn-primary" @click="restoreDuplicateToActive">
                  ↩ Przywróć do aktywnych paragonów
                </button>
                <button class="btn btn-secondary" @click="resetScan">
                  Skanuj inny paragon
                </button>
              </div>
            </div>
          </div>
        </transition>
      </teleport>

      <!-- MODAL 3: Karta zatwierdzenia i uzupełnienia danych paragonu (Nowy kod) -->
      <teleport to="body">
        <transition name="fade-up">
          <div v-if="showSaveDialog" class="save-modal-overlay" @click.self="cancelSave">
            <div class="save-modal glass-panel">
              <button type="button" class="modal-close-btn" @click="cancelSave" title="Zamknij">✕</button>
              <div class="modal-header">
                <div class="success-icon">✓</div>
                <h3>Kod Rozpoznany!</h3>
                <p class="barcode-preview">{{ scanResult }}</p>
                <div v-if="isAutoParsed" class="auto-detected-badge">
                  ⚡ Dane odczytane automatycznie z kodu
                </div>
              </div>

              <!-- Panel Testowy OCR (Tesseract.js) -->
              <div class="ocr-test-box" v-if="isOcrRunning || ocrResult">
                <div class="ocr-header">
                  <span>🧪 Wyniki Analizy OCR (Tesseract.js)</span>
                  <span v-if="isOcrRunning" class="ocr-pulse">Analizuję tekst...</span>
                  <span v-else class="ocr-confidence">Pewność: {{ ocrResult?.confidence.toFixed(0) }}%</span>
                </div>

                <!-- Pasek postępu OCR -->
                <div v-if="isOcrRunning" class="ocr-progress-bar">
                  <div class="ocr-progress-fill" :style="{ width: (ocrProgress * 100) + '%' }"></div>
                </div>
                <p v-if="isOcrRunning" class="ocr-status-text">{{ ocrStatusText }}</p>

                <!-- Podsumowanie danych wyciągniętych przez OCR -->
                <div v-if="ocrResult && !isOcrRunning" class="ocr-extracted-grid">
                  <div class="ocr-tag">
                    Sklep: <strong>{{ ocrResult.extracted.shop_name || 'Brak' }}</strong>
                  </div>
                  <div class="ocr-tag">
                    Kwota: <strong>{{ ocrResult.extracted.amount ? ocrResult.extracted.amount.toFixed(2) + ' zł' : 'Brak' }}</strong>
                  </div>
                  <div v-if="ocrResult.extracted.print_date" class="ocr-tag">
                    Wydruk: <strong>{{ ocrResult.extracted.print_date }}</strong>
                  </div>
                  <div class="ocr-tag">
                    Ważność: <strong>{{ ocrResult.extracted.expiration_date || 'Brak' }}</strong>
                  </div>
                  <button 
                    v-if="ocrResult.extracted.shop_name || ocrResult.extracted.amount || ocrResult.extracted.expiration_date" 
                    type="button" 
                    class="btn-apply-ocr"
                    @click="applyOcrValues"
                  >
                    📥 Zastosuj dane z OCR
                  </button>
                </div>

                <!-- Rozwijany podgląd surowego tekstu z paragonu i obrazu kalibracji -->
                <div v-if="ocrResult && !isOcrRunning" class="raw-ocr-section">
                  <div class="ocr-toggle-buttons">
                    <button type="button" class="btn-toggle-raw" @click="showRawOcrText = !showRawOcrText">
                      {{ showRawOcrText ? '▲ Ukryj tekst OCR' : '▼ Tekst OCR' }}
                    </button>
                    <button v-if="ocrPreviewImage" type="button" class="btn-toggle-raw" @click="showOcrImage = !showOcrImage">
                      {{ showOcrImage ? '▲ Ukryj obraz po filtrze' : '🖼️ Obraz po filtrze' }}
                    </button>
                  </div>
                  <pre v-if="showRawOcrText" class="raw-text-box">{{ ocrResult.rawText }}</pre>
                  <div v-if="showOcrImage && ocrPreviewImage" class="ocr-image-preview-wrapper">
                    <img :src="ocrPreviewImage" class="ocr-filtered-img" alt="Podgląd po kalibracji" />
                  </div>
                </div>
              </div>

              <!-- Formularz danych paragonu -->
              <div class="form-body">
                <!-- Wybór sklepu -->
                <div class="form-group">
                  <label>Sieć handlowa / Sklep:</label>
                  <div class="shop-chips">
                    <button 
                      v-for="shop in popularShops" 
                      :key="shop" 
                      type="button"
                      class="chip-btn" 
                      :class="{ 'active': receiptForm.shop_name === shop }"
                      @click="receiptForm.shop_name = shop"
                    >
                      {{ shop }}
                    </button>
                  </div>
                </div>

                <!-- Kwota kaucji -->
                <div class="form-group">
                  <label>Wartość kaucji (zł):</label>
                  <div class="amount-input-row">
                    <input 
                      type="number" 
                      step="0.50" 
                      min="0" 
                      v-model.number="receiptForm.amount" 
                      class="amount-input" 
                    />
                    <span class="currency">PLN</span>
                  </div>
                  <!-- Szybkie dodawanie kwot -->
                  <div class="quick-amounts">
                    <button type="button" class="btn-quick" @click="addAmount(0.50)">+0.50 zł</button>
                    <button type="button" class="btn-quick" @click="addAmount(1.00)">+1.00 zł</button>
                    <button type="button" class="btn-quick" @click="addAmount(5.00)">+5.00 zł</button>
                    <button type="button" class="btn-quick" @click="addAmount(10.00)">+10.00 zł</button>
                  </div>
                </div>

                <!-- Data ważności -->
                <div class="form-group">
                  <label>Data ważności:</label>
                  <input 
                    type="date" 
                    v-model="receiptForm.expiration_date" 
                    class="date-input" 
                  />
                </div>
              </div>

              <!-- Przyciski akcji -->
              <div class="modal-actions">
                <button class="btn btn-primary" @click="confirmSave(true)">
                  💾 Zapisz i idź do portfela
                </button>
                <button class="btn btn-secondary" @click="confirmSave(false)">
                  ➕ Zapisz i skanuj kolejny
                </button>
                <button class="btn btn-cancel" @click="cancelSave">
                  ✕ Anuluj
                </button>
              </div>
            </div>
          </div>
        </transition>
      </teleport>
      
      <!-- Komunikaty błędów / powiadomienia -->
      <div 
        v-if="errorMsg && !showSaveDialog && !showDuplicateModal && !showArchivedDuplicateModal" 
        class="error-toast"
        :class="{ 'toast-info': isOcrRunning }"
      >
        <span v-if="isOcrRunning" class="ocr-spinner-icon">⏳</span>
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { BarcodeScannerService } from '../services/BarcodeScannerService';
import { BarcodeParserService } from '../services/BarcodeParserService';
import { ReceiptService } from '../services/ReceiptService';
import { OcrService } from '../services/OcrService';

const router = useRouter();

// Stan UI
const videoElement = ref(null);
const targetBoxElement = ref(null);
const fileInput = ref(null);
const isScanning = ref(true);
const isAnalyzingPhoto = ref(false);
const scanResult = ref(null);
const errorMsg = ref('');
const engineName = ref('Ładowanie silnika...');
const localizedBoxStyle = ref(null);
const showSaveDialog = ref(false);
const isAutoParsed = ref(false);

// Duplikaty
const showDuplicateModal = ref(false);
const showArchivedDuplicateModal = ref(false);
const duplicateReceipt = ref(null);

// Stan OCR
const isOcrRunning = ref(false);
const ocrProgress = ref(0);
const ocrStatusText = ref('');
const ocrResult = ref(null);
const showRawOcrText = ref(false);
const showOcrImage = ref(false);
const ocrPreviewImage = ref(null);

const popularShops = ['Biedronka', 'Lidl', 'Dino', 'Kaufland', 'Carrefour', 'Żabka', 'Inny'];

const parsedBarcodeHasDate = ref(false);

const receiptForm = reactive({
  shop_name: 'Biedronka',
  amount: 2.00,
  expiration_date: ReceiptService.getDefaultExpirationDate()
});

// Kontrolki aparatu (latarka, zoom)
let currentStream = null;
let currentTrack = null;
let scanInterval = null;
let isProcessingFrame = false;

const hasTorch = ref(false);
const isTorchOn = ref(false);
const hasZoom = ref(false);
const currentZoom = ref(1);

const checkCameraCapabilities = (track) => {
  if (!track || typeof track.getCapabilities !== 'function') return;
  try {
    const caps = track.getCapabilities();
    if ('torch' in caps) {
      hasTorch.value = true;
    }
    if ('zoom' in caps) {
      hasZoom.value = true;
      currentZoom.value = 1;
    }
  } catch (err) {
    console.warn('Nie można odczytać możliwości aparatu:', err);
  }
};

const toggleTorch = async () => {
  if (!currentTrack || !hasTorch.value) return;
  try {
    isTorchOn.value = !isTorchOn.value;
    await currentTrack.applyConstraints({
      advanced: [{ torch: isTorchOn.value }]
    });
  } catch (err) {
    console.error('Błąd sterowania latarką:', err);
  }
};

const setZoom = async (level) => {
  if (!currentTrack || !hasZoom.value) return;
  try {
    currentZoom.value = level;
    await currentTrack.applyConstraints({
      advanced: [{ zoom: level }]
    });
  } catch (err) {
    console.error('Błąd ustawiania przybliżenia:', err);
  }
};

const startCamera = async () => {
  errorMsg.value = '';
  isScanning.value = true;
  scanResult.value = null;
  localizedBoxStyle.value = null;
  showSaveDialog.value = false;
  showDuplicateModal.value = false;
  showArchivedDuplicateModal.value = false;
  duplicateReceipt.value = null;
  ocrResult.value = null;

  try {
    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    if (videoElement.value) {
      videoElement.value.srcObject = stream;
      await videoElement.value.play();

      const tracks = stream.getVideoTracks();
      if (tracks && tracks.length > 0) {
        currentTrack = tracks[0];
        checkCameraCapabilities(currentTrack);
      }

      startScanLoop();
    }
  } catch (err) {
    console.error('Błąd uruchamiania kamery:', err);
    errorMsg.value = 'Brak dostępu do kamery. Upewnij się, że przyznano uprawnienia lub użyj zdjęcia poniżej.';
  }
};

const stopCamera = () => {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    currentTrack = null;
  }
};

const startScanLoop = () => {
  if (scanInterval) clearInterval(scanInterval);

  scanInterval = setInterval(async () => {
    if (!isScanning.value || isProcessingFrame || !videoElement.value) return;
    if (videoElement.value.readyState < 2) return;

    isProcessingFrame = true;
    try {
      const targetRect = targetBoxElement.value ? targetBoxElement.value.getBoundingClientRect() : null;
      const result = await BarcodeScannerService.scanVideoFrame(videoElement.value, targetRect);
      
      if (result && result.text) {
        if (result.box) {
          computeScreenBoundingBox(result.box);
        }
        let frameSnapshot = null;
        try {
          const snapCanvas = document.createElement('canvas');
          snapCanvas.width = videoElement.value.videoWidth;
          snapCanvas.height = videoElement.value.videoHeight;
          const ctx = snapCanvas.getContext('2d');
          ctx.drawImage(videoElement.value, 0, 0);
          frameSnapshot = snapCanvas;
        } catch (_) {}
        await onBarcodeDetected(result.text, frameSnapshot);
      }
    } catch (e) {
      // Ignoruj błędy pojedynczych klatek
    } finally {
      isProcessingFrame = false;
    }
  }, 60);
};

const computeScreenBoundingBox = (box) => {
  try {
    const video = videoElement.value;
    if (!video) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = video.clientWidth;
    const ch = video.clientHeight;

    const scale = Math.max(cw / vw, ch / vh);
    const renderedWidth = vw * scale;
    const renderedHeight = vh * scale;
    const offsetX = (cw - renderedWidth) / 2;
    const offsetY = (ch - renderedHeight) / 2;

    const screenX = Math.round(box.x * scale + offsetX);
    const screenY = Math.round(box.y * scale + offsetY);
    const screenW = Math.round(box.width * scale);
    const screenH = Math.round(box.height * scale);

    localizedBoxStyle.value = {
      left: `${screenX}px`,
      top: `${screenY}px`,
      width: `${Math.max(screenW, 80)}px`,
      height: `${Math.max(screenH, 30)}px`
    };
  } catch (e) {
    console.warn('Błąd mapowania ramki kodu:', e);
  }
};

/**
 * Główna obsługa wykrytego kodu z weryfikacją duplikatów
 */
const onBarcodeDetected = async (code, sourceFile = null) => {
  if (!isScanning.value && !showSaveDialog.value && !showDuplicateModal.value) return;
  isScanning.value = false;
  scanResult.value = code;

  // --- KROK 1: Sprawdzenie czy kod już istnieje w portfelu (DUPLIKAT) ---
  const dupCheck = await ReceiptService.checkReceiptDuplicate(code);
  if (dupCheck.isDuplicate) {
    duplicateReceipt.value = dupCheck.receipt;
    BarcodeScannerService.notifySuccess();
    stopCamera();

    if (dupCheck.status === 'active') {
      showDuplicateModal.value = true;
    } else {
      showArchivedDuplicateModal.value = true;
    }
    return;
  }

  // --- KROK 2: Nowy kod - inżynieria wsteczna danych z kodu ---
  const parsed = BarcodeParserService.parseBarcode(code);
  receiptForm.shop_name = parsed.shop_name || 'Biedronka';
  receiptForm.amount = (parsed.amount !== undefined && parsed.amount !== null) ? parsed.amount : 2.00;
  receiptForm.expiration_date = parsed.expiration_date || ReceiptService.getDefaultExpirationDate();
  parsedBarcodeHasDate.value = !!parsed.has_date;
  isAutoParsed.value = parsed.detected;

  BarcodeScannerService.notifySuccess();
  stopCamera();
  showSaveDialog.value = true;

  // --- KROK 3: Jeśli użytkownik wgrał zdjęcie, uruchom równolegle OCR w trybie testowym ---
  if (sourceFile) {
    runOcrTest(sourceFile);
  }
};

/**
 * Uruchomienie testowej lub ratunkowej analizy OCR na pliku
 */
const runOcrTest = async (imageFile) => {
  const isFallback = !showSaveDialog.value;
  isOcrRunning.value = true;
  ocrProgress.value = 0;
  ocrStatusText.value = 'Inicjalizacja modelu OCR...';
  ocrResult.value = null;

  if (isFallback) {
    errorMsg.value = 'Nie wykryto kodu kreskowego. Uruchamiam próbę odczytu tekstu OCR...';
  }

  try {
    const result = await OcrService.recognizeReceipt(imageFile, (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        ocrStatusText.value = `Rozpoznawanie tekstu: ${pct}%`;
        ocrProgress.value = m.progress;
        if (isFallback) {
          errorMsg.value = `Nie wykryto kodu kreskowego. Analizowanie tekstu OCR (${pct}%)...`;
        }
      } else if (m.status === 'loading tesseract core') {
        ocrStatusText.value = 'Ładowanie jądra Tesseract...';
        if (isFallback) {
          errorMsg.value = 'Nie wykryto kodu kreskowego. Ładowanie silnika OCR...';
        }
      }
    });

    ocrResult.value = result;
    if (result?.processedCanvas) {
      try {
        ocrPreviewImage.value = result.processedCanvas.toDataURL('image/jpeg', 0.85);
      } catch (e) {
        console.warn('Could not generate OCR preview canvas URL', e);
      }
    }
    console.log('[ScannerView] OCR Result:', result);

    if (isFallback) {
      // 1. Sukces OCR: odnaleziono kod kreskowy w tekście
      if (result?.extracted?.barcode) {
        errorMsg.value = '✓ OCR odczytał kod kreskowy z paragonu!';
        await onBarcodeDetected(result.extracted.barcode, imageFile);
        applyOcrValues();
        setTimeout(() => {
          if (errorMsg.value && errorMsg.value.includes('OCR odczytał')) {
            errorMsg.value = '';
          }
        }, 3000);
        return;
      }

      // 2. OCR przestał pracować: informacja o braku znalezisk
      const hasAnyExtracted = result?.extracted?.shop_name || result?.extracted?.amount || result?.extracted?.expiration_date;
      if (!hasAnyExtracted) {
        errorMsg.value = 'OCR zakończył pracę: Nie udało się odnaleźć kodu ani danych paragonu. Upewnij się, że zdjęcie jest ostre i dobrze oświetlone.';
      } else {
        const parts = [];
        if (result.extracted.shop_name) parts.push(`sklep ${result.extracted.shop_name}`);
        if (result.extracted.amount) parts.push(`kwota ${result.extracted.amount.toFixed(2)} zł`);
        errorMsg.value = `OCR zakończył pracę: Odczytano częściowo (${parts.join(', ')}), lecz nie wykryto kodu kreskowego. Spróbuj zbliżyć sam kod.`;
      }

      // Pozostaw komunikat informacyjny widoczny przez 7 sekund
      setTimeout(() => {
        if (errorMsg.value && errorMsg.value.includes('OCR zakończył')) {
          errorMsg.value = '';
        }
      }, 7000);
    } else {
      // Tryb standardowy (okno zapisu jest już otwarte)
      if (result?.extracted?.expiration_date && !parsedBarcodeHasDate.value) {
        receiptForm.expiration_date = result.extracted.expiration_date;
      }
    }
  } catch (err) {
    console.warn('[ScannerView] OCR error:', err);
    ocrStatusText.value = 'Nie udało się przetworzyć tekstu OCR.';
    if (isFallback) {
      errorMsg.value = 'OCR zakończył pracę: Wystąpił błąd podczas analizy obrazu. Spróbuj ponownie.';
      setTimeout(() => {
        if (errorMsg.value && errorMsg.value.includes('OCR zakończył')) {
          errorMsg.value = '';
        }
      }, 6000);
    }
  } finally {
    isOcrRunning.value = false;
  }
};

const applyOcrValues = () => {
  if (!ocrResult.value?.extracted) return;
  const ext = ocrResult.value.extracted;
  if (ext.shop_name) receiptForm.shop_name = ext.shop_name;
  if (ext.amount) receiptForm.amount = ext.amount;
  if (ext.expiration_date) receiptForm.expiration_date = ext.expiration_date;
};

const addAmount = (val) => {
  receiptForm.amount = Math.round((receiptForm.amount + val) * 100) / 100;
};

const confirmSave = async (goToWallet = true) => {
  if (!scanResult.value) return;

  try {
    await ReceiptService.addReceipt({
      barcode: scanResult.value,
      shop_name: receiptForm.shop_name,
      amount: receiptForm.amount,
      expiration_date: receiptForm.expiration_date,
      status: 'active'
    });

    if (goToWallet) {
      router.push('/');
    } else {
      // Skanuj kolejny
      showSaveDialog.value = false;
      scanResult.value = null;
      localizedBoxStyle.value = null;
      ocrResult.value = null;
      ocrPreviewImage.value = null;
      showOcrImage.value = false;
      showRawOcrText.value = false;
      startCamera();
    }
  } catch (err) {
    errorMsg.value = err.message || 'Błąd zapisu paragonu.';
    setTimeout(() => { errorMsg.value = ''; }, 4000);
  }
};

const cancelSave = () => {
  showSaveDialog.value = false;
  scanResult.value = null;
  localizedBoxStyle.value = null;
  ocrResult.value = null;
  ocrPreviewImage.value = null;
  showOcrImage.value = false;
  showRawOcrText.value = false;
  startCamera();
};

const resetScan = () => {
  showDuplicateModal.value = false;
  showArchivedDuplicateModal.value = false;
  duplicateReceipt.value = null;
  scanResult.value = null;
  localizedBoxStyle.value = null;
  ocrResult.value = null;
  ocrPreviewImage.value = null;
  showOcrImage.value = false;
  showRawOcrText.value = false;
  startCamera();
};

const goToWallet = () => {
  router.push('/');
};

const restoreDuplicateToActive = async () => {
  if (!duplicateReceipt.value) return;
  await ReceiptService.updateReceiptStatus(duplicateReceipt.value.id, 'active');
  router.push('/');
};

const triggerFileInput = () => {
  if (fileInput.value) {
    fileInput.value.click();
  }
};

const handleFileUpload = async (event) => {
  if (event.target.files && event.target.files.length > 0) {
    const file = event.target.files[0];
    isAnalyzingPhoto.value = true;
    errorMsg.value = '';

    try {
      const code = await BarcodeScannerService.scanPhotoMultiPass(file);
      await onBarcodeDetected(code, file);
    } catch (err) {
      console.error('Błąd odczytu zdjęcia:', err);
      // Kod kreskowy nie został wykryty w pierwszym przebiegu - uruchomienie procedury ratunkowej OCR
      await runOcrTest(file);
    } finally {
      isAnalyzingPhoto.value = false;
      event.target.value = '';
    }
  }
};

onMounted(async () => {
  await BarcodeScannerService.initPromise;
  engineName.value = BarcodeScannerService.getEngineName();
  startCamera();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<style scoped>
.scanner-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #000;
  overflow: hidden;
  z-index: 50;
}

.scanner-reader {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scanner-ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 10;
}

.scanner-header {
  margin-top: 35px;
  text-align: center;
  color: white;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  background: rgba(0, 0, 0, 0.45);
  padding: 12px 24px;
  border-radius: 20px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: auto;
  max-width: 90%;
}

.engine-badge {
  display: inline-block;
  background: rgba(79, 192, 141, 0.25);
  border: 1px solid rgba(79, 192, 141, 0.6);
  color: #4fc08d;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 12px;
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.scanner-header h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
}

.scanner-header p {
  margin: 4px 0 10px;
  font-size: 0.85rem;
  opacity: 0.85;
}

/* Narzędzia kamery: latarka i zoom */
.camera-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.zoom-group {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.15);
  padding: 3px 6px;
  border-radius: 10px;
  gap: 4px;
}

.ctrl-label {
  font-size: 0.75rem;
  color: #ddd;
  margin-right: 2px;
}

.ctrl-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.ctrl-btn:active {
  transform: scale(0.94);
}

.ctrl-btn.active {
  background: #4fc08d;
  color: #000;
  font-weight: 700;
  border-color: #4fc08d;
  box-shadow: 0 0 10px rgba(79, 192, 141, 0.5);
}

.fallback-row {
  margin-top: 4px;
}

.btn-fallback {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: white;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.btn-fallback:active {
  transform: scale(0.96);
  background: rgba(255, 255, 255, 0.35);
}

.btn-fallback:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Ramka celownika */
.scan-target {
  position: absolute;
  top: 48%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 86%;
  max-width: 370px;
  height: 150px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 14px;
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65);
  transition: all 0.3s ease;
  overflow: hidden;
}

.scanning .scan-target {
  border-color: rgba(79, 192, 141, 0.65);
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65), 0 0 25px rgba(79, 192, 141, 0.35) inset;
}

.target-hint {
  position: absolute;
  bottom: 8px;
  left: 0;
  width: 100%;
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.75rem;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}

.target-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 1px;
  background: rgba(255, 255, 255, 0.25);
}

.scan-target-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: #4fc08d;
  border-style: solid;
  border-width: 0;
  animation: corner-pulse 2s infinite ease-in-out;
}
.top-left { top: -2px; left: -2px; border-top-width: 4px; border-left-width: 4px; border-top-left-radius: 14px; }
.top-right { top: -2px; right: -2px; border-top-width: 4px; border-right-width: 4px; border-top-right-radius: 14px; }
.bottom-left { bottom: -2px; left: -2px; border-bottom-width: 4px; border-left-width: 4px; border-bottom-left-radius: 14px; }
.bottom-right { bottom: -2px; right: -2px; border-bottom-width: 4px; border-right-width: 4px; border-bottom-right-radius: 14px; }

@keyframes corner-pulse {
  0%, 100% { border-color: #4fc08d; }
  50% { border-color: #72e3b2; filter: drop-shadow(0 0 4px #4fc08d); }
}

/* Płynny laser GPU */
.scan-laser {
  position: absolute;
  top: 0;
  left: 5%;
  width: 90%;
  height: 3px;
  background: #4fc08d;
  box-shadow: 0 0 14px #4fc08d, 0 0 4px #fff;
  will-change: transform, opacity;
  animation: scan-anim-gpu 2.2s infinite ease-in-out;
  display: none;
}
.scanning .scan-laser { display: block; }

@keyframes scan-anim-gpu {
  0% { transform: translateY(15px); opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translateY(135px); opacity: 0; }
}

/* Dynamiczna ramka zlokalizowanego kodu */
.localized-bounding-box {
  position: absolute;
  border: 3px solid #4fc08d;
  background: rgba(79, 192, 141, 0.25);
  border-radius: 8px;
  box-shadow: 0 0 20px #4fc08d;
  pointer-events: none;
  z-index: 25;
  transition: all 0.15s ease-out;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.lock-label {
  background: #4fc08d;
  color: #000;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  transform: translateY(-100%);
  margin-top: -3px;
  letter-spacing: 0.5px;
}

/* Modale */
.save-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25000;
  pointer-events: auto;
  padding: 16px 16px 95px 16px;
  box-sizing: border-box;
}

.save-modal {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: min(78dvh, 580px);
  overflow-y: auto;
  border-radius: 20px;
  padding: 20px 20px 24px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  -webkit-overflow-scrolling: touch;
}

.modal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
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
  background: rgba(239, 68, 68, 0.6);
  transform: scale(0.92);
}

.duplicate-modal {
  border: 2px solid #f59e0b !important;
}

.warning-icon {
  width: 52px;
  height: 52px;
  background: #fef3c7;
  color: #d97706;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  margin: 0 auto 10px;
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
}

.warning-title {
  color: #fbbf24 !important;
}

.info-icon {
  width: 52px;
  height: 52px;
  background: #dbeafe;
  color: #2563eb;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  margin: 0 auto 10px;
}

.duplicate-details {
  text-align: center;
  margin-bottom: 20px;
  font-size: 0.9rem;
  color: #e2e8f0;
}

.duplicate-info-card {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 14px;
  margin-top: 12px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dup-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dup-amount {
  color: #4fc08d;
  font-size: 1.2rem;
}

.modal-header {
  text-align: center;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
}

.barcode-preview {
  margin: 6px 0 0;
  font-family: monospace;
  font-size: 0.85rem;
  color: #4fc08d;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-block;
  word-break: break-all;
}

.auto-detected-badge {
  display: inline-block;
  margin-top: 8px;
  background: rgba(79, 192, 141, 0.2);
  border: 1px solid rgba(79, 192, 141, 0.5);
  color: #4fc08d;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 12px;
}

/* Panel Testowy OCR */
.ocr-test-box {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 16px;
}

.ocr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #38bdf8;
  margin-bottom: 8px;
}

.ocr-pulse {
  color: #facc15;
  animation: pulse 1.5s infinite;
}

.ocr-confidence {
  color: #a7f3d0;
}

.ocr-progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.ocr-progress-fill {
  height: 100%;
  background: #38bdf8;
  transition: width 0.2s;
}

.ocr-status-text {
  font-size: 0.75rem;
  color: #cbd5e1;
  margin: 0;
}

.ocr-extracted-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}

.ocr-tag {
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  color: #e2e8f0;
}

.btn-apply-ocr {
  background: #38bdf8;
  color: #0b1a20;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  margin-left: auto;
}

.raw-ocr-section {
  margin-top: 8px;
}

.ocr-toggle-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-toggle-raw {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.7rem;
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.btn-toggle-raw:hover {
  color: #38bdf8;
}

.ocr-image-preview-wrapper {
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  padding: 6px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.ocr-filtered-img {
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 6px;
}

.raw-text-box {
  background: rgba(0, 0, 0, 0.6);
  color: #93c5fd;
  font-size: 0.68rem;
  padding: 8px;
  border-radius: 6px;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin: 4px 0 0;
  font-family: monospace;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ddd;
}

.shop-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-btn {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.chip-btn.active {
  background: #4fc08d;
  color: #000;
  border-color: #4fc08d;
  box-shadow: 0 2px 8px rgba(79, 192, 141, 0.5);
}

.amount-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.amount-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #4fc08d;
  font-size: 1.4rem;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 12px;
  outline: none;
}

.currency {
  font-weight: 700;
  font-size: 1.1rem;
  color: #aaa;
}

.quick-amounts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.btn-quick {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #eee;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-quick:active {
  background: rgba(255, 255, 255, 0.2);
}

.date-input {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.95rem;
  outline: none;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.glass-panel {
  background: rgba(25, 30, 36, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.success-icon {
  width: 48px;
  height: 48px;
  background: #4fc08d;
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  margin: 0 auto 10px;
  box-shadow: 0 0 20px rgba(79, 192, 141, 0.6);
}

.btn {
  padding: 13px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: #4fc08d;
  color: #000;
  box-shadow: 0 4px 15px rgba(79, 192, 141, 0.4);
}
.btn-secondary {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.btn-ghost {
  background: transparent;
  color: #aaa;
}
.btn-cancel {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.45);
  color: #fca5a5;
  font-weight: 600;
  padding: 11px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-cancel:active {
  background: rgba(239, 68, 68, 0.4);
  transform: scale(0.97);
}

.error-toast {
  position: absolute;
  top: 130px;
  left: 50%;
  transform: translateX(-50%);
  width: 88%;
  max-width: 440px;
  background: rgba(220, 53, 69, 0.95);
  color: white;
  padding: 13px 18px;
  border-radius: 14px;
  font-weight: 600;
  font-size: 0.88rem;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 1000;
  transition: all 0.25s ease;
}

.error-toast.toast-info {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: #38bdf8;
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.25);
}

.ocr-spinner-icon {
  display: inline-block;
  margin-right: 6px;
  animation: pulse-spinner 1.2s infinite ease-in-out;
}

@keyframes pulse-spinner {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.25); opacity: 1; }
}

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translateY(30px) scale(0.96); }
</style>
