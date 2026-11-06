/**
 * Engine and wind sound from oscillators and filtered noise: no audio files
 * to download. Starts on the first user gesture, as browsers require.
 */
export class FlightSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode[] = [];
  private engineGain: GainNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private horn: GainNode | null = null;
  muted = false;

  start(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const ctx = new AudioContext();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // Four-cylinder engine: firing pulses at rpm/30, filtered to a throaty rumble.
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 520;
    lowpass.Q.value = 0.8;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    lowpass.connect(this.engineGain).connect(this.master);
    for (const [type, level] of [
      ["sawtooth", 0.5],
      ["square", 0.18],
      ["sine", 0.6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(lowpass);
      osc.start();
      this.engine.push(osc);
    }

    // Wind: looping noise through a band-pass that opens with airspeed.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    source.connect(this.windFilter).connect(this.wind).connect(this.master);
    source.start();

    // Stall warning horn.
    const horn = ctx.createOscillator();
    horn.type = "square";
    horn.frequency.value = 410;
    this.horn = ctx.createGain();
    this.horn.gain.value = 0;
    horn.connect(this.horn).connect(this.master);
    horn.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.05);
    }
  }

  update(rpm: number, throttle: number, airspeed: number, stallWarning: number, running: boolean): void {
    const ctx = this.context;
    if (!ctx || !this.engineGain || !this.wind || !this.windFilter || !this.horn) {
      return;
    }
    const t = ctx.currentTime;
    const base = Math.max(8, rpm / 30);
    this.engine.forEach((osc, i) => osc.frequency.setTargetAtTime(base * ([1, 2, 0.5][i] ?? 1), t, 0.05));
    this.engineGain.gain.setTargetAtTime(running ? 0.16 + throttle * 0.22 : 0, t, 0.1);
    this.wind.gain.setTargetAtTime(running ? Math.min(0.35, (airspeed / 60) ** 2 * 0.25) : 0, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + airspeed * 18, t, 0.15);
    this.horn.gain.setTargetAtTime(running && stallWarning > 0.5 ? 0.06 : 0, t, 0.03);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
