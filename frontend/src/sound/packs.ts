import type { SoundPack } from './types';
import { chord, noise, tone } from './voices';

/**
 * Every selectable spin sound.
 *
 * To add one: append an entry here. Settings builds its picker from this list
 * and the stored preference is validated against it, so nothing else changes.
 * The same idea as characters/registry.ts — the data is the feature.
 *
 * The first entry is the default for anyone who has never chosen.
 */
export const SOUND_PACKS: SoundPack[] = [
  {
    id: 'ratchet',
    label: 'Ratchet',
    description: 'A real wheel’s flapper. Dry wooden clicks, bright landing.',
    tick(v, at, progress) {
      // Lowpassed, not a bright band: the earlier version put all its energy
      // above 1.5 kHz, which reads as electrical arcing rather than as wood.
      noise(v, {
        at,
        duration: 0.014,
        gain: 0.26 + progress * 0.12,
        freq: 2200 + progress * 600,
        filter: 'lowpass',
        q: 0.9,
      });
      // The weight of the peg. Loud enough to be the body of the click rather
      // than a hint under it, and pitched low enough to feel like mass.
      tone(v, {
        at,
        freq: 210 + progress * 60,
        endFreq: 95,
        duration: 0.015,
        gain: 0.42,
        type: 'triangle',
      });
    },
    land(v, at) {
      noise(v, { at, duration: 0.09, gain: 0.15, freq: 1400, endFreq: 400, filter: 'lowpass' });
      tone(v, { at, freq: 190, endFreq: 80, duration: 0.22, gain: 0.20, type: 'triangle' });
      chord(v, at + 0.012, [587.33, 880, 1174.66], {
        duration: 0.8,
        gain: 0.17,
        type: 'triangle',
        stagger: 0.014,
      });
    },
  },

  {
    id: 'arcade',
    label: 'Arcade',
    description: 'Chiptune blips climbing to a little fanfare.',
    tick(v, at, progress) {
      tone(v, {
        at,
        freq: 380 + progress * progress * 760,
        duration: 0.022,
        gain: 0.20,
        type: 'square',
      });
    },
    land(v, at) {
      // A quick run *into* a held chord. The run alone just stopped — four
      // separate blips in a row read as the spin timing out, not resolving.
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        tone(v, { at: at + i * 0.06, freq, duration: 0.075, gain: 0.26, type: 'square' });
      });
      chord(v, at + 0.18, [523.25, 659.25, 783.99, 1046.5], {
        duration: 0.55,
        gain: 0.26,
        type: 'square',
      });
    },
  },

  {
    id: 'chime',
    label: 'Chime',
    description: 'Soft mallet taps and a warm bell. The quiet one.',
    // No noise transient here on purpose. Adding one to "sharpen" the tap
    // buried the rhythm in wash and cost this pack the thing it is for.
    tick(v, at, progress) {
      // An octave down from the first attempt: 126 pure sine pings up at
      // 900–1400 Hz is a hearing test, not a wheel.
      tone(v, {
        at,
        freq: 450 + progress * 250,
        endFreq: 300,
        duration: 0.04,
        gain: 0.13,
        type: 'sine',
      });
    },
    land(v, at) {
      // A major ninth, spread — pretty rather than triumphant.
      chord(v, at, [523.25, 783.99, 1174.66], {
        duration: 1.6,
        gain: 0.36,
        type: 'sine',
        stagger: 0.05,
      });
    },
  },

  {
    id: 'drum',
    label: 'Drum',
    description: 'Rolling toms into a deep hit. Heavier, more tension.',
    tick(v, at, progress) {
      // A membrane: pitch collapses immediately, which is what makes a drum
      // read as struck rather than as a low note.
      tone(v, {
        at,
        freq: 190 - progress * 60,
        endFreq: 55,
        duration: 0.075,
        gain: 0.26,
        type: 'sine',
      });
      // Kept deliberately dull and quiet. A highpassed spike here defines the
      // transient on paper and rings like a broken spring in practice; even
      // nudging this brighter or louder brought back an audible wash.
      noise(v, { at, duration: 0.02, gain: 0.08, freq: 2400, q: 0.8 });
    },
    land(v, at) {
      tone(v, { at, freq: 150, endFreq: 42, duration: 0.7, gain: 0.44, type: 'sine' });
      // Long, bright, slowly-opening noise for the cymbal.
      noise(v, { at, duration: 1.3, gain: 0.17, freq: 5200, endFreq: 2600, q: 0.6 });
    },
  },
];

export const DEFAULT_SOUND_PACK_ID = SOUND_PACKS[0].id;

export function getSoundPack(id: string | null | undefined): SoundPack {
  return SOUND_PACKS.find((pack) => pack.id === id) ?? SOUND_PACKS[0];
}

/** A stored preference is only honoured if a pack still answers to it. */
export function isKnownSoundPackId(id: string): boolean {
  return SOUND_PACKS.some((pack) => pack.id === id);
}
