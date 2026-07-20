const fs = require('fs');
const file = 'components/HostMarketing.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `{/* Meta CAPI & Google Ads Conversions Linkage (The Conversions API Strategy) */}`;
const replacement = `{/* Encho Automated Conversion Tracking */}
<div className="space-y-4 border border-green-500/20 bg-gradient-to-br from-green-50/50 via-zinc-50/50 to-green-50/10 p-5 rounded-3xl text-left">
  <div className="flex items-start gap-3">
    <div className="mt-1">
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
        <Target className="w-4 h-4 text-green-700" />
      </div>
    </div>
    <div>
      <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
        Encho Automated Tracking
        <span className="bg-green-100 text-green-800 text-[9px] px-2 py-0.5 rounded-full font-mono">ACTIVE</span>
      </h4>
      <p className="text-[10px] text-zinc-500 font-light leading-relaxed mt-1">
        Because you are using the Encho Master Marketing Engine, conversion tracking is fully automated. Encho's server-to-server Conversions API (CAPI) handles all iOS tracking limits and ad-blockers for you.
      </p>
    </div>
  </div>
</div>`;

// Find the start of the block and the end of the block.
const startIdx = code.indexOf(target);
if (startIdx !== -1) {
  // Find the end of the div that contains this block. It ends around line 3574
  const endMarker = `</label>\n                                <input`;
  // Let's just use a regex or string replacement if we can safely target it.
  
  // It's safer to just replace the whole section between the target and the next logical section
  const sectionEnd = code.indexOf(`{/* AI Pre-Check & Score Simulation */}`, startIdx);
  if (sectionEnd !== -1) {
    code = code.substring(0, startIdx) + replacement + '\n\n                        ' + code.substring(sectionEnd);
    fs.writeFileSync(file, code);
    console.log('Successfully patched CAPI section in HostMarketing.tsx');
  } else {
    console.log('Could not find section end');
  }
} else {
  console.log('Could not find target');
}
