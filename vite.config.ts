import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Match installed package boundaries, never incidental "react" text in a path. */
export function installedPackageName(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');
  const marker = '/node_modules/';
  const position = normalized.lastIndexOf(marker);
  if (position < 0) return undefined;
  const segments = normalized.slice(position + marker.length).split('/');
  if (!segments[0] || segments[0].startsWith('.')) return undefined;
  return segments[0].startsWith('@') && segments[1] ? `${segments[0]}/${segments[1]}` : segments[0];
}
export function marketingVendorChunk(id: string): string | undefined {
  // Otherwise Rollup may place this shared helper in maps and make React depend
  // on its own map adapter, creating a circular chunk evaluation dependency.
  if (id === '\0commonjsHelpers.js') return 'vendor-react';
  const pkg = installedPackageName(id);
  if (!pkg) return undefined;
  if (['react', 'react-dom', 'scheduler', 'react-is', 'use-sync-external-store'].includes(pkg)) return 'vendor-react';
  if (['motion', 'framer-motion', 'motion-dom', 'motion-utils'].includes(pkg)) return 'vendor-motion';
  if (pkg === 'lucide-react') return 'vendor-icons';
  if (['leaflet', 'react-leaflet', '@react-leaflet/core', '@vis.gl/react-google-maps', '@googlemaps/markerclusterer'].includes(pkg)) return 'vendor-maps';
  if (['@stripe/stripe-js', '@stripe/react-stripe-js', 'socket.io-client', 'socket.io-parser', 'engine.io-client', 'engine.io-parser', '@socket.io/component-emitter'].includes(pkg)) return 'vendor-integrations';
  if (pkg === '@google/genai') return 'vendor-ai';
  return undefined;
}

export default defineConfig(() => {
    return {
      // Deployment must supply reviewed public variables explicitly. Building a
      // client must never import developer .env provider/database credentials.
      envDir: false as const,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      define: {
        'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
        'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || '')
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          devOptions: {
            enabled: false
          },
          registerType: 'autoUpdate',
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          includeAssets: ['logo.svg'],
          manifest: {
            name: 'EnchoSpace',
            short_name: 'EnchoSpace',
            description: 'Book your perfect space',
            theme_color: '#0284C7',
            background_color: '#ffffff',
            display: 'standalone',
            orientation: 'portrait',
            icons: [
              {
                src: 'logo.svg',
                sizes: '192x192 512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          },
          injectManifest: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          }
        })
      ],
      build: {
        sourcemap: false,
        chunkSizeWarningLimit: 500,
        rollupOptions: {
          output: {
            manualChunks: marketingVendorChunk
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
