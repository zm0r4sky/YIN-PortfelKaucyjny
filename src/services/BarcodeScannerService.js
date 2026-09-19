/**
 * @project YIN-PortfelKaucyjny
 * @file BarcodeScannerService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * High-performance hybrid barcode scanning service combining:
 * 1. Native Hardware BarcodeDetector API (Chromium / Android Google ML Kit)
 * 2. High-speed WebAssembly ZXing-C++ (zxing-wasm) with LocalAverage binarization
 * 3. Multi-pass image preprocessor for difficult/crumpled thermal receipts
 */

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

// Configure local WASM serving to guarantee 100% offline-first PWA operation
const wasmUrl = (import.meta.env?.BASE_URL || '/') + 'zxing_reader.wasm';

prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => {
      if (path.endsWith('.wasm')) {
        return wasmUrl;
      }
      return prefix + path;
    }
  }
});

class BarcodeScannerServiceClass {
  constructor() {
    this.nativeDetector = null;
    this.nativeSupported = false;
    this.activeEngineName = 'Inicjalizacja...';
    
    // Reusable offscreen canvas for frame extraction
    this.offscreenCanvas = null;
    this.offscreenCtx = null;

    this.initPromise = this.initEngines();
  }

  async initEngines() {
    // 1. Check Native BarcodeDetector (available in modern Android Chrome / Edge)
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        if (supported && supported.includes('code_128')) {
          this.nativeDetector = new window.BarcodeDetector({
            formats: ['code_128', 'ean_13', 'itf', 'qr_code', 'code_39']
          });
          this.nativeSupported = true;
          this.activeEngineName = '⚡ Sprzętowy Android (ML Kit)';
          console.log('[BarcodeScannerService] Native BarcodeDetector is ACTIVE');
          return;
        }
      } catch (err) {
        console.warn('[BarcodeScannerService] Native detector check failed, fallback to WASM:', err);
      }
    }

    // 2. WebAssembly ZXing-C++ Engine (universal for iOS Safari, Firefox, and all browsers)
    this.activeEngineName = '🚀 ZXing-C++ (WebAssembly)';
    console.log('[BarcodeScannerService] ZXing-C++ WebAssembly is ACTIVE');
  }

  getEngineName() {
    return this.activeEngineName;
  }

  /**
   * Sound & Haptic notification on successful scan
   */
  notifySuccess() {
    // Audio Beep (Web Audio API)
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch (e) {
      // Audio might be blocked by browser autoplay policy until user interaction
    }

    // Vibration feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  }

  /**
   * Helper: Extracts ImageData from HTMLVideoElement for ZXing WASM
   * zxing-wasm requires ImageData, Blob, or ArrayBuffer (does not accept HTMLVideoElement directly)
   */
  getVideoImageData(video) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (this.offscreenCanvas.width !== w || this.offscreenCanvas.height !== h) {
      this.offscreenCanvas.width = w;
      this.offscreenCanvas.height = h;
    }

    this.offscreenCtx.drawImage(video, 0, 0, w, h);
    return this.offscreenCtx.getImageData(0, 0, w, h);
  }

  /**
   * Scans a single video frame with hybrid strategy
   * @param {HTMLVideoElement} video
   * @returns {Promise<string|null>}
   */
  async scanVideoFrame(video) {
    if (!video || video.readyState < 2) return null;

    // A. Native engine check first (hardware accelerated Google ML Kit ~5ms)
    if (this.nativeSupported && this.nativeDetector) {
      try {
        const barcodes = await this.nativeDetector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          return barcodes[0].rawValue.trim();
        }
      } catch (e) {
        // Fallback to WASM
      }
    }

    // B. WebAssembly ZXing-C++ engine (converts video frame to ImageData)
    try {
      const imageData = this.getVideoImageData(video);
      if (!imageData) return null;

      const results = await readBarcodes(imageData, {
        formats: ['Code128', 'EAN13', 'ITF', 'QRCode', 'Code39'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'LocalAverage',
        maxNumberOfSymbols: 1
      });

      if (results && results.length > 0 && results[0].text) {
        return results[0].text.trim();
      }
    } catch (e) {
      // Frame skipped or not found
    }

    return null;
  }

  /**
   * Multi-pass deep scanner for captured receipt photos (File/Blob)
   * Handles thermal paper glare, wrinkled receipts, and extreme resolutions
   * @param {Blob|File} imageBlob
   * @returns {Promise<string>}
   */
  async scanPhotoMultiPass(imageBlob) {
    await this.initPromise;

    // --- PASS 1: Direct scan on original raw image ---
    if (this.nativeSupported && this.nativeDetector) {
      try {
        const results = await this.nativeDetector.detect(imageBlob);
        if (results && results.length > 0 && results[0].rawValue) {
          console.log('[MultiPass] Found in Pass 1 (Native BarcodeDetector)');
          this.notifySuccess();
          return results[0].rawValue.trim();
        }
      } catch (e) {}
    }

    try {
      const wasmResults = await readBarcodes(imageBlob, {
        formats: ['Code128', 'EAN13', 'ITF', 'QRCode', 'Code39'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        tryDenoise: true,
        binarizer: 'LocalAverage'
      });

      if (wasmResults && wasmResults.length > 0 && wasmResults[0].text) {
        console.log('[MultiPass] Found in Pass 1 (WASM Raw)');
        this.notifySuccess();
        return wasmResults[0].text.trim();
      }
    } catch (e) {}

    // Load image into an HTMLImageElement for canvas-based passes
    const img = await this.loadImageFromBlob(imageBlob);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // --- PASS 2: Downscale to optimal 1600px width + Grayscale Contrast Stretch ---
    const targetWidth = 1600;
    const scale = Math.min(1, targetWidth / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    this.enhanceThermalPaperContrast(ctx, canvas.width, canvas.height);

    const pass2Results = await this.scanCanvas(canvas);
    if (pass2Results) {
      console.log('[MultiPass] Found in Pass 2 (Enhanced Contrast 1600px)');
      this.notifySuccess();
      return pass2Results;
    }

    // --- PASS 3: Sliced crops (if the receipt is tall/vertical) ---
    if (canvas.height > canvas.width * 1.2) {
      const sliceHeight = Math.round(canvas.height * 0.45);
      const slices = [
        { y: 0, h: sliceHeight, name: 'Top' },
        { y: Math.round(canvas.height * 0.3), h: sliceHeight, name: 'Center' },
        { y: Math.round(canvas.height * 0.55), h: sliceHeight, name: 'Bottom' }
      ];

      for (const slice of slices) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = slice.h;
        const sCtx = sliceCanvas.getContext('2d', { willReadFrequently: true });
        sCtx.drawImage(canvas, 0, slice.y, canvas.width, slice.h, 0, 0, canvas.width, slice.h);

        const sliceResult = await this.scanCanvas(sliceCanvas);
        if (sliceResult) {
          console.log(`[MultiPass] Found in Pass 3 (${slice.name} Slice)`);
          this.notifySuccess();
          return sliceResult;
        }
      }
    }

    throw new Error('Nie udało się odczytać kodu kreskowego. Upewnij się, że kod jest widoczny, nieprześwietlony i ostry.');
  }

  async scanCanvas(canvas) {
    if (this.nativeSupported && this.nativeDetector) {
      try {
        const results = await this.nativeDetector.detect(canvas);
        if (results && results.length > 0 && results[0].rawValue) {
          return results[0].rawValue.trim();
        }
      } catch (e) {}
    }

    try {
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const wasmResults = await readBarcodes(imgData, {
        formats: ['Code128', 'EAN13', 'ITF', 'QRCode', 'Code39'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'LocalAverage'
      });

      if (wasmResults && wasmResults.length > 0 && wasmResults[0].text) {
        return wasmResults[0].text.trim();
      }
    } catch (e) {}

    return null;
  }

  /**
   * Preprocessing: Grayscale & Contrast stretching specifically for thermal receipt paper
   */
  enhanceThermalPaperContrast(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const len = data.length;

      let minLum = 255;
      let maxLum = 0;

      for (let i = 0; i < len; i += 16) {
        const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }

      const lumRange = Math.max(1, maxLum - minLum);

      for (let i = 0; i < len; i += 4) {
        const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        const stretched = Math.min(255, Math.max(0, ((lum - minLum) * 255) / lumRange));
        data[i] = stretched;
        data[i + 1] = stretched;
        data[i + 2] = stretched;
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('Thermal contrast enhancement skipped:', e);
    }
  }

  loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }
}

export const BarcodeScannerService = new BarcodeScannerServiceClass();
