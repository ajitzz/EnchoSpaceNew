import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
// Presentation-only validation must never inherit production dotenv/database configuration.
export default defineConfig({envDir:false,plugins:[react()],test:{name:'guest-presentation',environment:'node',setupFiles:['src/test/isolation.ts','src/test/guestPresentationSetup.ts'],include:['src/test/m6a_guest_presentation_truth.test.tsx','src/test/sanctuary_gallery.test.ts','src/test/m6a_interactive_gallery.test.tsx','src/test/property_presentation_boundary.test.tsx','src/test/cr1_guest_presentation.test.tsx'],fileParallelism:false,testTimeout:15000,restoreMocks:true}});
