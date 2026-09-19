<template>
  <div class="scanner-container">
    <!-- Czysty element video dla podglądu kamery -->
    <video ref="videoElement" class="scanner-reader" autoplay muted playsinline></video>

    <!-- Nakładka UI skanera -->
    <div class="scanner-ui-overlay" :class="{ 'scanning': isScanning, 'success': scanResult }">
      
      <!-- Górny nagłówek z kontrolkami -->
      <div class="scanner-header">
        <div class="engine-badge" v-if="isScanning">
          {{ engineName }}
        </div>
        <h1>Skaner Paragonów</h1>
        <p>Skieruj obiektyw na kod kreskowy kaucji</p>

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
        
        <!-- Przycisk do robienia zdjęcia (zaawansowany silnik wieloprzebiegowy) -->
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

      <!-- Ramka celownika z laserem -->
      <div class="scan-target" v-if="!scanResult">
        <div class="scan-target-corner top-left"></div>
        <div class="scan-target-corner top-right"></div>
        <div class="scan-target-corner bottom-left"></div>
        <div class="scan-target-corner bottom-right"></div>
        <div class="scan-laser"></div>
        <div class="target-hint">Trzymaj obiektyw w odległości 20–30 cm</div>
      </div>

      <!-- Karta sukcesu po rozpoznaniu kodu -->
      <transition name="fade-up">
        <div v-if="scanResult" class="scan-result-card glass-panel">
          <div class="success-icon">✓</div>
          <h3>Kod Rozpoznany!</h3>
          <div class="barcode-type-pill">{{ detectedType }}</div>
          <p class="barcode-value">{{ scanResult }}</p>
          <div class="actions">
            <button class="btn btn-primary" @click="saveReceipt">Dodaj do portfela</button>
            <button class="btn btn-secondary" @click="resetScan">Skanuj następny</button>
          </div>
        </div>
      </transition>
      
      <!-- Komunikaty błędów / powiadomienia -->
      <div v-if="errorMsg && !scanResult" class="error-toast">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { BarcodeScannerService } from '../services/BarcodeScannerService';
import { ReceiptService } from '../services/ReceiptService';

const router = useRouter();

// Stan UI
const videoElement = ref(null);
const fileInput = ref(null);
const isScanning = ref(true);
const isAnalyzingPhoto = ref(false);
const scanResult = ref(null);
const errorMsg = ref('');
const engineName = ref('Ładowanie silnika...');
const detectedType = ref('Code 128 (Kaucja)');

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

  // Skanowanie w pętli 15 razy na sekundę (co ~65ms)
  scanInterval = setInterval(async () => {
    if (!isScanning.value || isProcessingFrame || !videoElement.value) return;
    if (videoElement.value.readyState < 2) return;

    isProcessingFrame = true;
    try {
      const code = await BarcodeScannerService.scanVideoFrame(videoElement.value);
      if (code) {
        onBarcodeDetected(code);
      }
    } catch (e) {
      // Pomiń błędy pojedynczych klatek
    } finally {
      isProcessingFrame = false;
    }
  }, 65);
};

const onBarcodeDetected = (code) => {
  if (!isScanning.value) return;
  isScanning.value = false;
  scanResult.value = code;

  // Rozpoznanie typu kodu
  if (code.length >= 20) {
    detectedType.value = 'Code 128 (Bilet / Paragon Kaucyjny)';
  } else if (code.length === 13) {
    detectedType.value = 'EAN-13 (Kaucja sklepowa)';
  } else {
    detectedType.value = 'Kod Kreskowy';
  }

  BarcodeScannerService.notifySuccess();
  stopCamera();
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

const resetScan = () => {
  scanResult.value = null;
  errorMsg.value = '';
  startCamera();
};

const saveReceipt = async () => {
  if (!scanResult.value) return;

  await ReceiptService.addReceipt({
    barcode: scanResult.value,
    shop_name: 'Nieznany (Weryfikacja)',
    amount: 1.00,
    expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active'
  });

  router.push('/');
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
}

.scanning .scan-target {
  border-color: rgba(79, 192, 141, 0.65);
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65), 0 0 25px rgba(79, 192, 141, 0.35) inset;
}

.target-hint {
  position: absolute;
  bottom: -32px;
  left: 0;
  width: 100%;
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.8rem;
  letter-spacing: 0.3px;
}

.scan-target-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: #4fc08d;
  border-style: solid;
  border-width: 0;
}
.top-left { top: -2px; left: -2px; border-top-width: 4px; border-left-width: 4px; border-top-left-radius: 14px; }
.top-right { top: -2px; right: -2px; border-top-width: 4px; border-right-width: 4px; border-top-right-radius: 14px; }
.bottom-left { bottom: -2px; left: -2px; border-bottom-width: 4px; border-left-width: 4px; border-bottom-left-radius: 14px; }
.bottom-right { bottom: -2px; right: -2px; border-bottom-width: 4px; border-right-width: 4px; border-bottom-right-radius: 14px; }

.scan-laser {
  position: absolute;
  left: 4%;
  width: 92%;
  height: 3px;
  background: #4fc08d;
  box-shadow: 0 0 12px #4fc08d, 0 0 4px #fff;
  animation: scan-anim 2s infinite linear;
  display: none;
}
.scanning .scan-laser { display: block; }

@keyframes scan-anim {
  0% { top: 12%; opacity: 0; }
  10% { opacity: 1; }
  90% { top: 88%; opacity: 1; }
  100% { top: 88%; opacity: 0; }
}

/* Karta wyniku */
.scan-result-card {
  position: absolute;
  bottom: 80px;
  width: 90%;
  max-width: 420px;
  pointer-events: auto;
  text-align: center;
}

.glass-panel {
  background: rgba(25, 30, 36, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  padding: 24px;
  color: white;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.success-icon {
  width: 52px;
  height: 52px;
  background: #4fc08d;
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: bold;
  margin: 0 auto 12px;
  box-shadow: 0 0 24px rgba(79, 192, 141, 0.7);
}

.barcode-type-pill {
  display: inline-block;
  background: rgba(79, 192, 141, 0.2);
  color: #4fc08d;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.barcode-value {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  background: rgba(0,0,0,0.4);
  padding: 12px 14px;
  border-radius: 10px;
  margin-bottom: 20px;
  word-break: break-all;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: monospace;
}

.actions { display: flex; flex-direction: column; gap: 10px; }

.btn {
  padding: 13px 20px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: #4fc08d;
  color: #000;
  font-weight: 700;
  box-shadow: 0 4px 15px rgba(79, 192, 141, 0.4);
}
.btn-secondary {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
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

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translateY(30px) scale(0.96); }
</style>
