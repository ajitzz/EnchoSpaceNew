import {vi} from 'vitest';
import net from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

if (process.env.ENCHO_TEST_SANDBOX !== '1') {
  throw new Error('Run tests with npm test or npm run test:marketing. Ambient environments are not accepted.');
}

// Application and older test imports must not reopen the developer's .env.
vi.mock('dotenv', () => ({default: {config: () => ({parsed: {}})}, config: () => ({parsed: {}})}));
vi.mock('dotenv/config', () => ({}));

// Permit fixture servers created in this worker and disposable PG Unix sockets.
// Do not permit arbitrary localhost databases, provider APIs or cloud metadata.
const servers = new Set<net.Server>();
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args: any[]) {
  servers.add(this);
  this.once('close', () => servers.delete(this));
  return listen.apply(this, args as Parameters<typeof listen>);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args: any[]) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const options = typeof first === 'object' ? first : typeof first === 'number'
    ? {port: first, host: typeof normalized[1] === 'string' ? normalized[1] : 'localhost'} : {path: first};
  const localHost = ['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(options.host || 'localhost');
  const ownPort = [...servers].some(server => {const address = server.address(); return address && typeof address === 'object' && address.port === Number(options.port);});
  const socket = typeof options.path === 'string' && options.path.startsWith(join(tmpdir(), 'harvo-pg-'))
    && !options.path.split('/').includes('..') && /\/socket\/\.s\.PGSQL\.\d+$/.test(options.path);
  if (!(socket || (localHost && ownPort))) throw new Error('TEST_EXTERNAL_NETWORK_BLOCKED');
  return connect.apply(this, args as Parameters<typeof connect>);
};
