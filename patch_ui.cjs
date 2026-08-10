const fs = require('fs');
let code = fs.readFileSync('components/AdminOpsControlCenter.tsx', 'utf8');

const target = `<span className="truncate">Master Act #{process.env.META_AD_ACCOUNT_ID || 'Configured'}</span>`;
const replacement = `<span className="truncate">Master Act #{healthData?.meta_ad_account_id || 'Configured'}</span>`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('components/AdminOpsControlCenter.tsx', code);
  console.log('Patched UI for ad account ID');
} else {
  console.log('Target not found for UI patch');
}
