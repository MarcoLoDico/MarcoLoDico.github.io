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
  private hornReed: OscillatorNode | null = null;
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

    // Stall warning: the 172's horn is a reed blown by air sucked through a
    // slot in the wing's leading edge, so it screeches rather than beeps — a
    // harsh, fluttering whine around 1.8 kHz that rises and sharpens as the
    // airflow over the reed strengthens near the stall.
    const reed = ctx.createOscillator();
    reed.type = "sawtooth";
    reed.frequency.value = 1_700;
    const overtone = ctx.createOscillator();
    overtone.type = "square";
    overtone.frequency.value = 1_700 * 1.497;
    const overtoneLevel = ctx.createGain();
    overtoneLevel.gain.value = 0.18;
    // Flutter: the reed wobbles in pitch several times a second.
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 7.5;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 38;
    flutter.connect(flutterDepth);
    flutterDepth.connect(reed.frequency);
    flutterDepth.connect(overtone.frequency);
    const resonance = ctx.createBiquadFilter();
    resonance.type = "bandpass";
    resonance.frequency.value = 2_100;
    resonance.Q.value = 3.5;
    const edge = ctx.createWaveShaper();
    edge.curve = new Float32Array(Array.from({ length: 256 }, (_, i) => Math.tanh(((i - 128) / 128) * 2.6)));
    this.horn = ctx.createGain();
    this.horn.gain.value = 0;
    reed.connect(edge);
    overtone.connect(overtoneLevel).connect(edge);
    edge.connect(resonance).connect(this.horn).connect(this.master);
    reed.start();
    overtone.start();
    flutter.start();
    this.hornReed = reed;
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
    // The reed starts as a thin squeal as the warning begins, then screams.
    const warning = running ? Math.max(0, Math.min(1, stallWarning)) : 0;
    this.horn.gain.setTargetAtTime(warning > 0.02 ? 0.03 + warning ** 1.3 * 0.1 : 0, t, 0.04);
    this.hornReed?.frequency.setTargetAtTime(1_500 + warning * 450, t, 0.08);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
