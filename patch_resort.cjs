const fs = require('fs');

let host = fs.readFileSync('components/HostForm.tsx', 'utf-8');

const oldTypes = `const PROPERTY_TYPES = [
  { id: 'Apartment', label: 'Flat/apartment', icon: Building2 },
  { id: 'House', label: 'House', icon: Home },
  { id: 'Barn', label: 'Barn', icon: Tractor },`;

const newTypes = `const PROPERTY_TYPES = [
  { id: 'Resort', label: 'Resort', icon: Trees },
  { id: 'Apartment', label: 'Flat/apartment', icon: Building2 },
  { id: 'House', label: 'House', icon: Home },
  { id: 'Barn', label: 'Barn', icon: Tractor },`;

if (!host.includes('Resort')) {
    host = host.replace(oldTypes, newTypes);
    
    if (!host.includes('Trees')) {
        host = host.replace('import { Building2, Home', 'import { Building2, Home, Trees');
    }
    fs.writeFileSync('components/HostForm.tsx', host);
}
console.log('HostForm resort patched');
