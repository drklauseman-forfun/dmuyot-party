/**
 * Development-only logging.
 *
 * `import.meta.env.DEV` is replaced with a literal at build time, so the calls
 * below fold away entirely in a production bundle — the effect tracing stays
 * useful while authoring an effect without shipping to the browser console.
 */
export const devLog = import.meta.env.DEV
  ? (...args: unknown[]) => console.log(...args)
  : () => {};
