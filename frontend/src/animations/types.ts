import type { VFXModuleConfig } from '../vfx/types';
import type { PresentationInput } from './presentation';

/**
 * An animation someone built themselves: the effects that play when one
 * particular character wins, and how the results look.
 *
 * It is stored under a username rather than carrying one, so the same record
 * works whether it lives in this browser or, later, on a server.
 */
export interface CustomAnimation {
  /**
   * Stable across edits, so saving an animation you reopened replaces it
   * rather than adding a copy beside it.
   */
  id: string;
  /** The character's name exactly as the loaded list has it, source included. */
  character: string;
  modules: VFXModuleConfig[];
  presentation: PresentationInput;
  /** Milliseconds since the epoch. Orders the list, newest first. */
  updatedAt: number;
}

/** Every username's animations, keyed by the normalised username. */
export type AnimationLibrary = Record<string, CustomAnimation[]>;
