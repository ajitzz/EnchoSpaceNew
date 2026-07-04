import fs from 'fs';
import path from 'path';

const componentsDir = path.join(process.cwd(), 'components');

const replaceInFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  if (content.includes('listing.currency')) {
    content = content.replace(/\{listing\.currency\}/g, '₹');
    content = content.replace(/listing\.currency/g, "'₹'");
    changed = true;
  }
  if (content.includes('item.currency')) {
    content = content.replace(/\{item\.currency\}/g, '₹');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
};

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else if (dirFile.endsWith('.tsx')) {
      filelist.push(dirFile);
    }
  });
  return filelist;
};

walkSync(componentsDir).forEach(replaceInFile);
console.log('Done');
