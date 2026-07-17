const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const target1 = `  const [refuelAmount, setRefuelAmount] = useState(100);`;
const replacement1 = `  const [refuelAmount, setRefuelAmount] = useState(100);
  const [isRefueling, setIsRefueling] = useState(false);`;

code = code.replace(target1, replacement1);

const target2 = `  const handleRefuel = async () => {
    try {
      const token = localStorage.getItem('token');
      const idempotencyKey = \`refuel_\${Date.now()}_\${Math.random().toString(36).substring(7)}\`;`;
const replacement2 = `  const handleRefuel = async () => {
    if (isRefueling) return;
    setIsRefueling(true);
    try {
      const token = localStorage.getItem('token');
      const idempotencyKey = \`refuel_\${Date.now()}_\${Math.random().toString(36).substring(7)}\`;`;

code = code.replace(target2, replacement2);

const target3 = `        addToast('Gateway Error', data.error || 'Failed to initialize refuel.', 'error');
      }
    } catch (err) {
      console.error('Refuel error:', err);
      addToast('System Error', 'Failed to reach payment gateway.', 'error');
    }
  };`;
const replacement3 = `        addToast('Gateway Error', data.error || 'Failed to initialize refuel.', 'error');
      }
    } catch (err) {
      console.error('Refuel error:', err);
      addToast('System Error', 'Failed to reach payment gateway.', 'error');
    } finally {
      setIsRefueling(false);
    }
  };`;

code = code.replace(target3, replacement3);

const target4 = `                 <button
                   onClick={handleRefuel}
                   className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-widest py-4 rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
                 >
                   Confirm Refuel
                 </button>`;
const replacement4 = `                 <button
                   onClick={handleRefuel}
                   disabled={isRefueling}
                   className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-sm uppercase tracking-widest py-4 rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
                 >
                   {isRefueling && <Loader2 className="w-4 h-4 animate-spin" />}
                   Confirm Refuel
                 </button>`;

code = code.replace(target4, replacement4);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Refuel loading state added');
