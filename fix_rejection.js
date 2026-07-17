const fs = require('fs');
let code = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');

code = code.replace(/rejectionFields\.([a-zA-Z_]+)\.selected/g, "rejectedFieldInputs['$1'] !== undefined");
code = code.replace(/rejectionFields\.([a-zA-Z_]+)\.reason/g, "rejectedFieldInputs['$1'] || ''");
code = code.replace(/rejectionNotes/g, "rejectionFeedback");
code = code.replace(/setRejectionNotes/g, "setRejectionFeedback");
code = code.replace(/handleSubmitRejection/g, "handleConfirmRejectCampaign");

fs.writeFileSync('components/AdminDashboard.tsx', code);
console.log('Fixed');
