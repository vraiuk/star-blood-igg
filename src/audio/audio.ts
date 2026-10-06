import type { GameEvent, Phase } from '../sim/types';

/** Procedural WebAudio SFX and ambience — no audio files. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private droneNight!: GainNode;
  enabled = true;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.32;
    this.amb.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 0.55 : 0, this.ctx.currentTime, 0.05);
    return this.enabled;
  }

  setPhase(phase: Phase) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneNight.gain.setTargetAtTime(phase === 'night' ? 0.5 : 0.08, t, 1.5);
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // warm pad (the tree)
    const pad = ctx.createGain();
    pad.gain.value = 0.18;
    pad.connect(this.amb);
    for (const f of [110, 164.8, 220, 277.2]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.08;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.004;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(pad);
      o.start(); lfo.start();
    }
    // dissonant void drone (night)
    this.droneNight = ctx.createGain();
    this.droneNight.gain.value = 0.08;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.droneNight.connect(lp).connect(this.amb);
    for (const f of [41.2, 43.6, 61.7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      o.connect(g).connect(this.droneNight);
      o.start();
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    n.connect(bp).connect(ng).connect(this.droneNight);
    n.start();
  }

  private ok(key: string, gap: number): boolean {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;
    if ((this.last.get(key) ?? -1) + gap > now) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(events: GameEvent[]) {
    if (!this.ctx || !this.enabled) return;
    const PENTA = [523, 587, 659, 784, 880, 1047];
    for (const e of events) {
      switch (e.type) {
        case 'shoot':
          if (e.kind === 'arrow' && this.ok('arrow', 0.06)) { this.hiss(0.08, 2400, 0.25, 2); this.tone(380, 0.06, 'triangle', 0.12, 200); }
          else if (e.kind === 'acid' && this.ok('acid', 0.1)) this.tone(160, 0.18, 'sawtooth', 0.08, 70);
          else if (e.kind === 'spark' && this.ok('spark', 0.1)) this.tone(1400, 0.08, 'sine', 0.06, 2000);
          break;
        case 'hit':
          if (this.ok('hit', 0.035)) this.hiss(0.05, e.crit ? 3000 : 1600, e.crit ? 0.3 : 0.18, 3);
          break;
        case 'enemyDied':
          if (this.ok('die', 0.05)) {
            this.tone(e.kind === 'mother' ? 60 : 120, e.kind === 'mother' ? 1.2 : 0.25, 'sine', 0.35, 40);
            this.hiss(e.kind === 'mother' ? 1 : 0.2, 600, 0.2, 0.8, 'lowpass');
          }
          break;
        case 'pickup':
          if (e.kind === 'star') { if (this.ok('pickS', 0.05)) { this.tone(1760, 0.3, 'sine', 0.12); this.tone(2637, 0.3, 'sine', 0.06, undefined, 0.05); } }
          else if (this.ok('pick', 0.03)) this.tone(PENTA[Math.floor(Math.random() * PENTA.length)] * 1.5, 0.15, 'sine', 0.12);
          break;
        case 'built':
          this.tone(140, 0.15, 'triangle', 0.3, 90);
          this.hiss(0.12, 900, 0.2, 1, 'lowpass');
          this.tone(660 + e.tier * 160, 0.3, 'sine', 0.1, undefined, 0.05);
          if (e.tier >= 2) [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.6, 'sine', 0.08, undefined, 0.1 + i * 0.07));
          break;
        case 'sold':
          this.tone(300, 0.2, 'triangle', 0.15, 150);
          break;
        case 'structureLost':
          this.hiss(0.4, 500, 0.4, 0.7, 'lowpass');
          this.tone(90, 0.35, 'sine', 0.3, 50);
          break;
        case 'treeHit':
          if (this.ok('tree', 0.25)) { this.tone(80, 0.2, 'sine', 0.25, 60); this.tone(330, 0.15, 'triangle', 0.06, 280); }
          break;
        case 'treeGrew':
          [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => this.tone(f, 2.2, 'sine', 0.12, undefined, i * 0.09));
          this.hiss(1.5, 5000, 0.08, 0.5, 'highpass');
          break;
        case 'cast':
          if (e.ability === 'spear') { this.hiss(0.18, 3500, 0.2, 1.5); this.tone(900, 0.18, 'sine', 0.12, 1800); }
          else if (e.ability === 'hammer') { this.tone(1200, 0.5, 'sine', 0.2, 400); this.hiss(0.4, 4000, 0.25, 0.6, 'highpass'); }
          else { [1568, 1319, 1047, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.1, f * 0.5, i * 0.08)); }
          break;
        case 'spikeStrike':
          if (this.ok('spike', 0.1)) { this.tone(200, 0.1, 'square', 0.06, 90); this.hiss(0.08, 700, 0.2, 2); }
          break;
        case 'beam':
          if (this.ok('beam', 0.1)) { this.tone(1800, 0.25, 'sine', 0.1, 600); this.hiss(0.2, 5000, 0.12, 1, 'highpass'); }
          break;
        case 'chain':
          if (this.ok('chain', 0.1)) this.hiss(0.18, 3000, 0.3, 0.5, 'highpass');
          break;
        case 'ram':
          this.tone(110, 0.2, 'square', 0.12, 60); this.hiss(0.15, 600, 0.3, 1, 'lowpass');
          break;
        case 'meteor':
          this.tone(90, 0.6, 'sine', 0.4, 35); this.hiss(0.5, 900, 0.4, 0.6, 'lowpass');
          break;
        case 'shield':
        case 'secondWind':
          [523.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.2, 'triangle', 0.12, undefined, i * 0.06));
          break;
        case 'rankUp':
        case 'rune':
          [659.3, 880, 1318.5].forEach((f, i) => this.tone(f, 0.9, 'sine', 0.12, undefined, i * 0.1));
          break;
        case 'nightStart':
          this.tone(55, 1.4, 'sine', 0.5, 38);
          this.tone(58, 1.4, 'sawtooth', 0.08, 40, 0.05);
          this.hiss(1.2, 200, 0.3, 0.5, 'lowpass');
          break;
        case 'dawn':
          [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.6, 'sine', 0.1, undefined, i * 0.15));
          break;
        case 'brood':
          this.tone(240, 0.3, 'sawtooth', 0.08, 120);
          break;
        case 'keeperHit':
          if (this.ok('khit', 0.2)) this.tone(220, 0.1, 'square', 0.06, 160);
          break;
        case 'keeperDown':
          this.tone(330, 0.8, 'triangle', 0.2, 110);
          break;
        case 'denied':
          if (this.ok('deny', 0.2)) this.tone(110, 0.12, 'square', 0.06);
          break;
        case 'won':
        case 'milestone':
          [392, 523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 2.5, 'sine', 0.12, undefined, i * 0.12));
          break;
        case 'lost':
          [220, 207.7, 196, 146.8].forEach((f, i) => this.tone(f, 1.6, 'triangle', 0.15, undefined, i * 0.3));
          break;
        default: break;
      }
    }
  }
}
