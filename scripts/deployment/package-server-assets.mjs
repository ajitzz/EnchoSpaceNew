import {mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

// Operator checksum verification needs exact SQL source, outside the public build.
const destination=join(process.argv[2]||'build/server','src/migrations');
mkdirSync(destination,{recursive:true});
for(const name of readdirSync('src/migrations').filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)))copyFileSync(join('src/migrations',name),join(destination,name));
