import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packageMigrationAssets} from './migration-assets.mjs';

// Operator checksum verification needs exact SQL source, outside the public build.
const buildRoot=resolve(process.argv[2]||'build/server');
const destination=join(buildRoot,'src/migrations');
if(destination===resolve('src/migrations'))throw new Error('MIGRATION_ASSET_SOURCE_OVERWRITE_FORBIDDEN');
const {readMigrationManifest}=await import(pathToFileURL(join(buildRoot,'src/migrations/manifest.js')).href);
const manifest=readMigrationManifest(resolve('src/migrations'));
packageMigrationAssets({source:resolve('src/migrations'),destination,manifest});
if(JSON.stringify(readMigrationManifest(destination))!==JSON.stringify(manifest))throw new Error('MIGRATION_ASSET_PARITY_FAILED');
