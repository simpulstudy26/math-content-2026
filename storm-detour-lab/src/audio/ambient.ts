/**
 * 기내 앰비언트 사운드 — 모두 Web Audio로 생성 (외부 음원 없음, 저작권 문제 없음).
 *   · 낮은 엔진 소리: 갈색 잡음 + 저역 통과
 *   · 잔잔한 패드: 느리게 바뀌는 4화음 (Fmaj7 → Em7 → Dm9 → Cmaj7)
 *   · 노트가 적힐 때 맑은 종소리
 */
export class Ambient {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padBus!: GainNode;
  private timer = 0;
  private chordIndex = 0;
  muted = false;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    // 간단한 잔향: 피드백 딜레이 두 개
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    wet.connect(this.master);
    for (const [time, fb] of [
      [0.37, 0.45],
      [0.53, 0.4],
    ] as const) {
      const dl = ctx.createDelay(1);
      dl.delayTime.value = time;
      const g = ctx.createGain();
      g.gain.value = fb;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      dl.connect(lp).connect(g).connect(dl);
      lp.connect(wet);
      this.wetIn.push(dl);
    }

    // 엔진: 갈색 잡음
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const eg = ctx.createGain();
    eg.gain.value = 0.16;
    noise.connect(lp).connect(eg).connect(this.master);
    noise.start();

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.11;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 1500;
    this.padBus.connect(padLp);
    padLp.connect(this.master);
    this.wetIn.forEach((d) => padLp.connect(d));

    this.playChord();
    this.timer = window.setInterval(() => this.playChord(), 9000);
  }

  private wetIn: DelayNode[] = [];

  private playChord() {
    const ctx = this.ctx;
    if (!ctx) return;
    const chords = [
      [53, 57, 60, 64, 69],
      [52, 55, 59, 62, 67],
      [50, 53, 57, 60, 64],
      [48, 52, 55, 59, 64],
    ];
    const notes = chords[this.chordIndex++ % chords.length];
    const now = ctx.currentTime;
    notes.forEach((midi, i) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = i === 0 ? f / 2 : f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5 / notes.length, now + 3.5);
        g.gain.linearRampToValueAtTime(0.35 / notes.length, now + 8);
        g.gain.linearRampToValueAtTime(0, now + 11.5);
        o.connect(g).connect(this.padBus);
        o.start(now);
        o.stop(now + 12);
      }
    });
  }

  chime(high = false) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const base = high ? 1318.5 : 1046.5;
    [1, 1.5, 2.01].forEach((k, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * k;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + i * 0.09);
      g.gain.linearRampToValueAtTime(0.09 / (i + 1), now + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 2.2);
      o.connect(g).connect(this.master);
      this.wetIn.forEach((d) => g.connect(d));
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 2.4);
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.3);
  }

  suspend() {
    void this.ctx?.suspend();
  }

  stop() {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
    this.wetIn = [];
  }
}
