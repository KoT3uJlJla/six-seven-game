import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    closeBundle() {
      const source = resolve('assets');
      const target = resolve('dist/assets');
      if (existsSync(source)) cpSync(source, target, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [copyRuntimeAssets()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
