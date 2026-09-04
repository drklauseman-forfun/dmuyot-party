/** Everything a pack needs to render a sound into the graph. */
export interface Voice {
  ctx: AudioContext;
  /** Where a pack connects its output. Already gain-staged. */
  dest: AudioNode;
  /** Shared white-noise buffer — packs read it, never write to it. */
  noise: AudioBuffer;
}

/**
 * One selectable sound.
 *
 * Both methods schedule against `at`, an absolute AudioContext time, rather
 * than playing immediately. The whole spin is scheduled up front so the ticks
 * land on the audio clock instead of drifting with setTimeout and the main
 * thread.
 */
export interface SoundPack {
  id: string;
  label: string;
  /** Shown under the label in Settings. */
  description: string;
  /**
   * One slice passing the pointer.
   *
   * `progress` runs 0→1 across the spin, so a pack can shift its character as
   * the wheel slows — the ticks are dense and blurred early on and separate
   * into individual clicks by the end.
   */
  tick(voice: Voice, at: number, progress: number): void;
  /** The result landing. Plays on instant spins too, where there are no ticks. */
  land(voice: Voice, at: number): void;
  /**
   * Optional continuous layer under the whole spin — the sound of the
   * mechanism itself rather than of any one click. Scheduled once, covering
   * `durationSeconds` from `at`.
   */
  bed?(voice: Voice, at: number, durationSeconds: number): void;
}
