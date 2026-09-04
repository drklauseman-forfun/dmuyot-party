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
  // Start somewhere random in the buffer so repeated ticks aren't bit-identical.
  const offset = Math.random() * Math.max(v.noise.duration - o.duration - 0.01, 0);

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
