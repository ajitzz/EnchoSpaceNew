const fs = require('fs');
let filter = fs.readFileSync('components/FilterBar.tsx', 'utf-8');

const oldIcons = `import { SlidersHorizontal, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Building2, Home, Tractor, Coffee, Ship, Tent, Caravan, Castle, Mountain, Box, Circle, Leaf } from 'lucide-react';`;

const newIcons = `import { SlidersHorizontal, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Building2, Home, Tractor, Coffee, Ship, Tent, Caravan, Castle, Mountain, Box, Circle, Leaf, Trees } from 'lucide-react';`;

const oldTypes = `const PROPERTY_TYPES = [
  { id: 'Apartment', label: 'Flat', icon: Building2 },
  { id: 'House', label: 'House', icon: Home },
  { id: 'Barn', label: 'Barn', icon: Tractor },`;

const newTypes = `const PROPERTY_TYPES = [
  { id: 'Resort', label: 'Resort', icon: Trees },
  { id: 'Apartment', label: 'Flat', icon: Building2 },
  { id: 'House', label: 'House', icon: Home },
  { id: 'Barn', label: 'Barn', icon: Tractor },`;

if (!filter.includes('Resort')) {
    if (filter.includes(oldIcons)) filter = filter.replace(oldIcons, newIcons);
    else filter = filter.replace("Leaf } from 'lucide-react';", "Leaf, Trees } from 'lucide-react';");
    
    filter = filter.replace(oldTypes, newTypes);
    fs.writeFileSync('components/FilterBar.tsx', filter);
    console.log('FilterBar patched');
}
