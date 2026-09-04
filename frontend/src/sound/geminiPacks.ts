import type { SoundPack } from './types';
import { chord, noise, tone } from './voices';

/**
 * Sound packs authored by Gemini, verbatim.
 *
 * Kept exactly as it wrote them so a comparison against the hand-written packs
 * in packs.ts is a fair one. Do not tune these in place — if a change is
 * wanted, it belongs in whichever set actually ships.
 */
export const GEMINI_PACKS: SoundPack[] = [
  {
    id: 'g-ratchet',
    label: 'Ratchet',
    description: 'Mechanical clicks with a plastic flapper.',
    tick(voice, at, progress) {
      // Impulse: High-passed noise snap + band-passed body rattle
      noise(voice, { at, duration: 0.005, gain: 0.15, freq: 5000, filter: 'highpass' });
      noise(voice, { at: at + 0.001, duration: 0.012, gain: 0.1, freq: 1200, q: 2, filter: 'bandpass' });
      // Flapper resonance: Short triangle drop
      tone(voice, {
        at,
        freq: 450 - (progress * 150),
        duration: 0.02,
        gain: 0.08,
        type: 'triangle',
        attack: 0.001
      });
    },
    land(voice, at) {
      tone(voice, { at, freq: 180, endFreq: 60, duration: 0.15, gain: 0.3, type: 'sine' });
      noise(voice, { at, duration: 0.1, gain: 0.15, freq: 800, filter: 'lowpass' });
    }
  },
  {
    id: 'g-arcade',
    label: 'Arcade',
    description: 'Retro 8-bit blips that pitch up as the wheel slows.',
    tick(voice, at, progress) {
      // Tonal blip: Square wave increases in pitch as progress 0 -> 1
      tone(voice, {
        at,
        freq: 350 + (progress * 900),
        duration: 0.035,
        gain: 0.1,
        type: 'square',
        attack: 0.002
      });
      // Logic switch click
      noise(voice, { at, duration: 0.008, gain: 0.04, freq: 8000, filter: 'highpass' });
    },
    land(voice, at) {
      chord(voice, at, [523.25, 659.25, 783.99, 1046.50], {
        duration: 0.5,
        gain: 0.2,
        type: 'square',
        stagger: 0.05
      });
    }
  },
  {
    id: 'g-chime',
    label: 'Chime',
    description: 'Crystal tones that resonate across the spin.',
    tick(voice, at, progress) {
      // Glass impact: High sine with exponential fall
      tone(voice, {
        at,
        freq: 2400 - (progress * 1200),
        duration: 0.08,
        gain: 0.07,
        type: 'sine',
        attack: 0.005
      });
      // High-frequency "ping" noise
      noise(voice, { at, duration: 0.015, gain: 0.02, freq: 11000, filter: 'highpass' });
    },
    land(voice, at) {
      chord(voice, at, [587.33, 739.99, 880, 1174.66], {
        duration: 1.0,
        gain: 0.15,
        type: 'sine',
        stagger: 0.02
      });
    }
  },
  {
    id: 'g-drum',
    label: 'Drum',
    description: 'Deep percussive hits for a heavy, tactile feel.',
    // Signature trimmed to the parameters it uses; the audio is untouched.
    // Worth noting this tick ignores `progress`, so unlike the other three it
    // sounds identical at the start of the spin and at the end.
    tick(voice, at) {
      // Kick impulse: Fast sine sweep 150Hz -> 40Hz
      tone(voice, {
        at,
        freq: 150,
        endFreq: 40,
        duration: 0.03,
        gain: 0.2,
        type: 'sine',
        attack: 0.001
      });
      // Stick impact noise centered at 3kHz
      noise(voice, { at, duration: 0.01, gain: 0.12, freq: 3000, q: 0.5, filter: 'bandpass' });
    },
    land(voice, at) {
      // Sub impact with low-pass noise body
      tone(voice, { at, freq: 100, endFreq: 30, duration: 0.25, gain: 0.5, type: 'sine' });
      noise(voice, { at, duration: 0.2, gain: 0.2, freq: 500, filter: 'lowpass' });
    }
  }
];
