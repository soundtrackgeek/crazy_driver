import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Two pages: the game (index.html) and the track editor (editor.html).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: page('index.html'), editor: page('editor.html') },
    },
  },
});
