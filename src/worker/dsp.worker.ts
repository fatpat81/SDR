// @ts-ignore
import FFT from 'fft.js';

// The input stream is 8-bit unsigned integers from raw RTL-SDR WebUSB endpoint
// Web Worker processing ensures the main UI thread remains unblocked

let prevZReal = 0;
let prevZImag = 0;

self.onmessage = (e) => {
  const { type, buffer, sampleRate } = e.data;
  
  if (type === 'IQ_DATA' && buffer) {
    const rawData = new Uint8Array(buffer);
    
    // 1. Convert to floating point
    const numSamples = rawData.length / 2;
    const iqData = new Float32Array(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
        iqData[i * 2] = (rawData[i * 2] - 127.5) / 127.5;
        iqData[i * 2 + 1] = (rawData[i * 2 + 1] - 127.5) / 127.5;
    }

    if (e.data.mode === 'DMR') {
      // DMR 4FSK Demodulation Skeleton
      // Digital Mobile Radio involves 4FSK symbol decoding at 4800 symbols/sec
      // A full JS implementation requires tracking frequency deviation, bit slicing, and ideally AMBE extraction via WASM.
      
      // We will perform a standard FM discriminator pass here as the baseline for 4FSK,
      // but without the complex decimation/audio filtering used by voice FM, 
      // as DMR voice frames require a digital vocoder.
      
      const symbolData = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const currZReal = iqData[i * 2];
        const currZImag = iqData[i * 2 + 1];
        const conjMultR = (currZReal * prevZReal) + (currZImag * prevZImag);
        const conjMultI = (currZImag * prevZReal) - (currZReal * prevZImag);
        symbolData[i] = Math.atan2(conjMultI, conjMultR);
        prevZReal = currZReal;
        prevZImag = currZImag;
      }
      
      // To prevent audio screeching from RAW 4FSK data, we return silent audio for out-of-the-box DMR mode,
      // until the AMBE vocoder pipeline is implemented.
      const silentOut = new Float32Array(Math.floor(numSamples / Math.floor(sampleRate / 48000)));
      (self as any).postMessage({
        type: 'AUDIO_READY',
        audioBuffer: silentOut.buffer
      }, [silentOut.buffer]);
      
    } else {
      // 2. WFM / Analog FM Demodulation (Quadrature demod logic)

    const audioData = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      const currZReal = iqData[i * 2];
      const currZImag = iqData[i * 2 + 1];
      
      // z[n] * conj(z[n-1])
      const conjMultR = (currZReal * prevZReal) + (currZImag * prevZImag);
      const conjMultI = (currZImag * prevZReal) - (currZReal * prevZImag);
      
      audioData[i] = Math.atan2(conjMultI, conjMultR);
      
      prevZReal = currZReal;
      prevZImag = currZImag;
    }

    // 3. Very basic decimation (just skipping samples for demo purposes, 
    // a real LPF should be applied prior to decimation)
    const targetSampleRate = 48000;
    const decimationFactor = Math.floor(sampleRate / targetSampleRate);
    const decimatedLength = Math.floor(audioData.length / decimationFactor);
    const decimatedOut = new Float32Array(decimatedLength);
    
    for (let i = 0; i < decimatedLength; i++) {
      decimatedOut[i] = audioData[i * decimationFactor];
    }

      // Send back audio data
      (self as any).postMessage({
        type: 'AUDIO_READY',
        audioBuffer: decimatedOut.buffer
      }, [decimatedOut.buffer]);
    }
  }
};

// Placeholder hooks for specific protocols
export function decodeADSB() {
  console.log("ADS-B Decoder Stub");
}

export function decodeDMR() {
  console.log("DMR Digital Voice Decoder Stub");
}
