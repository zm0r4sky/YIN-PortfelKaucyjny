<template>
  <div class="scanner-container">
    <!-- Czysty element video dla ZXing -->
    <video ref="videoElement" class="scanner-reader" autoplay muted playsinline></video>

    <div class="scanner-ui-overlay" :class="{ 'scanning': isScanning, 'success': scanResult }">
      <div class="scanner-header">
        <h1>Skanuj Paragon</h1>
        <p>Umieść kod kreskowy kaucji w ramce</p>
        
        <!-- Przycisk do robienia zdjęcia (fallback) -->
        <button class="btn-fallback" @click="triggerFileInput" v-if="!scanResult">
          📷 Nie łapie ostrości? Zrób zdjęcie
        </button>
        <input 
          type="file" 
          ref="fileInput" 
          accept="image/*" 
          capture="environment" 
          style="display: none;" 
          @change="handleFileUpload"
        />
      </div>

      <div class="scan-target" v-if="!scanResult">
        <div class="scan-target-corner top-left"></div>
        <div class="scan-target-corner top-right"></div>
        <div class="scan-target-corner bottom-left"></div>
        <div class="scan-target-corner bottom-right"></div>
        <div class="scan-laser"></div>
      </div>

      <!-- Ręczne wpisywanie -->
      <div class="manual-fallback glass-panel" v-if="!scanResult">
        <p>Skaner nie daje rady? Wpisz numer ręcznie:</p>
        <div class="input-group">
          <input type="text" v-model="manualCode" placeholder="Wpisz np. 9841..." class="manual-input" />
          <button class="btn btn-primary btn-small" @click="submitManualCode">OK</button>
        </div>
      </div>

      <transition name="fade-up">
        <div v-if="scanResult" class="scan-result-card glass-panel">
          <div class="success-icon">✓</div>
          <h3>Kod Rozpoznany!</h3>
          <p class="barcode-value">{{ scanResult }}</p>
          <div class="actions">
            <button class="btn btn-primary" @click="saveReceipt">Dodaj do portfela</button>
            <button class="btn btn-secondary" @click="resetScan">Skanuj ponownie</button>
          </div>
        </div>
      </transition>
      
      <div v-if="errorMsg && !scanResult" class="error-toast">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { ReceiptService } from '../services/ReceiptService';
import { useRouter } from 'vue-router';

const router = useRouter();
const scanResult = ref(null);
const isScanning = ref(true);
const errorMsg = ref('');
const fileInput = ref(null);
const manualCode = ref('');
const videoElement = ref(null);
let codeReader = null;

const startScanner = async () => {
  errorMsg.value = '';
  isScanning.value = true;
  scanResult.value = null;

  try {
    const hints = new Map();
    // Optymalizacja na potężne kody: 28 cyfr wymaga skupienia na Code 128
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.ITF,
      BarcodeFormat.EAN_13,
      BarcodeFormat.QR_CODE
    ]);
    // Najważniejsza flaga: zmusza algorytm do głębszej analizy m.in obrazów pod kątem i trudnych do odczytania kodów 1D
    hints.set(DecodeHintType.TRY_HARDER, true);

    codeReader = new BrowserMultiFormatReader(hints);

    // Problem z html5-qrcode polegał na tym, że używał domyślnie jakości "ziemniaka" np. 640x480.
    // 28-cyfrowy kod potrzebuje bardzo wysokiej rozdzielczości, żeby prążki wielkości 1 piksela się nie zlewały.
    // Wymuszamy na urządzeniu 1080p lub wyżej z autofocusem.
    const videoConstraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 }
      }
    };

    // Odpalamy kamerę
    await codeReader.decodeFromConstraints(videoConstraints, videoElement.value, (result, err) => {
      if (result && isScanning.value) {
        // SUKCES - znaleziono kod
        isScanning.value = false;
        scanResult.value = result.getText();
        codeReader.reset(); // wyłącza stream kamery
      }
      if (err) {
        // Zxing wyrzuca błąd "NotFoundException" przy każdej klatce wideo, na której nie ma kodu. To normalne zachowanie.
      }
    });
  } catch (err) {
    console.error("Błąd uruchamiania kamery ZXing:", err);
    errorMsg.value = "Brak dostępu do kamery w wymaganej rozdzielczości HD.";
  }
};

const triggerFileInput = () => {
  if (fileInput.value) fileInput.value.click();
};

const handleFileUpload = async (event) => {
  if (event.target.files && event.target.files.length > 0) {
    const imageFile = event.target.files[0];
    
    try {
      errorMsg.value = '';
      if (codeReader && isScanning.value) {
        codeReader.reset(); // Stop kamery na żywo
      }
      
      const imgUrl = URL.createObjectURL(imageFile);
      const result = await codeReader.decodeFromImageUrl(imgUrl);
      
      isScanning.value = false;
      scanResult.value = result.getText();
    } catch (err) {
      console.error("Błąd odczytu ze zdjęcia (ZXing):", err);
      errorMsg.value = "Zxing nie rozpoznał kodu na zdjęciu. Spróbuj ostrzejsze zdjęcie z bliższej odległości.";
      
      if (isScanning.value) startScanner();
      setTimeout(() => { if(errorMsg.value.includes("Zxing nie rozpoznał")) errorMsg.value = ''; }, 5000);
    }
    
    event.target.value = '';
  }
};

const submitManualCode = () => {
  if (manualCode.value.trim().length > 5) {
    if (codeReader) codeReader.reset();
    isScanning.value = false;
    scanResult.value = manualCode.value.trim();
  } else {
    errorMsg.value = "Wpisany kod jest za krótki.";
    setTimeout(() => { errorMsg.value = ''; }, 3000);
  }
};

const stopScanner = () => {
  if (codeReader) {
    codeReader.reset(); // zatrzymuje śledzenie streamu
  }
};

const resetScan = () => {
  scanResult.value = null;
  isScanning.value = true;
  errorMsg.value = '';
  manualCode.value = '';
  startScanner();
};

const saveReceipt = async () => {
  if (!scanResult.value) return;
  
  await ReceiptService.addReceipt({
    barcode: scanResult.value,
    shop_name: 'Nieznany (Wymaga weryfikacji)',
    amount: 1.00,
    expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active'
  });
  
  router.push('/');
};

onMounted(() => {
  startScanner();
});

onUnmounted(() => {
  stopScanner();
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

:deep(#reader) { border: none !important; }
:deep(#reader video) { object-fit: cover !important; width: 100% !important; height: 100% !important; }
:deep(#reader__scan_region) { background: transparent !important; }
:deep(#reader__dashboard) { display: none !important; }

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
  margin-top: 40px;
  text-align: center;
  color: white;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  background: rgba(0, 0, 0, 0.4);
  padding: 15px 30px;
  border-radius: 20px;
  backdrop-filter: blur(5px);
  pointer-events: auto;
}

.scanner-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.scanner-header p {
  margin: 5px 0 15px;
  font-size: 0.9rem;
  opacity: 0.8;
}

.btn-fallback {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: white;
  padding: 8px 15px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}
.btn-fallback:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.3);
}

.scan-target {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  max-width: 350px;
  height: 120px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65);
  transition: all 0.3s ease;
}

.scanning .scan-target {
  border-color: rgba(79, 192, 141, 0.5);
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65), 0 0 20px rgba(79, 192, 141, 0.4) inset;
}

.scan-target-corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border-color: #4fc08d;
  border-style: solid;
  border-width: 0;
}
.top-left { top: -2px; left: -2px; border-top-width: 4px; border-left-width: 4px; border-top-left-radius: 12px; }
.top-right { top: -2px; right: -2px; border-top-width: 4px; border-right-width: 4px; border-top-right-radius: 12px; }
.bottom-left { bottom: -2px; left: -2px; border-bottom-width: 4px; border-left-width: 4px; border-bottom-left-radius: 12px; }
.bottom-right { bottom: -2px; right: -2px; border-bottom-width: 4px; border-right-width: 4px; border-bottom-right-radius: 12px; }

.scan-laser {
  position: absolute;
  left: 5%;
  width: 90%;
  height: 2px;
  background: #4fc08d;
  box-shadow: 0 0 10px #4fc08d;
  animation: scan-anim 2s infinite linear;
  display: none;
}
.scanning .scan-laser { display: block; }

@keyframes scan-anim {
  0% { top: 10%; opacity: 0; }
  10% { opacity: 1; }
  90% { top: 90%; opacity: 1; }
  100% { top: 90%; opacity: 0; }
}

.manual-fallback {
  position: absolute;
  bottom: 120px;
  width: 90%;
  max-width: 400px;
  pointer-events: auto;
  text-align: center;
  padding: 15px;
}
.manual-fallback p {
  margin: 0 0 10px 0;
  font-size: 0.9rem;
  font-weight: bold;
}
.input-group {
  display: flex;
  gap: 10px;
}
.manual-input {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.4);
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 1rem;
}
.manual-input::placeholder { color: #aaa; }
.btn-small { padding: 10px 20px; }

.scan-result-card {
  position: absolute;
  bottom: 80px;
  width: 90%;
  max-width: 400px;
  pointer-events: auto;
  text-align: center;
}

.glass-panel {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  padding: 25px;
  color: white;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.success-icon {
  width: 50px;
  height: 50px;
  background: #4fc08d;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
  margin: 0 auto 15px;
  box-shadow: 0 0 20px rgba(79, 192, 141, 0.6);
}

.barcode-value {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 2px;
  background: rgba(0,0,0,0.3);
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 20px;
  word-break: break-all;
}

.actions { display: flex; flex-direction: column; gap: 12px; }

.btn {
  padding: 14px 20px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
.btn:active { transform: scale(0.97); }

.btn-primary {
  background: #4fc08d;
  color: #fff;
  box-shadow: 0 4px 15px rgba(79, 192, 141, 0.4);
}
.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.error-toast {
  position: absolute;
  top: 150px;
  width: 80%;
  background: rgba(220, 53, 69, 0.9);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 500;
  text-align: center;
}

.fade-up-enter-active, .fade-up-leave-active { transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.fade-up-enter-from, .fade-up-leave-to { opacity: 0; transform: translateY(40px) scale(0.95); }
</style>
