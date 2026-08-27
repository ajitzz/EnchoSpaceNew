import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
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
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
            navigateFallback: '/index.html',
            navigateFallbackAllowlist: [/^\/$/], // only cache index, avoid caching /api routes
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'unsplash-images-cache',
                  expiration: {
                    maxEntries: 40,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 Days
                    purgeOnQuotaError: true
                  },
                  cacheableResponse: {
                    statuses: [200]
                  }
                }
              },
              {
                urlPattern: /\/api\/.*/i,
                method: 'POST',
                handler: 'NetworkOnly',
                options: {
                  backgroundSync: {
                    name: 'api-syncQueue',
                    options: {
                      maxRetentionTime: 24 * 60 // 24 hours
                    }
                  }
                }
              },
              {
                urlPattern: /\/api\/image.*/i,
                method: 'GET',
                handler: 'CacheFirst',
                options: {
                  cacheName: 'optimized-image-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
                    purgeOnQuotaError: true
                  },
                  cacheableResponse: {
                    statuses: [200]
                  }
                }
              },
              {
                urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
                method: 'GET',
                handler: 'CacheFirst',
                options: {
                  cacheName: 'image-assets-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
                    purgeOnQuotaError: true
                  },
                  cacheableResponse: {
                    statuses: [200]
                  }
                }
              },
              {
                urlPattern: /\/api\/.*/i,
                method: 'GET',
                handler: 'NetworkOnly'
              }
            ]
          }
        })
      ],
      build: {
        sourcemap: true,
        chunkSizeWarningLimit: 500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('react-dom')) {
                  return 'vendor-react';
                }
                if (id.includes('framer-motion')) {
                  return 'vendor-motion';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('leaflet')) {
                  return 'vendor-maps';
                }
                if (id.includes('@stripe') || id.includes('socket.io-client')) {
                  return 'vendor-integrations';
                }
                if (id.includes('@google/genai')) {
                  return 'vendor-ai';
                }
              }
            }
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
