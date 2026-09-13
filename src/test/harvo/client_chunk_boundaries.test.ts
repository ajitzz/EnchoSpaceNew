import { describe, expect, it } from 'vitest';
import { installedPackageName, marketingVendorChunk } from '../../../vite.config.js';
describe('production installed-package chunk boundaries', () => {
  it.each(['react', 'react-dom', 'scheduler', 'react-is', 'use-sync-external-store'])('keeps actual React runtime %s in core', pkg => expect(marketingVendorChunk(`/workspace/node_modules/${pkg}/index.js`)).toBe('vendor-react'));
  it.each([
    ['lucide-react', 'vendor-icons'], ['react-leaflet', 'vendor-maps'], ['@react-leaflet/core', 'vendor-maps'], ['@vis.gl/react-google-maps', 'vendor-maps'],
    ['@googlemaps/markerclusterer', 'vendor-maps'], ['framer-motion', 'vendor-motion'], ['motion-dom', 'vendor-motion'], ['@stripe/react-stripe-js', 'vendor-integrations'],
  ])('classifies %s by its real package boundary', (pkg, chunk) => expect(marketingVendorChunk(`/workspace/node_modules/${pkg}/dist/index.js`)).toBe(chunk));
  it.each(['@mux/mux-player-react', 'preact', 'reactive-library', 'my-react-addon'])('does not absorb unrelated package %s into React', pkg => expect(marketingVendorChunk(`/workspace/node_modules/${pkg}/index.js`)).toBeUndefined());
  it('resolves nested scoped package boundaries and Windows paths', () => {
    expect(installedPackageName('/work/node_modules/.pnpm/@react-leaflet+core@3/node_modules/@react-leaflet/core/lib.js')).toBe('@react-leaflet/core');
    expect(marketingVendorChunk('C:\\work\\node_modules\\lucide-react\\dist\\index.js')).toBe('vendor-icons');
    expect(marketingVendorChunk('/work/react-app/components/react.tsx')).toBeUndefined();
    expect(marketingVendorChunk('/work/node_modules-backup/react/index.js')).toBeUndefined();
  });
  it('keeps virtual commonjs runtime helpers out of a dependent feature chunk', () => {
    expect(marketingVendorChunk('\0commonjsHelpers.js')).toBe('vendor-react');
    expect(marketingVendorChunk('\0/work/node_modules/react/index.js?commonjs-proxy')).toBe('vendor-react');
    expect(marketingVendorChunk('\0unrelated-virtual-helper')).toBeUndefined();
  });
});
