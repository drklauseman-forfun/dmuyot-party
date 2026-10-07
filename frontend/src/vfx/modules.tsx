import type { ReactElement } from 'react';
import VFXGlow from './components/VFXGlow';
import VFXSparkles from './components/VFXSparkles';
import VFXFire from './components/VFXFire';
import SubtleTopBeams from './components/SubtleTopBeams';
import VFXEdgeGlow from './components/VFXEdgeGlow';
import VFXBlackHole from './components/VFXBlackHole';
import VFXSun from './components/VFXSun';
import VFXClock from './components/VFXClock';
import VFXFireworks from './components/VFXFireworks';
import VFXWings from './components/VFXWings';
import VFXEyes from './components/VFXEyes';
import VFXSlashes from './components/VFXSlashes';
import VFXGlitch from './components/VFXGlitch';
import VFXTimepieces from './components/VFXTimepieces';
import VFXWeapons from './components/VFXWeapons';
import VFXCreatures from './components/VFXCreatures';
import VFXCurtain from './components/VFXCurtain';
import VFXCandles from './components/VFXCandles';
import VFXHands from './components/VFXHands';
import VFXFigure from './components/VFXFigure';
import VFXWords from './components/VFXWords';
import VFXMemes from './components/VFXMemes';
import type { VFXModuleConfig, VFXModuleType } from './types';

/**
 * Every VFX module, in one place.
 *
 * Adding one means: write the component, add its parameters to
 * VFXModuleConfig, and add a line here. Nothing else — the canvas renders
 * whatever this map contains, and leaving the line out is a compile error
 * rather than a module that silently never appears.
 *
 * The same idea as characters/registry.ts and sound/packs.ts: the list is the
 * feature.
 */

/** Supplied at playback, not authored in a character's effect. */
export interface VFXRuntime {
  /** False once the effect is winding down; modules fade themselves out. */
  active: boolean;
  /**
   * Differs per run and per module, so a repeated effect is not laid out
   * identically. Modules with nothing random about them ignore it.
   */
  seed: number;
}

/**
 * Modules drawn after the bloom instead of through it: solid, realistic ones
 * that must not glow. Bloom lit up the whole screen around white feathers, and
 * put a halo round the whites of the eyes. See EffectScene in EffectCanvas.tsx.
 */
export const UNLIT_MODULES: ReadonlySet<VFXModuleType> = new Set<VFXModuleType>([
  'wings',
  'eyes',
  'words',
  'memes',
  'timepieces',
  'hands',
  'figure',
  'weapons',
  'curtain',
  'candles',
]);

/** A module's own parameters, without the discriminant used to select it. */
type ParamsOf<K extends VFXModuleType> = Omit<Extract<VFXModuleConfig, { type: K }>, 'type'>;

function paramsOf<T extends { type: VFXModuleType }>({ type, ...params }: T): Omit<T, 'type'> {
  void type; // the discriminant selects the renderer; it is not a component prop
  return params;
}

type ModuleRenderers = {
  [K in VFXModuleType]: (params: ParamsOf<K>, runtime: VFXRuntime) => ReactElement;
};

/**
 * Parameters are spread rather than forwarded one by one. Listing them by hand
 * meant a parameter could be added to a module and quietly never reach the
 * component; spreading makes that impossible.
 */
const RENDERERS: ModuleRenderers = {
  glow: (params, { active }) => <VFXGlow {...params} active={active} />,
  sparkles: (params, { active, seed }) => <VFXSparkles {...params} active={active} seed={seed} />,
  fire: (params, { active }) => <VFXFire {...params} active={active} />,
  beams: (params, { active }) => <SubtleTopBeams {...params} active={active} />,
  edgeGlow: (params, { active }) => <VFXEdgeGlow {...params} active={active} />,
  blackHole: (params, { active }) => <VFXBlackHole {...params} active={active} />,
  sun: (params, { active }) => <VFXSun {...params} active={active} />,
  clock: (params, { active }) => <VFXClock {...params} active={active} />,
  fireworks: (params, { active, seed }) => <VFXFireworks {...params} active={active} seed={seed} />,
  wings: (params, { active }) => <VFXWings {...params} active={active} />,
  eyes: (params, { active, seed }) => <VFXEyes {...params} active={active} seed={seed} />,
  slashes: (params, { active, seed }) => <VFXSlashes {...params} active={active} seed={seed} />,
  glitch: (params, { active }) => <VFXGlitch {...params} active={active} />,
  timepieces: (params, { active }) => <VFXTimepieces {...params} active={active} />,
  weapons: (params, { active, seed }) => <VFXWeapons {...params} active={active} seed={seed} />,
  creatures: (params, { active, seed }) => <VFXCreatures {...params} active={active} seed={seed} />,
  curtain: (params, { active }) => <VFXCurtain {...params} active={active} />,
  candles: (params, { active, seed }) => <VFXCandles {...params} active={active} seed={seed} />,
  hands: (params, { active, seed }) => <VFXHands {...params} active={active} seed={seed} />,
  figure: (params, { active }) => <VFXFigure {...params} active={active} />,
  words: (params, { active, seed }) => <VFXWords {...params} active={active} seed={seed} />,
  memes: (params, { active, seed }) => <VFXMemes {...params} active={active} seed={seed} />,
};

/**
 * Render one authored module.
 *
 * The cast is unavoidable and contained: TypeScript will not narrow a lookup
 * keyed by a discriminant, even though every entry in RENDERERS is individually
 * type-checked against its own module's parameters above.
 */
export function renderVFXModule(module: VFXModuleConfig, runtime: VFXRuntime): ReactElement {
  const render = RENDERERS[module.type] as (
    params: Omit<VFXModuleConfig, 'type'>,
    runtime: VFXRuntime,
  ) => ReactElement;
  return render(paramsOf(module), runtime);
}
