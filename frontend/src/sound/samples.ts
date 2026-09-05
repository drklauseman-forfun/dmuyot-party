import type { SoundPack, Voice } from './types';
import { sample } from './voices';

/**
 * Sound packs built from recordings rather than synthesis.
 *
 * Files live in `public/sounds/<pack id>/` and are fetched at runtime, not
 * bundled — they stay out of the JS payload and the browser caches them
 * normally. See `public/sounds/README.md` for what each pack expects.
 *
 * Several tick recordings per pack is the whole point. Picking between them
 * per click, with a little rate variation on top, is how a handful of files
 * cover hundreds of ticks without the repetition becoming obvious. That
 * variation is the thing synthesis kept having to fake.
 */

export interface SamplePackSpec {
  id: string;
  label: string;
  description: string;
  /** Filenames within `public/sounds/<id>/`. Two or more is strongly preferred. */
  tickFiles: string[];
  landFile: string;
  /** Overall level for the pack, applied on top of per-hit variation. */
  gain?: number;
  /** Per-hit playback-rate spread, as a fraction. */
  rateSpread?: number;
  /** A tick longer than this is trimmed, so a roomy recording still ticks fast. */
  maxTickSeconds?: number;
}

export const SAMPLE_PACK_SPECS: SamplePackSpec[] = [
  {
    id: 'wheel',
    label: 'Wheel',
    description: 'A real prize wheel, recorded. Metallic and mechanical.',
    // Six clicks lifted from across one recording of a wheel slowing down, so
    // they carry the differences the real pegs had.
    tickFiles: [
      'tick-1.wav',
      'tick-2.wav',
      'tick-3.wav',
      'tick-4.wav',
      'tick-5.wav',
      'tick-6.wav',
    ],
    landFile: 'land.wav',
    gain: 0.9,
    rateSpread: 0.07,
    // The source clicks run about 60ms, and at full speed the engine fires one
    // every 16ms. Trimming keeps the overlap to a ratchet buzz rather than a
    // smear, without shortening the slow clicks at the end of a spin.
    maxTickSeconds: 0.055,
  },
];

interface LoadedPack {
  ticks: AudioBuffer[];
  land: AudioBuffer | null;
}

const loaded = new Map<string, LoadedPack>();
const inFlight = new Map<string, Promise<void>>();

function urlFor(packId: string, file: string): string {
  return `${import.meta.env.BASE_URL}sounds/${packId}/${file}`;
}

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    // A missing or unreadable file means this pack simply stays silent. The
    // app must not fall over because an optional asset was never added.
    return null;
  }
}

/**
 * Fetch and decode a pack's files. Safe to call repeatedly — concurrent calls
 * share one load, and a completed load is not repeated.
 */
export function preloadSamplePack(ctx: BaseAudioContext, spec: SamplePackSpec): Promise<void> {
  if (loaded.has(spec.id)) return Promise.resolve();

  const existing = inFlight.get(spec.id);
  if (existing) return existing;

  const load = (async () => {
    const [ticks, land] = await Promise.all([
      Promise.all(spec.tickFiles.map((file) => decode(ctx, urlFor(spec.id, file)))),
      decode(ctx, urlFor(spec.id, spec.landFile)),
    ]);
    loaded.set(spec.id, {
      ticks: ticks.filter((buffer): buffer is AudioBuffer => buffer !== null),
      land,
    });
  })().finally(() => {
    inFlight.delete(spec.id);
  });

  inFlight.set(spec.id, load);
  return load;
}

/** Whether a pack has any usable audio. False before loading, or if files are absent. */
export function isSamplePackReady(id: string): boolean {
  const pack = loaded.get(id);
  return Boolean(pack && (pack.ticks.length > 0 || pack.land));
}

/** True once a load finished, whether or not it found anything. */
export function isSamplePackLoaded(id: string): boolean {
  return loaded.has(id);
}

function playTick(spec: SamplePackSpec, voice: Voice, at: number): void {
  const pack = loaded.get(spec.id);
  if (!pack || pack.ticks.length === 0) return;

  const buffer = pack.ticks[Math.floor(Math.random() * pack.ticks.length)];
  const spread = spec.rateSpread ?? 0.06;

  sample(voice, {
    at,
    buffer,
    gain: (spec.gain ?? 1) * (0.72 + Math.random() * 0.5),
    rate: 1 + (Math.random() - 0.5) * 2 * spread,
    duration: spec.maxTickSeconds,
  });
}

/** Turn a spec into a SoundPack the rest of the engine can treat like any other. */
export function toSoundPack(spec: SamplePackSpec): SoundPack {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    tick(voice, at) {
      playTick(spec, voice, at);
    },
    land(voice, at) {
      const pack = loaded.get(spec.id);
      if (!pack?.land) return;
      sample(voice, { at, buffer: pack.land, gain: spec.gain ?? 1 });
    },
  };
}

export const SAMPLE_PACKS: SoundPack[] = SAMPLE_PACK_SPECS.map(toSoundPack);
