<template>
  <div class="scanner-container">
    <!-- Czysty element video dla podglądu kamery -->
    <video ref="videoElement" class="scanner-reader" autoplay muted playsinline></video>

    <!-- Nakładka UI skanera -->
    <div class="scanner-ui-overlay" :class="{ 'scanning': isScanning, 'success': scanResult }">
      
      <!-- Górny nagłówek z kontrolkami -->
      <div class="scanner-header" v-if="!showSaveDialog">
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
        
        <!-- Przycisk do robienia zdjęcia (silnik wieloprzebiegowy) -->
        <div class="fallback-row" v-if="!scanResult">
          <button class="btn-fallback" @click="triggerFileInput" :disabled="isAnalyzingPhoto">
            <span v-if="isAnalyzingPhoto">⏳ Analizuję zdjęcie...</span>
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
        v-if="localizedBoxStyle && !showSaveDialog" 
        class="localized-bounding-box" 
        :style="localizedBoxStyle"
      >
        <span class="lock-label">Zablokowano kod!</span>
      </div>

      <!-- Karta zatwierdzenia i uzupełnienia danych paragonu (Modal) -->
      <transition name="fade-up">
        <div v-if="showSaveDialog" class="save-modal-overlay">
          <div class="save-modal glass-panel">
            <div class="modal-header">
              <div class="success-icon">✓</div>
              <h3>Kod Rozpoznany!</h3>
              <p class="barcode-preview">{{ scanResult }}</p>
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
              <button class="btn btn-ghost" @click="cancelSave">
                Anuluj
              </button>
            </div>
          </div>
        </div>
      </transition>
      
      <!-- Komunikaty błędów / powiadomienia -->
      <div v-if="errorMsg && !showSaveDialog" class="error-toast">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { BarcodeScannerService } from '../services/BarcodeScannerService';
import { ReceiptService } from '../services/ReceiptService';

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

const popularShops = ['Biedronka', 'Lidl', 'Dino', 'Kaufland', 'Carrefour', 'Żabka', 'Inny'];

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
        onBarcodeDetected(result.text);
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

const onBarcodeDetected = (code) => {
  if (!isScanning.value) return;
  isScanning.value = false;
  scanResult.value = code;

  // Domyślne wartości formularza
  receiptForm.amount = 2.00;
  receiptForm.expiration_date = ReceiptService.getDefaultExpirationDate();

  BarcodeScannerService.notifySuccess();
  stopCamera();
  showSaveDialog.value = true;
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
  startCamera();
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
      onBarcodeDetected(code);
    } catch (err) {
      console.error('Błąd odczytu zdjęcia:', err);
      errorMsg.value = err.message || 'Nie udało się rozpoznać kodu ze zdjęcia.';
      setTimeout(() => {
        if (errorMsg.value.includes('Nie udało się')) errorMsg.value = '';
      }, 6000);
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

/* Płynny laser GPU (transform zamiast top) */
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

/* Modal zapisu paragonu */
.save-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: auto;
  padding: 16px;
  box-sizing: border-box;
}

.save-modal {
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
}

.modal-header {
  text-align: center;
  margin-bottom: 20px;
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

.error-toast {
  position: absolute;
  top: 130px;
  width: 85%;
  background: rgba(220, 53, 69, 0.95);
  color: white;
  padding: 12px 18px;
  border-radius: 12px;
  font-weight: 500;
  font-size: 0.9rem;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translateY(30px) scale(0.96); }
</style>
