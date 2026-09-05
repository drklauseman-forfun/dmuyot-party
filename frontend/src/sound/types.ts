/** Everything a pack needs to render a sound into the graph. */
export interface Voice {
  ctx: AudioContext;
  /** Where a pack connects its output. Already gain-staged. */
  dest: AudioNode;
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
  /** One slice passing the pointer. */
  tick(voice: Voice, at: number): void;
  /** The result landing. Plays on instant spins too, where there are no ticks. */
  land(voice: Voice, at: number): void;
}
