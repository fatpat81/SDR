import React, { useRef, useEffect, useState } from 'react';
import FFT from 'fft.js';

interface WaterfallProps {
  iqData: Float32Array; // Real part, Imag part interleaved
  centerFreq?: number;
  sampleRate?: number;
}

export const Waterfall: React.FC<WaterfallProps> = ({ iqData, centerFreq = 100500000, sampleRate = 1024000 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fftRef = useRef<any>(null);
  
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  
  const lastMagRef = useRef<Float32Array | null>(null);

  const fftSize = 2048; // Must be power of 2
  const spectrumHeight = 150;
  const waterfallHeight = 250;
  const totalHeight = spectrumHeight + waterfallHeight;

  // Initialize FFT
  useEffect(() => {
    if (!fftRef.current) {
        fftRef.current = new FFT(fftSize);
    }
  }, [fftSize]);

  // Main rendering loop for the DSP graphical base layer
  useEffect(() => {
    if (!iqData || iqData.length === 0 || !canvasRef.current || !fftRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const w = canvas.width;

    // Shift previous waterfall lines down by 1 pixel (only within the waterfall region)
    // Source: x=0, y=spectrumHeight, w, waterfallHeight - 1
    // Dest:   x=0, y=spectrumHeight + 1, w, waterfallHeight - 1
    ctx.drawImage(
      canvas, 
      0, spectrumHeight, w, waterfallHeight - 1, 
      0, spectrumHeight + 1, w, waterfallHeight - 1
    );

    // Compute FFT
    const f = fftRef.current;
    const input = new Array(fftSize * 2).fill(0);
    for (let i = 0; i < fftSize; i++) {
        if (i * 2 + 1 < iqData.length) {
            input[i * 2] = iqData[i * 2];
            input[i * 2 + 1] = iqData[i * 2 + 1];           
        }
    }
    
    const out = f.createComplexArray();
    f.transform(out, input);

    // Prepare arrays for spectrum drawing and tooltip
    const mags = new Float32Array(w);
    const imgData = ctx.createImageData(w, 1);
    
    // Process bins
    // RTL SDR native spectrum puts DC offset at the center, so FFT shift is needed
    for (let i = 0; i < w; i++) {
      let binIdx = Math.floor((i / w) * fftSize);
      
      // Basic FFT shift: swap left and right halves
      binIdx = (binIdx + fftSize / 2) % fftSize;
      
      const real = out[binIdx * 2];
      const imag = out[binIdx * 2 + 1];
      const mag = Math.sqrt(real * real + imag * imag);
      mags[i] = mag;
      
      const val = Math.min(255, aMagScale(mag));
      
      const px = i * 4;
      imgData.data[px + 0] = Math.max(15, val * 0.2); // R
      imgData.data[px + 1] = Math.max(23, val * 0.8); // G
      imgData.data[px + 2] = Math.max(42, val);       // B
      imgData.data[px + 3] = 255;                     // A
    }
    
    lastMagRef.current = mags;

    // 1. Draw top line of the waterfall
    ctx.putImageData(imgData, 0, spectrumHeight);

    // 2. Draw Spectrum Analyzer
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, spectrumHeight); // Clear existing spectrum

    ctx.beginPath();
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth = 1;
    
    // Map magnitudes to pixel heights
    for (let i = 0; i < w; i++) {
      // Convert magnitude to a decibel approximation for spectrum drawing
      const db = Math.max(0, Math.log10(mags[i] + 1) * 30);
      const yPos = spectrumHeight - Math.min(spectrumHeight, db);
      
      if (i === 0) ctx.moveTo(i, yPos);
      else ctx.lineTo(i, yPos);
    }
    ctx.stroke();

  }, [iqData]);

  // UI overlay drawing (Crosshairs) - updates when hoverX/Y changes or IQ updates
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    
    const w = overlay.width;
    const h = overlay.height;
    
    ctx.clearRect(0, 0, w, h);
    
    if (hoverX !== null && hoverY !== null) {
      // Draw crosshairs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      // Vertical line
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, h);
      // Horizontal line
      ctx.moveTo(0, hoverY);
      ctx.lineTo(w, hoverY);
      ctx.stroke();

      // Calculate localized Frequency and Power
      const freqHz = centerFreq - (sampleRate / 2) + (hoverX / w) * sampleRate;
      
      let dbPower = 0;
      if (lastMagRef.current && lastMagRef.current[hoverX] !== undefined) {
          dbPower = Math.log10(lastMagRef.current[hoverX] + 1) * 10; 
      }
      
      const txt = `${(freqHz / 1000000).toFixed(4)} MHz | ${dbPower.toFixed(1)} dBFS`;
      
      // Info box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(hoverX + 10, hoverY + 10, 200, 25);
      
      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';
      ctx.fillText(txt, hoverX + 15, hoverY + 27);
    }
  }, [hoverX, hoverY, iqData, centerFreq, sampleRate]);

  const aMagScale = (mag: number) => {
      return Math.log10(mag + 1) * 300; 
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Scale standard mouse coordinates against the internal resolution
    const scaleX = 1024 / rect.width;
    const scaleY = totalHeight / rect.height;
    
    setHoverX(Math.floor((e.clientX - rect.left) * scaleX));
    setHoverY(Math.floor((e.clientY - rect.top) * scaleY));
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    setHoverY(null);
  };

  return (
    <div className="waterfall-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%', display: 'block' }}
        width={1024} 
        height={totalHeight} 
      />
      <canvas 
        ref={overlayRef} 
        style={{ width: '100%', height: '100%', display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}
        width={1024} 
        height={totalHeight} 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {hoverX && hoverY && (
        <div className="canvas-overlay">
          Target Acquired
        </div>
      )}
    </div>
  );
};
