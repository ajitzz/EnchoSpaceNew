const fs = require('fs');

function updateFile(path, target, replacement) {
   if(fs.existsSync(path)) {
      let code = fs.readFileSync(path, 'utf8');
      if (code.includes(target)) {
         code = code.replace(target, replacement);
         fs.writeFileSync(path, code);
         console.log('Fixed', path);
      }
   }
}

// Ensure the HostMarketing.tsx dashboard uses the intent_score and handles Meta CAPI token properly
// We already stripped it from the backend API response for security, but the UI might be expecting it

// In HostMarketing.tsx, add the Meta Pixel ID input if the user wants to bring their own (Pillar 6 expansion for power users, though Encho controls the master account, CAPI routing requires it)
// It was added to the DB, but we should make sure the UI components match the standard.

