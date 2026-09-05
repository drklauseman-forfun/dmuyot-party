import type { SoundPack } from './types';
import { SAMPLE_PACKS } from './samples';

/**
 * Every selectable spin sound.
 *
 * All of them are recordings. Three rounds of synthesised packs were built and
 * rejected before this — they are in the history if anyone wants to see why,
 * but nothing here calls them any more.
 *
 * To add one: put the audio in `public/sounds/<id>/` and append a spec to
 * SAMPLE_PACK_SPECS in samples.ts. Settings, persistence and preloading all
 * read from that list.
 */
export const SOUND_PACKS: SoundPack[] = SAMPLE_PACKS;

export const DEFAULT_SOUND_PACK_ID = SOUND_PACKS[0].id;

export function getSoundPack(id: string | null | undefined): SoundPack {
  return SOUND_PACKS.find((pack) => pack.id === id) ?? SOUND_PACKS[0];
}

/** A stored preference is only honoured if a pack still answers to it. */
export function isKnownSoundPackId(id: string): boolean {
  return SOUND_PACKS.some((pack) => pack.id === id);
}
