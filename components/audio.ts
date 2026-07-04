class UIAudio {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported', e);
        this.enabled = false;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    // Envelope
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playClick() {
    this.playTone(600, 'sine', 0.1, 0.05);
  }

  playPop() {
    this.playTone(400, 'sine', 0.15, 0.1);
    setTimeout(() => this.playTone(600, 'sine', 0.15, 0.05), 50);
  }

  playSuccess() {
    this.playTone(440, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(554.37, 'sine', 0.1, 0.1), 100);
    setTimeout(() => this.playTone(659.25, 'sine', 0.3, 0.1), 200);
  }
}

export const uiAudio = new UIAudio();
