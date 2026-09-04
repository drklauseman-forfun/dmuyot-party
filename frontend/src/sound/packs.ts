import type { SoundPack } from './types';
import { chord, noise, strike, tone } from './voices';
import { GEMINI_PACKS } from './geminiPacks';

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
    description: 'A flapper over wooden pegs. Dry, mechanical, physical.',
    tick(v, at, progress) {
      // A struck peg, not a filtered noise burst. The body rings for ~35ms at
      // inharmonic ratios, which is what reads as wood rather than as a beep.
      strike(v, {
        at,
        freq: 780 - progress * 90,
        ratios: [1, 2.64, 4.87],
        decay: 0.035,
        gain: 0.30 + progress * 0.10,
        click: 0.55,
        clickFreq: 2800,
        // Each peg sits slightly differently. Without this, 126 identical
        // ticks in a row sound like a loop rather than a mechanism.
        detune: 0.05,
      });
    },
    /**
     * The mechanism itself: axle rumble and the air the wheel is moving,
     * loudest while it is fast and gone by the time it stops.
     *
     * Without this the clicks happen in a vacuum — there is nothing between
     * them, so the ear hears isolated events rather than one turning object.
     */
    bed(v, at, durationSeconds) {
      noise(v, { at, duration: durationSeconds * 0.85, gain: 0.10, freq: 260, filter: 'lowpass' });
      noise(v, { at, duration: durationSeconds * 0.7, gain: 0.035, freq: 1600, endFreq: 700, q: 0.7 });
    },
    land(v, at) {
      // A flapper does not stop dead — it settles over shrinking bounces that
      // crowd together as they die. That settle is the wheel actually arriving,
      // and it is the last thing the ear hears, so it carries the tail.
      [0, 0.075, 0.135, 0.18, 0.213, 0.236].forEach((offset, i) => {
        strike(v, {
          at: at + offset,
          freq: 720 - i * 32,
          ratios: [1, 2.64, 4.87],
          decay: 0.075,
          gain: 0.36 / (1 + i * 0.85),
          click: 0.45,
          clickFreq: 2600,
          detune: 0.03,
        });
      });
      // Warmth underneath, held long enough to ring out with the room.
      tone(v, { at, freq: 150, endFreq: 68, duration: 0.75, gain: 0.24, type: 'triangle' });
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
    description: 'Struck glass over a soft bell. The gentle one.',
    // No noise transient here on purpose. Adding one to "sharpen" the tap
    // buried the rhythm in wash and cost this pack the thing it is for.
    tick(v, at, progress) {
      // Glass rings far longer and much more inharmonically than wood.
      strike(v, {
        at,
        freq: 1180 - progress * 260,
        ratios: [1, 3.41, 6.72],
        decay: 0.10,
        gain: 0.15,
        click: 0.12,
        clickFreq: 6000,
        detune: 0.04,
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

/**
 * The picker's sections, in order.
 *
 * Two authors are on offer while it is being decided which set ships. Settings
 * renders straight from this, so dropping a section is deleting an entry here.
 */
export const SOUND_PACK_GROUPS: { title: string; note: string; packs: SoundPack[] }[] = [
  {
    title: 'Hand-written',
    note: 'Tuned by ear-less iteration, then against listening feedback.',
    packs: SOUND_PACKS,
  },
  {
    title: 'Gemini',
    note: 'Written by Gemini from the same primitives, unedited.',
    packs: GEMINI_PACKS,
  },
];

const ALL_PACKS: SoundPack[] = SOUND_PACK_GROUPS.flatMap((group) => group.packs);

export const DEFAULT_SOUND_PACK_ID = SOUND_PACKS[0].id;

export function getSoundPack(id: string | null | undefined): SoundPack {
  return ALL_PACKS.find((pack) => pack.id === id) ?? SOUND_PACKS[0];
}

/** A stored preference is only honoured if a pack still answers to it. */
export function isKnownSoundPackId(id: string): boolean {
  return ALL_PACKS.some((pack) => pack.id === id);
}
