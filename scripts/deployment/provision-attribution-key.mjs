import {randomBytes} from 'node:crypto';
import {closeSync,constants,fstatSync,fsyncSync,openSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'dotenv';

/** Local secret provisioning only. Never loads .env, starts the app, or rotates existing keys. */
export function provisionAttributionKey(file) {
  if (!/^\.env\.[a-z0-9-]+\.local$/.test(basename(file))) throw new Error('IGNORED_LOCAL_SECRET_FILE_REQUIRED');
  let descriptor;
  let created = false;
  try {
    try {
      descriptor = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      created = true;
      const active = `local_${randomBytes(6).toString('hex')}`;
      const ring = {active, keys: {[active]: randomBytes(32).toString('base64url')}};
      writeFileSync(descriptor, `HARVO_ATTRIBUTION_KEYS='${JSON.stringify(ring)}'\n`);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid() || stat.nlink !== 1 || stat.size > 4096) throw new Error('PRIVATE_SECRET_FILE_REQUIRED');
    const values = parse(readFileSync(descriptor));
    if (Object.keys(values).length !== 1 || !values.HARVO_ATTRIBUTION_KEYS) throw new Error('ATTRIBUTION_KEY_FILE_INVALID');
    const ring = JSON.parse(values.HARVO_ATTRIBUTION_KEYS);
    const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(value);
    if (!ring || Object.keys(ring).sort().join(',') !== 'active,keys' || !validId(ring.active) || !ring.keys || Array.isArray(ring.keys) || !Object.hasOwn(ring.keys, ring.active)) throw new Error('ATTRIBUTION_KEY_RING_INVALID');
    const keys = Object.entries(ring.keys);
    if (keys.length < 1 || keys.length > 5 || keys.some(([id, key]) => !validId(id) || typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key, 'base64url').length !== 32 || Buffer.from(key, 'base64url').toString('base64url') !== key)) throw new Error('ATTRIBUTION_KEY_RING_INVALID');
    return {status: created ? 'CREATED' : 'PRESERVED', activeKeyId: ring.active, retainedKeys: keys.length, mode: '0600'};
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error('UNEXPECTED_ARGUMENTS');
    console.log(JSON.stringify(provisionAttributionKey(resolve(process.argv[2] || '.env.harvo-attribution.local'))));
  } catch {
    console.error('ATTRIBUTION_LOCAL_PROVISION_FAILED: existing files are never overwritten; inspect path, permissions and key-ring format privately.');
    process.exitCode = 1;
  }
}
