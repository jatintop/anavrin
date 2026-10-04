import react from '@vitejs/plugin-react'
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode demo` → one self-contained HTML file (the shareable demo, no Firebase).
// `vite build`             → the real installable app for Firebase Hosting.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    base: './',
    define: { __DEMO__: JSON.stringify(demo) },
    test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
    build: demo ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000 } : { outDir: 'dist' },
    plugins: [
      react(),
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'Anavrin',
              short_name: 'Anavrin',
              description: 'Stock, stalls and accounts for Anavrin sarees',
              theme_color: '#7a1730',
              background_color: '#fbf6f5',
              display: 'standalone',
              start_url: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], maximumFileSizeToCacheInBytes: 5_000_000 },
          }),
    ],
  }
})
