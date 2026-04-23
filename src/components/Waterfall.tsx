import React, { useRef, useEffect } from 'react';
import FFT from 'fft.js';

interface WaterfallProps {
  iqData: Float32Array; // Real part, Imag part interleaved
}

export const Waterfall: React.FC<WaterfallProps> = ({ iqData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fftRef = useRef<any>(null);
  const fftSize = 2048; // Must be power of 2

  useEffect(() => {
    // Initialize FFT from fft.js. Fast and efficient for web base apps.
    if (!fftRef.current) {
        fftRef.current = new FFT(fftSize);
    }
  }, [fftSize]);

  useEffect(() => {
    if (!iqData || iqData.length === 0 || !canvasRef.current || !fftRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Shift previous waterfall lines down
    const w = canvas.width;
    const h = canvas.height;
    ctx.drawImage(canvas, 0, 0, w, h - 1, 0, 1, w, h - 1);

    // Compute FFT using JS-native or WASM-based underlying implementation
    // fft.js is highly optimized
    const f = fftRef.current;
    
    // We only take the first `fftSize` samples
    const input = new Array(fftSize * 2).fill(0);
    for (let i = 0; i < fftSize; i++) {
        // Safe mapping if lengths match
        if (i * 2 + 1 < iqData.length) {
            input[i * 2] = iqData[i * 2];
            input[i * 2 + 1] = iqData[i * 2 + 1];           
        }
    }
    
    const out = f.createComplexArray();
    f.transform(out, input);

    // Render magnitude at top line
    const imgData = ctx.createImageData(w, 1);
    
    // Quick helper to map magnitude to a simple blue/white color scale (Professional dark mode look)
    for (let i = 0; i < w; i++) {
      // FFT bins map across the canvas.
      const binIdx = Math.floor((i / w) * fftSize);
      
      const real = out[binIdx * 2];
      const imag = out[binIdx * 2 + 1];
      const mag = Math.sqrt(real * real + imag * imag);
      
      const val = Math.min(255, aMagScale(mag));
      
      const px = i * 4;
      imgData.data[px + 0] = Math.max(15, val * 0.2); // R
      imgData.data[px + 1] = Math.max(23, val * 0.8); // G
      imgData.data[px + 2] = Math.max(42, val);       // B
      imgData.data[px + 3] = 255;                     // A
    }
    
    ctx.putImageData(imgData, 0, 0);
  }, [iqData]);

  // Arbitrary magnitude scalar
  const aMagScale = (mag: number) => {
      // simple logarithmic-like scaling
      return Math.log10(mag + 1) * 300; 
  }

  return (
    <canvas 
      ref={canvasRef} 
      className="waterfall-canvas" 
      width={1024} 
      height={300} 
    />
  );
};
