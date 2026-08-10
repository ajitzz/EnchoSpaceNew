const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    const health = {
      meta_access_token: !!accessToken,
      meta_ad_account: !!adAccountId,
      meta_page_id: !!pageId,
      meta_instagram_account: !!process.env.META_INSTAGRAM_ACCOUNT_ID,
      kill_switch_active: process.env.META_PUBLISHING_PAUSED === 'true',
      meta_api_version: 'v20.0',
      status: process.env.META_PUBLISHING_PAUSED === 'true' ? 'PAUSED' : 'OPERATIONAL',
      checks: [] as any[]
    };`;

const replacement = `    const health = {
      meta_access_token: !!accessToken,
      meta_ad_account: !!adAccountId,
      meta_ad_account_id: adAccountId,
      meta_page_id: !!pageId,
      meta_instagram_account: !!process.env.META_INSTAGRAM_ACCOUNT_ID,
      kill_switch_active: process.env.META_PUBLISHING_PAUSED === 'true',
      meta_api_version: 'v20.0',
      status: process.env.META_PUBLISHING_PAUSED === 'true' ? 'PAUSED' : 'OPERATIONAL',
      checks: [] as any[]
    };`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched health API to include meta_ad_account_id');
} else {
  console.log('Target not found for health API patch');
}
