import { defineConfig } from 'vite';

/**
 * Bundles server/animations.ts, and everything it imports, into the single
 * file Vercel runs as the /api/animations function: api/animations.js.
 *
 * Bundled rather than left for Vercel to compile, because this package is an
 * ES module and the shared rules import each other without file extensions —
 * fine for Vite, but Node refuses such imports at run time, and Vercel's own
 * TypeScript step does not bundle. One self-contained file has nothing left
 * to resolve.
 *
 * `npm run build` runs this after the site's build. The output is committed,
 * so run the build after changing anything under server/ or the rules it
 * imports, and commit api/animations.js with the change.
 */
export default defineConfig({
  // Not the site's files: this build makes one function, nothing else.
  publicDir: false,
  build: {
    ssr: 'server/animations.ts',
    outDir: 'api',
    emptyOutDir: false,
    target: 'node20',
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'animations.js', format: 'es' },
    },
  },
  // Dependencies go into the bundle too, so the function needs no install.
  ssr: { noExternal: true, target: 'node' },
});
