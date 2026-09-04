/** Shapes shared between App and the presentational components. */

export interface CharacterData {
  name: string;
  color: string;
  /**
   * Position in the extracted document, and the app's notion of identity.
   * Weights, include-ranges and history all key off it; the UI shows it 1-based.
   */
  originalIndex: number;
}

export interface Winner {
  name: string;
  /** originalIndex of the winning character, or -1 for VOID. */
  index: number;
  color: string;
}

export interface HistoryEntry {
  name: string;
  index: number;
  timestamp: string;
}

/** Keyed by originalIndex. A string value is an in-progress edit of the field. */
export type WeightMap = Record<number, number | string>;
