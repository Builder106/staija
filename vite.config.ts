/// <reference types="vitest" />
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * Emit `/version.txt` containing the deploy's commit SHA (or a "dev"
 * stub when building locally without Vercel's env). The running app
 * fetches this on tab focus and triggers a reload when the SHA no
 * longer matches the SHA baked into the running bundle — that's how
 * users with long-lived tabs find out a new deploy is live without
 * having to manually refresh.
 */
function emitVersionFile(buildId: string): PluginOption {
  return {
    name: 'staija-version-txt',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.txt',
        source: buildId,
      })
    },
  }
}

export default defineConfig(async ({ mode }) => {
  loadEnv(mode, process.cwd(), '')

  // Vercel exposes the commit SHA as VERCEL_GIT_COMMIT_SHA at build
  // time. Falls back to a timestamp for local builds so dev never
  // accidentally collides with a real deploy ID.
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA ?? `dev-${Date.now().toString(36)}`

  return {
    plugins: [
      vue(),
      tailwindcss(),
      emitVersionFile(buildId),
      // Bundle visualizer — open the generated dist/stats.html after a
      // build to see what's actually in each chunk. Skip in CI/Vercel
      // builds to avoid bloating the output directory.
      ...(process.env.ANALYZE === '1'
        ? [(await import('rollup-plugin-visualizer')).visualizer({
            filename: 'dist/stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          })]
        : []),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      port: 5190,
      strictPort: true,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // Manual chunks: carve off Tiptap (only loaded on admin content
      // routes) to reduce main bundle size. Firebase kept in vendor
      // because it's used across auth routes. The previous manualChunks
      // attempt failed due to a TDZ circular dep between vendor chunks;
      // this version is scoped to Tiptap only — a single leaf dependency
      // with no imports back into app code — so it cannot create a
      // cycle.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              // Tiptap editor — only used in admin content routes
              // (LessonEdit, AssignmentEdit). Splitting this avoids
              // ~300KB of editor code in the main bundle for all users.
              if (/[\\/]node_modules[\\/]@tiptap/.test(id)) {
                return 'vendor-tiptap'
              }
              // All other node_modules go to vendor
              return 'vendor'
            }
          },
          // Opaque hash-only filenames for route + component chunks.
          // Vite's default is `[name]-[hash].js`, which leaks our view
          // file names (Settings, Apply, Donate, etc.) into the URL —
          // and common content-blocker filter lists match patterns
          // like `settings*.js$script` because trackers often live
          // under those names (cookie-settings.js, ad-settings.js).
          // Net effect was that ~30% of Safari users with broad
          // blockers couldn't load /account/settings, /donate, etc.
          // Stripping the name kills the false-positive surface
          // entirely; the hash still makes each chunk uniquely
          // cacheable.
          chunkFileNames: 'assets/[hash].js',
          entryFileNames: 'assets/[hash].js',
          // Keep assetFileNames (images, fonts, CSS) descriptive —
          // filter lists rarely target those by source name, and the
          // descriptive form is useful for debugging.
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      // Shims a working localStorage for tests — happy-dom 20 ships a
      // window.localStorage whose methods aren't reachable in this
      // vitest combo. See tests/setup.ts for the diagnosis + workaround.
      setupFiles: ['tests/setup.ts'],

    },
  }
})
