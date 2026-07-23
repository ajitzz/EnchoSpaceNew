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
files.push('App.tsx');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/Encho Space/g, 'Amigove');
  content = content.replace(/EnchoSpace/g, 'Amigove');
  content = content.replace(/ENCHO/g, 'AMIGOVE');
  content = content.replace(/encho\.com/g, 'amigove.com');
  content = content.replace(/encho\.space/g, 'amigove.com');
  content = content.replace(/enchospace/g, 'amigove');
  content = content.replace(/encho_stays/g, 'amigove_stays');
  content = content.replace(/Encho/g, 'Amigove');
  content = content.replace(/encho/g, 'amigove');

  fs.writeFileSync(file, content, 'utf8');
});

console.log('Replaced Encho with Amigove.');
