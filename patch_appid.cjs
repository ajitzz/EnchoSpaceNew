const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const appIdFallback = "${process.env.META_APP_ID || '1347659864208278'}";

content = content.replace(/'Meta App 1347659864208278 is currently in Development Mode on Meta Developers Console \(error 100\/1885183\)\.'/g,
  "`Meta App ${process.env.META_APP_ID || '1347659864208278'} is currently in Development Mode on Meta Developers Console (error 100/1885183).`");

content = content.replace(/Meta App ID: 1347659864208278\./g,
  `Meta App ID: ${appIdFallback}.`);

content = content.replace(/'Switch Meta App 1347659864208278 from Development to Live\/Public Mode in Meta Developers Console/g,
  "`Switch Meta App ${process.env.META_APP_ID || '1347659864208278'} from Development to Live/Public Mode in Meta Developers Console");

fs.writeFileSync('server.ts', content);
