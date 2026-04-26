import { useState, useRef, useEffect } from 'react';
import './App.css';
import { SdrDevice } from './SdrDevice';
import { Waterfall } from './components/Waterfall';
import DspWorker from './worker/dsp.worker.ts?worker';

function App() {
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [frequency, setFrequency] = useState(100500000); // 100.5 MHz
  const [gain, setGain] = useState(20);
  const [volume, setVolume] = useState(50);
  const [mode, setMode] = useState('FM'); // FM or DMR
  
  const [currentIq, setCurrentIq] = useState<Float32Array>(new Float32Array());

  const sdrRef = useRef<SdrDevice | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    workerRef.current = new DspWorker();
    
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'AUDIO_READY') {
        const audioData = new Float32Array(e.data.audioBuffer);
        playAudio(audioData);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const tryAutoConnect = async () => {
      const device = new SdrDevice(1024000, frequency);
      const success = await device.getAndOpen(gain);
      if (success) {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 48000
            });
            // Audio context might be suspended before user gesture, but SDR can start.
        }
        setupDevice(device);
      }
    };
    tryAutoConnect();
  }, []);

  const playAudio = (data: Float32Array) => {
    if (!audioCtxRef.current) return;
    try {
        const buf = audioCtxRef.current.createBuffer(1, data.length, 48000);
        buf.copyToChannel(data as any, 0);
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buf;
        
        const gainNode = audioCtxRef.current.createGain();
        gainNode.gain.value = volume / 100;
        
        source.connect(gainNode);
        gainNode.connect(audioCtxRef.current.destination);
        source.start();
    } catch(e) { }
  };

  const handleConnect = async () => {
    if (deviceConnected && sdrRef.current) {
      await sdrRef.current.stop();
      setDeviceConnected(false);
      return;
    }

    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 48000
        });
    }

    const device = new SdrDevice(1024000, frequency);
    const success = await device.requestAndOpen(gain);
    if (success) {
      setupDevice(device);
    }
  };

  const setupDevice = (device: SdrDevice) => {
    sdrRef.current = device;
    
    device.setCallbacks(
      (data) => {
        // Send to worker for demodulation (zero-copy transfer of buffer)
        // Keep a copy of data for FFT visualization in the main thread (converting to float just for visualization)
        const d = new Uint8Array(data.slice(0));
        const numSamples = d.length / 2;
        const viz = new Float32Array(Math.min(numSamples * 2, 4096)); // Just enough for FFT
        for (let i = 0; i < viz.length / 2; i++) {
           viz[i*2] = (d[i*2] - 127.5)/127.5;
           viz[i*2+1] = (d[i*2+1] - 127.5)/127.5;
        }
        setCurrentIq(viz);

        workerRef.current?.postMessage({
          type: 'IQ_DATA',
          mode: mode,
          buffer: data,
          sampleRate: 1024000
        }, [data]);
      }, 

      (err) => {
        alert(err.message);
        setDeviceConnected(false);
      }
    );

    setDeviceConnected(true);
    device.start();
  };

  const handleFreqChange = (f: number) => {
      setFrequency(f);
      sdrRef.current?.setFrequency(f);
  };

  const handleFreqInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val)) {
        handleFreqChange(val);
      } else {
        // Allow empty state during typing
        setFrequency(e.target.value as any);
      }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>WebSDR_Underground</h1>
        <div className={`status-badge ${deviceConnected ? 'connected' : ''}`}>
          {deviceConnected ? 'RTL-SDR Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="controls-panel">
        <div className="panel tuner-panel">
          <h2>Tuner</h2>
          <div className="control-group">
            <input 
              type="number"
              className="freq-display-input"
              value={frequency}
              onChange={handleFreqInput}
            />
          </div>
          <div className="control-group">
            <label>Center Frequency</label>
            <input 
              type="range" 
              min="88000000" 
              max="108000000" 
              step="100000" 
              value={frequency}
              onChange={(e) => handleFreqChange(Number(e.target.value))}
            />
          </div>
          <button className="btn-primary" onClick={handleConnect}>
            {deviceConnected ? 'Disconnect' : 'Connect Device'}
          </button>
        </div>

        <div className="panel settings-panel">
          <h2>Settings</h2>
          <div className="control-group">
            <label>Tuner Gain</label>
            <input 
              type="range" 
              min="0" 
              max="50" 
              value={gain} 
              onChange={(e) => setGain(Number(e.target.value))}
            />
          </div>
          <div className="control-group">
            <label>Volume</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={volume} 
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
          <div className="control-group">
            <label>Demodulation Mode</label>
            <select className="mode-select" value={mode} onChange={(e) => setMode(e.target.value)}>
               <option value="FM">FM (Analog Voice)</option>
               <option value="DMR">DMR (Digital Mobile Radio)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel canvas-container">
        <Waterfall iqData={currentIq} centerFreq={frequency} sampleRate={1024000} />
      </div>
    </div>
  );
}

export default App;
