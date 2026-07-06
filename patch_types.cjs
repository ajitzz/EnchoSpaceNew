const fs = require('fs');
let code = fs.readFileSync('types.ts', 'utf-8');
const searchStr = `export interface BookingData {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
}`;

const replaceStr = `export interface BookingData {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
    roomIds?: string[];
}`;

if (code.includes(searchStr)) {
    code = code.replace(searchStr, replaceStr);
    fs.writeFileSync('types.ts', code);
    console.log('Successfully patched types.ts!');
} else {
    console.log('Could not find target string in types.ts.');
}
