const fs = require('fs');
const file = 'components/HostMarketing.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `{/* Meta CAPI & Google Ads Conversions Linkage (The Conversions API Strategy) */}`;
const replacement = `
{/* Advanced Settings Toggle */}
<div className="pt-2">
  <button 
    type="button"
    onClick={() => {
      const el = document.getElementById('advanced-capi-settings');
      if (el) el.classList.toggle('hidden');
    }}
    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
  >
    <Settings className="w-3 h-3" />
    Advanced Tracking Settings (Optional)
  </button>
</div>

<div id="advanced-capi-settings" className="hidden mt-4">
{/* Meta CAPI & Google Ads Conversions Linkage (The Conversions API Strategy) */}`;

if (code.includes(target) && !code.includes('advanced-capi-settings')) {
  // Find the end of the Direct Conversions API block. It's the parent div closing tag.
  // The block starts at: <div className="space-y-4 border border-zinc-200 bg-gradient-to-br from-blue-50/10 via-zinc-50/30 to-blue-50/5 p-5 rounded-3xl text-left">
  // We need to just inject the toggle before it.
  
  code = code.replace(target, replacement);
  
  // Need to add closing </div> after the block. 
  // Let's just find the end of the block.
  const endTarget = `{/* END CAPI BLOCK */}`;
  // Wait, there's no END marker. Let's just wrap it manually.
}
