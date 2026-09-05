import type { Voice } from './types';

/**
 * Playback primitives.
 *
 * Only sample playback remains. The synthesis helpers that used to live here —
 * oscillator tones, filtered noise, chords, modal strikes — went with the
 * synthesised packs they existed for.
 */

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

/** Play a recorded sound at an absolute AudioContext time. */
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
