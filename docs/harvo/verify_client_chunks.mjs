import { build } from 'vite';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const directory = mkdtempSync(join(tmpdir(), 'harvo-client-chunks-'));
const warnings = [], chunks = [];
await build({ envDir: false, build: { outDir: join(directory, 'client'), emptyOutDir: true, rollupOptions: { onwarn(warning, handler) { warnings.push({ code: warning.code, message: warning.message }); handler(warning); } } }, plugins: [{ name: 'harvo-client-chunk-evidence', generateBundle(_options, bundle) {
  for (const output of Object.values(bundle)) if (output.type === 'chunk') chunks.push({ file: output.fileName, bytes: Buffer.byteLength(output.code), gzipBytes: gzipSync(output.code).length, imports: output.imports, dynamicImports: output.dynamicImports, isEntry: output.isEntry, modules: Object.keys(output.modules) });
} }] });
const byFile = new Map(chunks.map(chunk => [chunk.file, chunk])), cycles = [], visited = new Set();
function inspect(file, chain = []) { if (chain.includes(file)) { cycles.push([...chain.slice(chain.indexOf(file)), file]); return; } if (visited.has(file)) return; visited.add(file); for (const imported of byFile.get(file)?.imports || []) if (byFile.has(imported)) inspect(imported, [...chain, file]); }
for (const chunk of chunks) inspect(chunk.file);
const initial = new Set();
function include(file) { if (initial.has(file)) return; initial.add(file); for (const imported of byFile.get(file)?.imports || []) if (byFile.has(imported)) include(imported); }
for (const entry of chunks.filter(chunk => chunk.isEntry)) include(entry.file);
const result = { directory, node: process.version, envDir: false, warningThreshold: 500, warnings, cycles, initialStaticJs: { files: [...initial], bytes: [...initial].reduce((n, file) => n + byFile.get(file).bytes, 0), gzipBytes: [...initial].reduce((n, file) => n + byFile.get(file).gzipBytes, 0) }, chunks };
writeFileSync(join(directory, 'chunks.json'), JSON.stringify(result, null, 2) + '\n');
const artifactDirectory = 'docs/harvo/artifacts/client-chunks'; mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(join(artifactDirectory, 'after-build.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ directory, cycles, initialStaticJs: result.initialStaticJs, chunks: chunks.map(({ file, bytes, gzipBytes }) => ({ file, bytes, gzipBytes })) }));
if (cycles.length) throw new Error('HARVO_CLIENT_CHUNK_CYCLE');
if (!readFileSync(join(directory, 'client/sw.js'), 'utf8').includes('marketing\\/v2')) throw new Error('HARVO_MUTATION_CACHE_EXCLUSION_MISSING');
