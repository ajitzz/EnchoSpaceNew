const fs = require('fs');
let dash = fs.readFileSync('components/AdminDashboard.tsx', 'utf8');
dash = dash.replace(/import \{ Map, Compass \} import \{ MoreHorizontal \} from 'lucide-react';/, "import { Map, Compass, MoreHorizontal } from 'lucide-react';");
fs.writeFileSync('components/AdminDashboard.tsx', dash);
