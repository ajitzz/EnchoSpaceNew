import {vi} from 'vitest';
// Individual interaction tests may supply local responses; no external fetch is permitted.
vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('External network is disabled in presentation tests.');}));
