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
      // Rises in pitch and tightens as the wheel slows, so late clicks read as
      // deliberate rather than as more of the early blur.
      noise(v, {
        at,
        duration: 0.028,
        gain: 0.30 + progress * 0.20,
        freq: 1500 + progress * 900,
        q: 3 + progress * 5,
      });
      // A touch of body under the click stops it sounding like static.
      tone(v, {
        at,
        freq: 320 + progress * 120,
        endFreq: 160,
        duration: 0.02,
        gain: 0.11,
        type: 'triangle',
      });
    },
    land(v, at) {
      noise(v, { at, duration: 0.12, gain: 0.34, freq: 900, endFreq: 300, q: 1.2 });
      chord(v, at + 0.01, [880, 1320, 1760], {
        duration: 0.9,
        gain: 0.40,
        type: 'triangle',
        stagger: 0.012,
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
      // Ascending major arpeggio — the standard "you got it" cadence.
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(v, {
          at: at + i * 0.075,
          freq,
          duration: i === 3 ? 0.42 : 0.1,
          gain: 0.30,
          type: 'square',
        });
      });
    },
  },

  {
    id: 'chime',
    label: 'Chime',
    description: 'Soft mallet taps and a warm bell. The quiet one.',
    tick(v, at, progress) {
      tone(v, {
        at,
        freq: 900 + progress * 500,
        endFreq: 600,
        duration: 0.05,
        gain: 0.12,
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
