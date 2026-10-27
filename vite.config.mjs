import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React and Supabase change rarely, so they get their own long-cached chunks. Ant Design is deliberately NOT
// forced into one chunk: that would pull every component into the first download and defeat the lazy-loaded pages.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
