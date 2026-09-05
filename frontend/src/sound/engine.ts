import { timeAtProgress } from '../spinCurve';
import { getSoundPack } from './packs';
import { SAMPLE_PACK_SPECS, preloadSamplePack } from './samples';
import type { Voice } from './types';

/**
 * Playback for the spin sounds.
 *
 * The whole spin is scheduled up front against the AudioContext clock. Firing
 * ticks from setTimeout would put every one of them at the mercy of the main
 * thread, which during a spin is also running React and, on an effect spin,
 * three.js — exactly when the timing needs to be tight.
 */

let context: AudioContext | null = null;
let output: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Scheduling lead, so the first tick is never already in the past. */
const LEAD_SECONDS = 0.02;

/** Beyond this the clicks stop reading as separate events and just cost nodes. */
const MAX_TICKS_PER_SECOND = 60;
const MAX_TICKS = 200;

/** CustomWheel spins 10 whole turns plus up to one more to reach the target. */
const APPROXIMATE_TURNS = 10.5;

type AudioContextCtor = typeof AudioContext;

/**
 * Build the output chain and return the node packs should connect to.
 *
 * Exported so an offline render can reproduce exactly what the app plays. It
 * used to be rebuilt by hand wherever a render was needed, which meant the
 * files being judged were not quite the files being shipped.
 */
export function buildOutputChain(ctx: BaseAudioContext, destination: AudioNode): AudioNode {
  const bus = ctx.createGain();

  // A limiter across everything: a dense spin can overlap dozens of ticks with
  // the landing, which without this clips audibly.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;

  // A small room. Every earlier version was bone dry, which is most of why
  // they sounded synthetic — a real wheel is an object somewhere, and even a
  // little early reflection is the difference between a sample and a beep.
  const room = ctx.createConvolver();
  room.buffer = buildRoomImpulse(ctx, 0.9, 2.6);

  const wet = ctx.createGain();
  wet.gain.value = 0.30;
  const dry = ctx.createGain();
  dry.gain.value = 0.92;

  bus.connect(dry).connect(limiter);
  bus.connect(room).connect(wet).connect(limiter);

  const master = ctx.createGain();
  master.gain.value = 1.0;
  limiter.connect(master);
  master.connect(destination);

  return bus;
}

/** Exponentially decaying noise — a plausible small room, built not sampled. */
function buildRoomImpulse(ctx: BaseAudioContext, seconds: number, falloff: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, falloff);
    }
  }
  return buffer;
}

function getVoice(): Voice | null {
  if (typeof window === 'undefined') return null;

  if (!context) {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;

    try {
      context = new Ctor();
    } catch {
      // Audio unavailable. Silence is an acceptable outcome; a crash is not.
      return null;
    }

    output = buildOutputChain(context, context.destination);
  }

  // Browsers start the context suspended until a gesture. Every entry point
  // here is inside a click handler, so this is the moment it can be resumed.
  if (context.state === 'suspended') void context.resume();

  if (!noiseBuffer || noiseBuffer.sampleRate !== context.sampleRate) {
    const length = Math.floor(context.sampleRate * 0.4);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  return { ctx: context, dest: output!, noise: noiseBuffer };
}

function tickCountFor(durationSeconds: number, sliceCount: number): number {
  const onePerSlice = Math.round(APPROXIMATE_TURNS * Math.max(sliceCount, 1));
  const audible = Math.round(durationSeconds * MAX_TICKS_PER_SECOND);
  return Math.max(6, Math.min(onePerSlice, audible, MAX_TICKS));
}

/**
 * Schedule a full spin: ticks tracking the wheel's deceleration, then the
 * landing at the moment it stops.
 */
export function playSpin(packId: string, durationSeconds: number, sliceCount: number): void {
  const voice = getVoice();
  if (!voice) return;

  const pack = getSoundPack(packId);
  const start = voice.ctx.currentTime + LEAD_SECONDS;
  const ticks = tickCountFor(durationSeconds, sliceCount);

  // The chassis under the clicks — axle rumble and air. Optional, because only
  // the packs going for physical realism want it.
  pack.bed?.(voice, start, durationSeconds);

  for (let i = 1; i <= ticks; i++) {
    const progress = i / ticks;
    pack.tick(voice, start + durationSeconds * timeAtProgress(progress), progress);
  }

  pack.land(voice, start + durationSeconds);
}

/** Just the landing — for spins that resolve instantly and have no wheel. */
export function playLanding(packId: string): void {
  const voice = getVoice();
  if (!voice) return;
  getSoundPack(packId).land(voice, voice.ctx.currentTime + LEAD_SECONDS);
}

/**
 * Fetch and decode every sample pack.
 *
 * Called once the user has interacted, because creating the AudioContext
 * before a gesture leaves it suspended. Missing files resolve quietly — a pack
 * with nothing behind it simply plays nothing.
 */
export function preloadSamples(): Promise<void> {
  const voice = getVoice();
  if (!voice) return Promise.resolve();
  return Promise.all(
    SAMPLE_PACK_SPECS.map((spec) => preloadSamplePack(voice.ctx, spec)),
  ).then(() => undefined);
}

/**
 * A short spin for auditioning a pack in Settings. Deliberately a spin rather
 * than a lone landing — the ticks are most of a pack's character.
 */
export function playPreview(packId: string): Promise<void> {
  // Recorded packs cannot play until their files are decoded. For synthesised
  // ones, and for recorded ones already loaded, this resolves immediately.
  return preloadSamples().then(() => playSpin(packId, 1.1, 6));
}
