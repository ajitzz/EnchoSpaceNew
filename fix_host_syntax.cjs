const fs = require('fs');
let file = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const target = `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="space-y-4 md:col-span-3">`;
const replacement = `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-4 md:col-span-3">`;

file = file.replace(target, replacement);

const target2 = `</div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Unit Name / Type</label>`;
const replacement2 = `</div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-700 uppercase">Unit Name / Type</label>`;
// Actually, since Div A was missing a closing tag, removing its opening tag `<div className="space-y-2">` fixes the nesting exactly!

fs.writeFileSync('components/HostForm.tsx', file);
console.log('HostForm syntax fixed');
