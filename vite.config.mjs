import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vendor libraries change rarely, so they get their own long-cached chunks.
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
            { name: 'antd', test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
