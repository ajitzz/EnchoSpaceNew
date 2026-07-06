const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf-8');

const regexBedrooms = /queryStr \+= \` AND \(l\.bedrooms >= \$\{queryParams\.length\} OR EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(l\.rooms\) = 'array' THEN l\.rooms ELSE '\[\]'::jsonb END\) as r WHERE \(r->>'bedrooms'\) IS NOT NULL AND \(r->>'bedrooms'\) != '' AND \(r->>'bedrooms'\)::numeric >= \$\{queryParams\.length\}\)\)\`;/g;
server = server.replace(regexBedrooms, "queryStr += ` AND (l.bedrooms >= $${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'bedrooms') IS NOT NULL AND (r->>'bedrooms') != '' AND (r->>'bedrooms')::numeric >= $${queryParams.length}))`;");

const regexBeds = /queryStr \+= \` AND \(l\.beds >= \$\{queryParams\.length\} OR EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(l\.rooms\) = 'array' THEN l\.rooms ELSE '\[\]'::jsonb END\) as r WHERE \(r->>'beds'\) IS NOT NULL AND \(r->>'beds'\) != '' AND \(r->>'beds'\)::numeric >= \$\{queryParams\.length\}\)\)\`;/g;
server = server.replace(regexBeds, "queryStr += ` AND (l.beds >= $${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'beds') IS NOT NULL AND (r->>'beds') != '' AND (r->>'beds')::numeric >= $${queryParams.length}))`;");

const regexGuests = /queryStr \+= \` AND \(l\.max_guests >= \$\{queryParams\.length\} OR EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(l\.rooms\) = 'array' THEN l\.rooms ELSE '\[\]'::jsonb END\) as r WHERE \(r->>'capacity'\) IS NOT NULL AND \(r->>'capacity'\) != '' AND \(r->>'capacity'\)::numeric >= \$\{queryParams\.length\}\)\)\`;/g;
server = server.replace(regexGuests, "queryStr += ` AND (l.max_guests >= $${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.rooms) = 'array' THEN l.rooms ELSE '[]'::jsonb END) as r WHERE (r->>'capacity') IS NOT NULL AND (r->>'capacity') != '' AND (r->>'capacity')::numeric >= $${queryParams.length}))`;");

fs.writeFileSync('server.ts', server);
console.log('Fixed SQL injection/parameter issue again');
