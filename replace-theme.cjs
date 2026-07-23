const fs = require('fs');
const path = require('path');

const DIR = './';

function walk(dir) {
  let list = [];
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        list = list.concat(walk(filePath));
      }
    } else {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.css') || filePath.endsWith('.html') || filePath.endsWith('.svg') || filePath.endsWith('.json') || file.endsWith('.ts')) {
        list.push(filePath);
      }
    }
  });
  return list;
}

const files = walk(DIR);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  content = content.replace(/#E31C5F/gi, '#0284C7'); // Sky 600
  content = content.replace(/#C90E4F/gi, '#0369A1'); // Sky 700
  content = content.replace(/#FFE8F0/gi, '#E0F2FE'); // Sky 100
  // Handle some specific Tailwind classes if they were hardcoded
  content = content.replace(/bg-\[#E31C5F\]/gi, 'bg-[#0284C7]');
  content = content.replace(/text-\[#E31C5F\]/gi, 'text-[#0284C7]');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated theme in: ${file}`);
  }
});
