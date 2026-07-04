const fs = require('fs');

function replaceFile(path, replacer) {
   let code = fs.readFileSync(path, 'utf8');
   code = replacer(code);
   fs.writeFileSync(path, code);
}

replaceFile('components/ExperiencesPage.tsx', code => {
   code = code.replace(/id: "mock-1"/g, 'id: 10001 as any');
   code = code.replace(/id: "mock-2"/g, 'id: 10002 as any');
   code = code.replace(/id: "mock-3"/g, 'id: 10003 as any');
   code = code.replace(/id: "mock-4"/g, 'id: 10004 as any');
   return code;
});

