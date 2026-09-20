/**
 * @project YIN-PortfelKaucyjny
 * @file BarcodeScannerService.js
 * @author ZMoRa / YIN Ecosystem
 * @copyright © 2026 ZMoRa / YIN Ecosystem. All rights reserved.
 * @license Proprietary
 *
 * Ultra-fast hybrid barcode scanning engine:
 * 1. Native Hardware BarcodeDetector API (Google ML Kit on Android)
 * 2. High-speed WebAssembly ZXing-C++ with LocalAverage adaptive binarization
 * 3. Multi-zone video scanning (Target ROI + Full Frame)
 * 4. Multi-pass image preprocessor for captured photos of thermal receipts
 */

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

// Ensure 100% offline-first PWA operation with local WASM module
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

    // Reusable canvas elements for zero-allocation performance
    this.roiCanvas = null;
    this.roiCtx = null;
    this.fullCanvas = null;
    this.fullCtx = null;

    this.initPromise = this.initEngines();
  }

  async initEngines() {
    // 1. Check Native BarcodeDetector (hardware accelerated on Android Chrome / Chromium)
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        if (supported && (supported.includes('code_128') || supported.includes('ean_13'))) {
          this.nativeDetector = new window.BarcodeDetector({
            formats: ['code_128', 'ean_13', 'itf', 'qr_code', 'code_39']
          });
          this.nativeSupported = true;
          this.activeEngineName = '⚡ Sprzętowy Android (ML Kit)';
          console.log('[BarcodeScannerService] Native Hardware BarcodeDetector is ACTIVE');
          return;
        }
      } catch (err) {
        console.warn('[BarcodeScannerService] Native detector check failed, fallback to WASM:', err);
      }
    }

    // 2. ZXing-C++ WebAssembly (universal for iOS Safari, Firefox, and all browsers)
    this.activeEngineName = '🚀 ZXing-C++ (WebAssembly)';
    console.log('[BarcodeScannerService] ZXing-C++ WebAssembly is ACTIVE');
  }

  getEngineName() {
    return this.activeEngineName;
  }

  notifySuccess() {
    // Web Audio API beep
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
    } catch (e) {}

    // Haptic vibration
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80, 40, 80]);
    }
  }

  /**
   * Scans a single video frame with multi-zone strategy:
   * Zone 1: Center Target Region (ROI) - ultra fast (~2ms)
   * Zone 2: Full Sensor Frame (downscaled) - wider angle
   * @param {HTMLVideoElement} video
   * @param {DOMRect} targetRectInScreen
   * @returns {Promise<{ text: string, box?: object } | null>}
   */
  async scanVideoFrame(video, targetRectInScreen = null) {
    if (!video || video.readyState < 2) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    // --- STEP 1: Hardware Android Native Detector (fastest) ---
    if (this.nativeSupported && this.nativeDetector) {
      try {
        const barcodes = await this.nativeDetector.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = barcodes[0];
          return {
            text: raw.rawValue.trim(),
            box: raw.boundingBox || null,
            cornerPoints: raw.cornerPoints || null,
            source: 'native'
          };
        }
      } catch (e) {
        // Fallback to WASM
      }
    }

    // --- STEP 2: ZXing WebAssembly Center Target ROI ---
    // If screen target box is given, crop the exact center area where user aims
    if (targetRectInScreen && video.clientWidth && video.clientHeight) {
      const roiResult = await this.scanVideoROI(video, targetRectInScreen);
      if (roiResult) return roiResult;
    }

    // --- STEP 3: ZXing WebAssembly Full Frame (optimized resolution) ---
    const fullResult = await this.scanVideoFullFrame(video, vw, vh);
    if (fullResult) return fullResult;

    return null;
  }

  /**
   * Crops and decodes the center region matching the on-screen target box
   */
  async scanVideoROI(video, targetRect) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = video.clientWidth;
    const ch = video.clientHeight;

    // Calculate object-fit: cover mapping
    const scale = Math.max(cw / vw, ch / vh);
    const renderedWidth = vw * scale;
    const renderedHeight = vh * scale;
    const offsetX = (cw - renderedWidth) / 2;
    const offsetY = (ch - renderedHeight) / 2;

    // Target box in video coordinates
    const vx = Math.max(0, Math.round((targetRect.left - offsetX) / scale));
    const vy = Math.max(0, Math.round((targetRect.top - offsetY) / scale));
    const vWidth = Math.min(vw - vx, Math.round(targetRect.width / scale));
    const vHeight = Math.min(vh - vy, Math.round(targetRect.height / scale));

    if (vWidth <= 10 || vHeight <= 10) return null;

    if (!this.roiCanvas) {
      this.roiCanvas = document.createElement('canvas');
      this.roiCtx = this.roiCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (this.roiCanvas.width !== vWidth || this.roiCanvas.height !== vHeight) {
      this.roiCanvas.width = vWidth;
      this.roiCanvas.height = vHeight;
    }

    // Draw only the target region
    this.roiCtx.drawImage(video, vx, vy, vWidth, vHeight, 0, 0, vWidth, vHeight);
    const imgData = this.roiCtx.getImageData(0, 0, vWidth, vHeight);

    try {
      const results = await readBarcodes(imgData, {
        formats: ['Code128', 'EAN13', 'ITF', 'QRCode', 'Code39'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'LocalAverage',
        maxNumberOfSymbols: 1
      });

      if (results && results.length > 0 && results[0].text) {
        const r = results[0];
        // Map local ROI coordinates back to screen
        let box = null;
        if (r.position) {
          box = {
            x: vx + Math.min(r.position.topLeft.x, r.position.bottomLeft.x),
            y: vy + Math.min(r.position.topLeft.y, r.position.topRight.y),
            width: Math.abs(r.position.topRight.x - r.position.topLeft.x),
            height: Math.abs(r.position.bottomLeft.y - r.position.topLeft.y)
          };
        }
        return {
          text: r.text.trim(),
          box,
          source: 'wasm-roi'
        };
      }
    } catch (e) {}

    return null;
  }

  /**
   * Downscaled full frame analysis for wider area coverage
   */
  async scanVideoFullFrame(video, vw, vh) {
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    const targetW = Math.round(vw * scale);
    const targetH = Math.round(vh * scale);

    if (!this.fullCanvas) {
      this.fullCanvas = document.createElement('canvas');
      this.fullCtx = this.fullCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (this.fullCanvas.width !== targetW || this.fullCanvas.height !== targetH) {
      this.fullCanvas.width = targetW;
      this.fullCanvas.height = targetH;
    }

    this.fullCtx.drawImage(video, 0, 0, targetW, targetH);
    const imgData = this.fullCtx.getImageData(0, 0, targetW, targetH);

    try {
      const results = await readBarcodes(imgData, {
        formats: ['Code128', 'EAN13', 'ITF', 'QRCode', 'Code39'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'LocalAverage',
        maxNumberOfSymbols: 1
      });

      if (results && results.length > 0 && results[0].text) {
        const r = results[0];
        let box = null;
        if (r.position) {
          box = {
            x: Math.round(Math.min(r.position.topLeft.x, r.position.bottomLeft.x) / scale),
            y: Math.round(Math.min(r.position.topLeft.y, r.position.topRight.y) / scale),
            width: Math.round(Math.abs(r.position.topRight.x - r.position.topLeft.x) / scale),
            height: Math.round(Math.abs(r.position.bottomLeft.y - r.position.topLeft.y) / scale)
          };
        }
        return {
          text: r.text.trim(),
          box,
          source: 'wasm-full'
        };
      }
    } catch (e) {}

    return null;
  }

  /**
   * Multi-pass deep scanner for captured receipt photos (File/Blob)
   */
  async scanPhotoMultiPass(imageBlob) {
    await this.initPromise;

    // PASS 1: Native BarcodeDetector
    if (this.nativeSupported && this.nativeDetector) {
      try {
        const results = await this.nativeDetector.detect(imageBlob);
        if (results && results.length > 0 && results[0].rawValue) {
          this.notifySuccess();
          return results[0].rawValue.trim();
        }
      } catch (e) {}
    }

    // PASS 1b: WASM Raw
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
        this.notifySuccess();
        return wasmResults[0].text.trim();
      }
    } catch (e) {}

    // Load image into canvas for enhanced contrast & slicing
    const img = await this.loadImageFromBlob(imageBlob);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // PASS 2: Scale/Normalize to optimal 1600px width (upscale low-res, downscale 4K) + Grayscale Contrast Stretch
    const targetWidth = 1600;
    const scale = Math.max(1, Math.min(3, targetWidth / (img.naturalWidth || 1000)));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    this.enhanceThermalPaperContrast(ctx, canvas.width, canvas.height);

    const pass2Results = await this.scanCanvas(canvas);
    if (pass2Results) {
      this.notifySuccess();
      return pass2Results;
    }

    // PASS 3: Sliced crops for tall vertical receipts
    if (canvas.height > canvas.width * 1.2) {
      const sliceHeight = Math.round(canvas.height * 0.45);
      const slices = [
        { y: 0, h: sliceHeight },
        { y: Math.round(canvas.height * 0.3), h: sliceHeight },
        { y: Math.round(canvas.height * 0.55), h: sliceHeight }
      ];

      for (const slice of slices) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = slice.h;
        const sCtx = sliceCanvas.getContext('2d', { willReadFrequently: true });
        sCtx.drawImage(canvas, 0, slice.y, canvas.width, slice.h, 0, 0, canvas.width, slice.h);

        const sliceResult = await this.scanCanvas(sliceCanvas);
        if (sliceResult) {
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
    } catch (e) {}
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
