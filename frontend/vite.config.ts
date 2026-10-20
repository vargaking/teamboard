import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** VITE_BASE (e.g. "/board/") -> always leading + trailing slash; default "/". */
function normaliseBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

const base = normaliseBase(process.env.VITE_BASE);

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev proxy follows the base, e.g. /board/api -> backend /api (the prefix is stripped,
      // like the host nginx does in production).
      [`${base}api`]: {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        ...(base === '/' ? {} : { rewrite: (path: string) => path.slice(base.length - 1) }),
      },
    },
  },
  build: {
    // The initial antd chunk is ~920 kB minified (~280 kB gzip). It lives in its own long-cached
    // vendor chunk, so the default 500 kB warning is not actionable here.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'antd-icons', test: /node_modules[\\/]@ant-design[\\/]icons/, priority: 25 },
            // Only antd code the initial page load needs ('$initial'); components used solely by
            // lazy-loaded routes/dialogs stay in those lazy chunks.
            {
              name: 'antd',
              test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+)[\\/]/,
              tags: ['$initial'],
              priority: 20,
            },
            { name: 'vendor', test: /node_modules/, tags: ['$initial'], priority: 10 },
          ],
        },
      },
    },
  },
});
