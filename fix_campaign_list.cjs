const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetList = `            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map(campaign => (
                <div 
                  key={campaign.id} 
                  className="bg-white border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-lg rounded-[1.5rem] p-5 transition-all cursor-pointer group flex flex-col justify-between h-full"
                  onClick={() => openAnalytics(campaign)}
                >`;

const replaceList = `            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
              {campaigns.map((campaign, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1, duration: 0.4 }}
                  key={campaign.id} 
                  className="bg-white border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-xl hover:-translate-y-1 rounded-[1.5rem] p-5 transition-all cursor-pointer group flex flex-col justify-between h-full"
                  onClick={() => openAnalytics(campaign)}
                >`;

if(code.includes(targetList)) {
    code = code.replace(targetList, replaceList);
    // don't forget to close AnimatePresence
    const targetCloseList = `                </div>
              ))}
            </div>`;
    const replaceCloseList = `                </motion.div>
              ))}
              </AnimatePresence>
            </div>`;
    code = code.replace(targetCloseList, replaceCloseList);
    console.log('Campaign List UI successfully polished!');
} else {
    console.log('Target Campaign List block not found.');
}

fs.writeFileSync('components/HostMarketing.tsx', code);
