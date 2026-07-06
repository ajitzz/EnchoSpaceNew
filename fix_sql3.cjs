const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf-8');

const target1 = "queryStr += ` AND (l.bedrooms >= ${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'bedrooms') IS NOT NULL AND (r->>'bedrooms') != '' AND (r->>'bedrooms')::numeric >= ${queryParams.length}))`;";
const replace1 = "queryStr += ` AND (l.bedrooms >= \\$\\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'bedrooms') IS NOT NULL AND (r->>'bedrooms') != '' AND (r->>'bedrooms')::numeric >= \\$\\${queryParams.length}))`;".replace(/\\$\\$/g, '$');

server = server.split(target1).join(replace1);

const target2 = "queryStr += ` AND (l.beds >= ${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'beds') IS NOT NULL AND (r->>'beds') != '' AND (r->>'beds')::numeric >= ${queryParams.length}))`;";
const replace2 = "queryStr += ` AND (l.beds >= \\$\\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'beds') IS NOT NULL AND (r->>'beds') != '' AND (r->>'beds')::numeric >= \\$\\${queryParams.length}))`;".replace(/\\$\\$/g, '$');

server = server.split(target2).join(replace2);

const target3 = "queryStr += ` AND (l.max_guests >= ${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'capacity') IS NOT NULL AND (r->>'capacity') != '' AND (r->>'capacity')::numeric >= ${queryParams.length}))`;";
const replace3 = "queryStr += ` AND (l.max_guests >= \\$\\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'capacity') IS NOT NULL AND (r->>'capacity') != '' AND (r->>'capacity')::numeric >= \\$\\${queryParams.length}))`;".replace(/\\$\\$/g, '$');

server = server.split(target3).join(replace3);

fs.writeFileSync('server.ts', server);
console.log('Done fix 3');
