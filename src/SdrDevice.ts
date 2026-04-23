import RtlSdr from '@sdr.cool/rtlsdrjs';

export class SdrDevice {
  private sdr: any | null = null;
  private isRunning: boolean = false;
  private onDataCallback: ((data: ArrayBuffer) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;

  private sampleRate: number;
  private centerFreq: number;

  constructor(sampleRate: number = 1024000, centerFreq: number = 100500000) {
    this.sampleRate = sampleRate;
    this.centerFreq = centerFreq;
  }

  public async requestAndOpen(gain: number | null = null): Promise<boolean> {
    try {
      this.sdr = await RtlSdr.requestDevice();
      const options = gain !== null ? { gain } : {};
      await this.sdr.open(options);
      
      await this.sdr.setSampleRate(this.sampleRate);
      await this.sdr.setCenterFrequency(this.centerFreq);
      await this.sdr.resetBuffer();

      return true;
    } catch (err: any) {
      if (this.onErrorCallback) {
        this.onErrorCallback(
          new Error(
            err.message?.includes('claim') 
              ? 'Could not claim device. Zadig check: do you have the WinUSB driver installed?'
              : err.message
          )
        );
      }
      return false;
    }
  }

  public async getAndOpen(gain: number | null = null): Promise<boolean> {
    try {
      const devices = await RtlSdr.getDevices();
      if (!devices || devices.length === 0) return false;
      
      this.sdr = devices[0];
      const options = gain !== null ? { gain } : {};
      await this.sdr.open(options);
      
      await this.sdr.setSampleRate(this.sampleRate);
      await this.sdr.setCenterFrequency(this.centerFreq);
      await this.sdr.resetBuffer();

      return true;
    } catch (err: any) {
      // Ignore errors for silent auto-connection
      return false;
    }
  }

  public setCallbacks(onData: (data: ArrayBuffer) => void, onError: (err: Error) => void) {
    this.onDataCallback = onData;
    this.onErrorCallback = onError;
  }

  public async setFrequency(freqHz: number) {
    if (this.sdr) {
      this.centerFreq = freqHz;
      await this.sdr.setCenterFrequency(freqHz);
    }
  }

  public async start() {
    if (!this.sdr) return;
    this.isRunning = true;
    
    // Start read loop
    while (this.isRunning) {
      try {
        // Read 16k blocks (interleaved IQ: 8k samples)
        const samples = await this.sdr.readSamples(16 * 16384);
        if (this.onDataCallback) {
          this.onDataCallback(samples);
        }
      } catch (err: any) {
        if (this.isRunning && this.onErrorCallback) {
          this.onErrorCallback(err);
        }
        this.isRunning = false;
      }
    }
  }

  public async stop() {
    this.isRunning = false;
    // Some basic timeout / state resets can be placed here
  }
}
