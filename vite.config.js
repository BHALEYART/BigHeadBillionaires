import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  build: {
    lib: {
      entry: 'mint.js',
      name: 'BHBMint',
      fileName: 'mint.bundle',
      formats: ['iife']
    },
    outDir: 'assets',
    emptyOutDir: false
  }
});