const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = walkSync(dirFile, filelist);
    } catch (err) {
      if (err.code === 'ENOTDIR' || err.code === 'EBADF') filelist.push(dirFile);
    }
  });
  return filelist;
};

const files = walkSync('./components').filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace blues/corals/oranges with brand
  content = content.replace(/\btext-blue-500\b/g, 'text-brand');
  content = content.replace(/\btext-blue-600\b/g, 'text-brand-dark');
  content = content.replace(/\bbg-blue-500\b/g, 'bg-brand');
  content = content.replace(/\bbg-blue-600\b/g, 'bg-brand-dark');
  content = content.replace(/\bhover:bg-blue-600\b/g, 'hover:bg-brand-dark');
  content = content.replace(/\bring-blue-500\b/g, 'ring-brand');
  content = content.replace(/\bborder-blue-500\b/g, 'border-brand');
  
  content = content.replace(/\btext-coral-500\b/g, 'text-brand');
  content = content.replace(/\bbg-coral-500\b/g, 'bg-brand');
  content = content.replace(/\btext-orange-500\b/g, 'text-brand');
  content = content.replace(/\bbg-orange-500\b/g, 'bg-brand');
  content = content.replace(/\btext-orange-600\b/g, 'text-brand-dark');
  content = content.replace(/\bbg-orange-600\b/g, 'bg-brand-dark');

  // Replace darks with canvas
  content = content.replace(/\bbg-neutral-900\b/g, 'bg-canvas');
  content = content.replace(/\bbg-zinc-900\b/g, 'bg-canvas');
  content = content.replace(/\btext-zinc-900\b/g, 'text-canvas');
  content = content.replace(/\btext-neutral-900\b/g, 'text-canvas');
  content = content.replace(/\btext-gray-900\b/g, 'text-canvas');
  
  // Replace some bg-whites with dune
  content = content.replace(/\bbg-white\b/g, 'bg-dune');
  
  fs.writeFileSync(file, content, 'utf8');
});

console.log('Replaced colors in components.');
