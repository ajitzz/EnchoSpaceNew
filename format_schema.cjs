const fs = require('fs');
const data = JSON.parse(fs.readFileSync('schema_dump.json', 'utf8'));

const grouped = {};
for (const row of data) {
  if (!grouped[row.table_name]) grouped[row.table_name] = [];
  grouped[row.table_name].push(row.column_name);
}

for (const table in grouped) {
  console.log(`${table}: ${grouped[table].join(', ')}`);
}
