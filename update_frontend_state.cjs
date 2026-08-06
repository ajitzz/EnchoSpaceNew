const fs = require('fs');
let code = fs.readFileSync('./components/HostMarketing.tsx', 'utf8');

code = code.replace(/=== 'active'/g, "=== 'active' || campaign?.status === 'CAMPAIGN_LIVE'");
// Wait, the replaced `campaign` might not be in scope if it's `c.status === 'active'`
