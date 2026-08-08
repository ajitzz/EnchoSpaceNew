const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLine = "app.get('/api/admin/integration-inspection'";

const privacyRoute = `
// Privacy Policy for Meta App
app.get('/privacy', (req, res) => {
  res.send(\`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
        h1 { color: #111; }
        h2 { color: #222; margin-top: 30px; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy for Encho</h1>
      <p>Last updated: August 8, 2026</p>
      
      <h2>1. Introduction</h2>
      <p>Welcome to Encho. This privacy policy explains how we collect, use, and protect your data.</p>
      
      <h2>2. Data Collection</h2>
      <p>We only collect the information you choose to provide to us, including your profile data, marketing preferences, and campaign information.</p>
      
      <h2>3. Meta and Third-Party Integrations</h2>
      <p>When you use our Meta marketing features, we interact with the Meta Graph API on your behalf. We do not sell your personal data to third parties.</p>
      
      <h2>4. Data Security</h2>
      <p>We implement industry-standard security measures to protect your information, including strict Row-Level Security in our databases.</p>
      
      <h2>5. Contact Us</h2>
      <p>If you have any questions about this privacy policy, please contact support.</p>
    </body>
    </html>
  \`);
});

`;

const targetIndex = code.indexOf(targetLine);
if (targetIndex !== -1) {
  code = code.substring(0, targetIndex) + privacyRoute + code.substring(targetIndex);
  fs.writeFileSync('server.ts', code);
  console.log("Added privacy policy route");
} else {
  console.log("Target line not found");
}
