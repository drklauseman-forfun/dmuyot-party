import type { ClockHand } from './types';

/**
 * Descriptions of a single adjustable value, and how to make an untrusted one
 * safe.
 *
 * Nothing here knows about any particular effect. `vfx/schema.ts` uses these
 * to describe the effects' parameters, and `animations/presentation.ts` to
 * describe how the results modal can be styled — so a colour is checked the
 * same way wherever one appears.
 *
 * Sanitising is what stands between a saved animation and the phone that
 * plays it. Anyone can save one, so every value has to come out present, of
 * the right kind, and in range, whatever went in.
 */

interface BaseSpec {
  /** Short name shown beside the field. */
  label: string;
  /** What it does and how to fill it, in plain words. Shown with the field. */
  guide: string;
}

export interface NumberSpec extends BaseSpec {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  /** Granularity of the input control. Saved values are not snapped to it. */
  step: number;
  /**
   * Rounded when sanitised. For values that size an array or count a loop,
   * where 10.5 sparks is not a number of sparks.
   */
  integer?: boolean;
  unit?: string;
}

export interface ColorSpec extends BaseSpec {
  kind: 'color';
  default: string;
  /** Also accept an eight-digit hex carrying opacity, for backgrounds. */
  alpha?: boolean;
}

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

export interface SelectSpec<V extends string = string> extends BaseSpec {
  kind: 'select';
  default: V;
  options: SelectOption<V>[];
}

export interface BooleanSpec extends BaseSpec {
  kind: 'boolean';
  default: boolean;
}

export interface TextSpec extends BaseSpec {
  kind: 'text';
  default: string;
  /** In characters, not UTF-16 units, so an emoji counts once. */
  maxLength: number;
}

/** A position on screen: left to right, then bottom to top, each 0–1. */
export interface PointSpec extends BaseSpec {
  kind: 'point';
  default: [number, number];
}

/** A size that is either the same on every axis, or set per axis. */
export interface ScaleSpec extends BaseSpec {
  kind: 'scale';
  default: number | [number, number, number];
  min: number;
  max: number;
}

export interface Vec3Spec extends BaseSpec {
  kind: 'vec3';
  default: [number, number, number];
  min: number;
  max: number;
}

export interface ColorListSpec extends BaseSpec {
  kind: 'colorList';
  default: string[];
  maxItems: number;
}

export interface HandListSpec extends BaseSpec {
  kind: 'handList';
  default: ClockHand[];
  maxItems: number;
  bounds: {
    rate: { min: number; max: number };
    length: { min: number; max: number };
    width: { min: number; max: number };
  };
  /** Used for a hand that does not give its own width. */
  defaultWidth: number;
}

export type ParamSpec =
  | NumberSpec
  | ColorSpec
  | SelectSpec
  | BooleanSpec
  | TextSpec
  | PointSpec
  | ScaleSpec
  | Vec3Spec
  | ColorListSpec
  | HandListSpec;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HEX_WITH_ALPHA = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * A fresh copy of a default. The schema's arrays are shared, and a form that
 * edited one in place would quietly change the default for everyone after.
 */
function copy<T>(value: T): T {
  if (!Array.isArray(value)) return value;
  return value.map((item: unknown) =>
    typeof item === 'object' && item !== null ? { ...item } : item,
  ) as T;
}

/** A finite number, or undefined. Numeric strings count — form fields produce them. */
function toFinite(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function sanitizeNumber(spec: NumberSpec, value: unknown): number {
  const n = toFinite(value);
  if (n === undefined) return spec.default;
  // Rounded before clamping, so rounding can never step back out of range.
  return clamp(spec.integer ? Math.round(n) : n, spec.min, spec.max);
}

function sanitizeColor(spec: ColorSpec, value: unknown): string {
  if (typeof value !== 'string') return spec.default;
  const trimmed = value.trim();
  return (spec.alpha ? HEX_WITH_ALPHA : HEX).test(trimmed) ? trimmed.toLowerCase() : spec.default;
}

function sanitizeSelect(spec: SelectSpec, value: unknown): string {
  return spec.options.some((option) => option.value === value) ? (value as string) : spec.default;
}

function sanitizeBoolean(spec: BooleanSpec, value: unknown): boolean {
  return typeof value === 'boolean' ? value : spec.default;
}

/**
 * Control characters become spaces, and the cut is made on whole characters
 * rather than UTF-16 units, so it never leaves half an emoji behind.
 *
 * Filtered by code point instead of with a regex over the control range, which
 * eslint rightly refuses to let through.
 */
function sanitizeText(spec: TextSpec, value: unknown): string {
  if (typeof value !== 'string') return spec.default;
  const cleaned = Array.from(value)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? ' ' : ch;
    })
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
  const cut = Array.from(cleaned).slice(0, spec.maxLength).join('');
  return cut || spec.default;
}

function sanitizePoint(spec: PointSpec, value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return copy(spec.default);
  const x = toFinite(value[0]);
  const y = toFinite(value[1]);
  if (x === undefined || y === undefined) return copy(spec.default);
  return [clamp(x, 0, 1), clamp(y, 0, 1)];
}

function sanitizeTriple(
  value: unknown,
  min: number,
  max: number,
): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const parts = value.map(toFinite);
  if (parts.some((part) => part === undefined)) return undefined;
  return parts.map((part) => clamp(part as number, min, max)) as [number, number, number];
}

function sanitizeScale(spec: ScaleSpec, value: unknown): number | [number, number, number] {
  const n = toFinite(value);
  if (n !== undefined) return clamp(n, spec.min, spec.max);
  return sanitizeTriple(value, spec.min, spec.max) ?? copy(spec.default);
}

function sanitizeVec3(spec: Vec3Spec, value: unknown): [number, number, number] {
  return sanitizeTriple(value, spec.min, spec.max) ?? copy(spec.default);
}

/** Bad entries are dropped rather than failing the whole list. */
function sanitizeColorList(spec: ColorListSpec, value: unknown): string[] {
  if (!Array.isArray(value)) return copy(spec.default);
  const colors = value
    .filter((c): c is string => typeof c === 'string' && HEX.test(c.trim()))
    .map((c) => c.trim().toLowerCase())
    .slice(0, spec.maxItems);
  return colors.length > 0 ? colors : copy(spec.default);
}

/**
 * A hand without a usable rate or length is dropped, since neither has a
 * sensible stand-in. A missing width does, so that one falls back.
 */
function sanitizeHands(spec: HandListSpec, value: unknown): ClockHand[] {
  if (!Array.isArray(value)) return copy(spec.default);
  const { bounds } = spec;
  const hands: ClockHand[] = [];
  for (const item of value) {
    if (hands.length >= spec.maxItems) break;
    if (typeof item !== 'object' || item === null) continue;
    const hand = item as Record<string, unknown>;
    const rate = toFinite(hand.rate);
    const length = toFinite(hand.length);
    if (rate === undefined || length === undefined) continue;
    hands.push({
      rate: clamp(rate, bounds.rate.min, bounds.rate.max),
      length: clamp(length, bounds.length.min, bounds.length.max),
      width: clamp(toFinite(hand.width) ?? spec.defaultWidth, bounds.width.min, bounds.width.max),
    });
  }
  return hands.length > 0 ? hands : copy(spec.default);
}

/** Make one value safe for the spec it belongs to. Never throws. */
export function sanitizeValue(spec: ParamSpec, value: unknown): unknown {
  switch (spec.kind) {
    case 'number':
      return sanitizeNumber(spec, value);
    case 'color':
      return sanitizeColor(spec, value);
    case 'select':
      return sanitizeSelect(spec, value);
    case 'boolean':
      return sanitizeBoolean(spec, value);
    case 'text':
      return sanitizeText(spec, value);
    case 'point':
      return sanitizePoint(spec, value);
    case 'scale':
      return sanitizeScale(spec, value);
    case 'vec3':
      return sanitizeVec3(spec, value);
    case 'colorList':
      return sanitizeColorList(spec, value);
    case 'handList':
      return sanitizeHands(spec, value);
  }
}

/** The value a field starts at — a fresh copy, so editing it cannot touch the schema. */
export function defaultValue(spec: ParamSpec): unknown {
  return copy(spec.default);
}
