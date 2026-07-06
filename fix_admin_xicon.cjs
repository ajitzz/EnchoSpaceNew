const fs = require('fs');
let file = fs.readFileSync('components/AdminDashboard.tsx', 'utf-8');
file = file.replace(
  "import { HomeIcon, ListIcon,  TrashIcon, EditIcon, CheckCircle2Icon, UserIcon } from './Icons';",
  "import { HomeIcon, ListIcon,  TrashIcon, EditIcon, CheckCircle2Icon, UserIcon, XIcon } from './Icons';"
);
fs.writeFileSync('components/AdminDashboard.tsx', file);
