import type { Voice } from './types';

/**
 * Small synthesis primitives the packs are built from.
 *
 * Everything here schedules at an absolute AudioContext time and stops itself.
 * Nodes are single-use by design — the Web Audio graph collects them once they
 * have finished, so a spin can schedule a couple of hundred without leaking.
 */

interface ToneOptions {
  at: number;
  /** Starting frequency in Hz. */
  freq: number;
  /** Glides to this by the end if given — a drop reads as a struck object. */
  endFreq?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  /**
   * Attack in seconds. Near-instant by default: a tick is a physical impulse,
   * and anything slower reads as a beep rather than something being struck.
   */
  attack?: number;
}

export function tone(v: Voice, o: ToneOptions): void {
  const osc = v.ctx.createOscillator();
  const amp = v.ctx.createGain();

  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.at);
  if (o.endFreq !== undefined) {
    // Exponential rather than linear: pitch is perceived logarithmically, so
    // this is the one that sounds like a natural fall rather than a swoop.
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.endFreq, 1), o.at + o.duration);
  }

  // A short ramp in and out rather than a hard start: an instant jump from
  // silence to full amplitude is itself a click, audible on top of the sound.
  const attack = Math.min(o.attack ?? 0.0015, o.duration * 0.5);
  amp.gain.setValueAtTime(0.0001, o.at);
  amp.gain.exponentialRampToValueAtTime(Math.max(o.gain, 0.0002), o.at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, o.at + o.duration);

  osc.connect(amp);
  amp.connect(v.dest);
  osc.start(o.at);
  osc.stop(o.at + o.duration + 0.02);
}

interface NoiseOptions {
  at: number;
  duration: number;
  gain: number;
  /** Filter corner or centre. This is what gives noise a sense of material. */
  freq: number;
  /** Higher is narrower, so more pitched and less "shh". */
  q?: number;
  endFreq?: number;
  /**
   * bandpass isolates a band, lowpass keeps the body and drops the fizz,
   * highpass keeps only the snap of a transient.
   */
  filter?: BiquadFilterType;
}

export function noise(v: Voice, o: NoiseOptions): void {
  const src = v.ctx.createBufferSource();
  const band = v.ctx.createBiquadFilter();
  const amp = v.ctx.createGain();

  src.buffer = v.noise;
  // Looped so a layer longer than the shared buffer keeps sounding instead of
  // stopping partway. Short bursts never reach the end, so this costs nothing.
  src.loop = true;
  // Start somewhere random in the buffer so repeated ticks aren't bit-identical.
  const offset = Math.random() * Math.max(v.noise.duration - 0.01, 0);

  band.type = o.filter ?? 'bandpass';
  band.frequency.setValueAtTime(o.freq, o.at);
  if (o.endFreq !== undefined) {
    band.frequency.exponentialRampToValueAtTime(Math.max(o.endFreq, 1), o.at + o.duration);
  }
  band.Q.value = o.q ?? 1;

  amp.gain.setValueAtTime(o.gain, o.at);
  amp.gain.exponentialRampToValueAtTime(0.0001, o.at + o.duration);

  src.connect(band);
  band.connect(amp);
  amp.connect(v.dest);
  src.start(o.at, offset, o.duration + 0.02);
  src.stop(o.at + o.duration + 0.02);
}

/** Plays several tones together — used for the landing chords. */
export function chord(
  v: Voice,
  at: number,
  freqs: number[],
  o: { duration: number; gain: number; type?: OscillatorType; stagger?: number },
): void {
  freqs.forEach((freq, i) => {
    tone(v, {
      at: at + i * (o.stagger ?? 0),
      freq,
      duration: o.duration,
      // Upper partials quieter, or the chord turns shrill.
      gain: o.gain / (1 + i * 0.6),
      type: o.type,
    });
  });
}

interface StrikeOptions {
  at: number;
  /** Fundamental of the struck body. */
  freq: number;
  /**
   * Partials as ratios of `freq`. Deliberately inharmonic — a struck bar or
   * peg rings at ratios that are not whole numbers, and that inharmonicity is
   * most of what separates "wooden object" from "musical note".
   */
  ratios?: number[];
  /** Seconds for the fundamental to die. Upper partials die faster, as they do. */
  decay: number;
  gain: number;
  /** Contact noise level, as a fraction of gain. The sound of the hit itself. */
  click?: number;
  /** Highpass corner for that contact noise. */
  clickFreq?: number;
  /** Random pitch spread per strike, as a fraction of freq. */
  detune?: number;
}

/**
 * A struck body: a contact transient exciting several damped resonant modes.
 *
 * This is the piece the earlier passes were missing. A bandpassed noise burst
 * plus a sine is an *impulse* with no body behind it, which is why it read as
 * electrical rather than physical. Real objects ring, briefly and
 * inharmonically, and that ring is what the ear identifies as material.
 *
 * `detune` matters more than it looks: 126 bit-identical ticks in a row is the
 * machine-gun effect, and a few percent of scatter per strike is the
 * difference between a mechanism and a loop.
 */
export function strike(v: Voice, o: StrikeOptions): void {
  const ratios = o.ratios ?? [1, 2.71, 5.13];
  const spread = 1 + (Math.random() - 0.5) * 2 * (o.detune ?? 0);
  // Amplitude scatter, not just pitch. Measured against the noise-based ticks
  // this replaced, pitch detune alone actually *reduced* variation between
  // clicks — peak level is what the ear reads as "each hit is its own".
  const level = 0.55 + Math.random() * 0.75;

  ratios.forEach((ratio, i) => {
    tone(v, {
      at: o.at,
      freq: o.freq * ratio * spread,
      // Higher modes shed energy faster, which is what makes a decay sound
      // like an object settling rather than a filter closing.
      duration: Math.max(o.decay / (1 + i * 1.6), 0.006),
      gain: (o.gain * level) / (1 + i * 1.9),
      type: 'sine',
      attack: 0.0008,
    });
  });

  if (o.click !== undefined && o.click > 0) {
    noise(v, {
      at: o.at,
      duration: 0.0035,
      gain: o.gain * o.click * level,
      freq: o.clickFreq ?? 3500,
      filter: 'highpass',
    });
  }
}

interface SampleOptions {
  at: number;
  buffer: AudioBuffer;
  gain: number;
  /**
   * Playback rate. Small per-hit variation is why a handful of recordings can
   * cover hundreds of clicks without the repetition becoming audible — it
   * shifts pitch and length together, exactly as a lighter or harder hit does.
   */
  rate?: number;
  /** Seconds into the buffer to start. */
  offset?: number;
  /** Trims the tail so a long recording can be used for a short tick. */
  duration?: number;
}

/** Play a recorded sound. The counterpart to strike(), for sample packs. */
export function sample(v: Voice, o: SampleOptions): void {
  const src = v.ctx.createBufferSource();
  const amp = v.ctx.createGain();

  src.buffer = o.buffer;
  src.playbackRate.value = o.rate ?? 1;

  amp.gain.value = o.gain;
  src.connect(amp);
  amp.connect(v.dest);

  if (o.duration !== undefined) {
    // Fade rather than cut: stopping a waveform mid-cycle is itself a click.
    const end = o.at + o.duration;
    amp.gain.setValueAtTime(o.gain, Math.max(end - 0.012, o.at));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    src.start(o.at, o.offset ?? 0, o.duration + 0.02);
    src.stop(end + 0.02);
  } else {
    src.start(o.at, o.offset ?? 0);
  }
}
