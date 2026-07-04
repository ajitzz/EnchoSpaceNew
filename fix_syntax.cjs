const fs = require('fs');
let dash = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');
dash = dash.replace(/, MoreHorizontal \} from 'lucide-react';\} from 'lucide-react';/g, ", MoreHorizontal } from 'lucide-react';");
dash = dash.replace(/, MoreHorizontal } from 'lucide-react';/, "import { MoreHorizontal } from 'lucide-react';");
fs.writeFileSync('components/AdminDashboard.tsx', dash);

let host = fs.readFileSync('components/HostDashboard.tsx', 'utf8');
host = host.replace(/\/\* listingType=\{ \*\/\s*any\}\s*/g, '');
host = host.replace(/listingType=\{any\}/g, '');
fs.writeFileSync('components/HostDashboard.tsx', host);
