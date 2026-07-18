const fs = require('fs');
let code = fs.readFileSync('components/Header.tsx', 'utf8');

const targetHeader = `            <button 
              onClick={() => onHostViewChange?.('marketing')} 
              className={\`hover:text-gray-900 transition-colors flex items-center gap-1.5 \${hostView === 'marketing' ? 'text-gray-900 border-b-2 border-gray-900' : ''}\`}
            >
              <span>Marketing</span>
              <span className="bg-blue-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-widest scale-90">Beta</span>
            </button>`;

const replaceHeader = `            <button 
              onClick={() => onHostViewChange?.('marketing')} 
              className={\`hover:text-gray-900 transition-colors flex items-center gap-1.5 \${hostView === 'marketing' ? 'text-gray-900 border-b-2 border-gray-900' : ''}\`}
            >
              <span className="font-bold">Marketing Engine</span>
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-widest scale-90 shadow-sm shadow-blue-500/20 relative flex items-center gap-1">
                <span className="w-1 h-1 bg-white rounded-full animate-pulse" /> AI
              </span>
            </button>`;

if(code.includes(targetHeader)) {
    code = code.replace(targetHeader, replaceHeader);
    console.log('Header polished!');
} else {
    console.log('Target Header block not found.');
}

fs.writeFileSync('components/Header.tsx', code);
