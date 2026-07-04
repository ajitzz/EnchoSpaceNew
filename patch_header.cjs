const fs = require('fs');
let code = fs.readFileSync('components/Header.tsx', 'utf8');

// Remove Mobile Menu Icon block
const menuIconStart = code.indexOf('{/* Mobile Menu Icon - Trigger for Side Drawer */}');
const menuIconEnd = code.indexOf('{/* Desktop Account Dropdown */}');
if (menuIconStart !== -1 && menuIconEnd !== -1) {
   code = code.substring(0, menuIconStart) + code.substring(menuIconEnd);
}

// Remove MOBILE SIDE DRAWER
const drawerStart = code.indexOf('{/* MOBILE SIDE DRAWER (Advanced UI) */}');
const drawerEnd = code.lastIndexOf('</>');
if (drawerStart !== -1 && drawerEnd !== -1) {
   code = code.substring(0, drawerStart) + code.substring(drawerEnd);
}

// Ensure the Mobile padding for body is set (we'll do that in css or body)
fs.writeFileSync('components/Header.tsx', code);
