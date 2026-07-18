const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetCampaigns = `              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div 
                    key={campaign.id}
                    onClick={() => setSelectedCampaignForAnalytics(campaign)}
                    className={\`
                      bg-white p-5 rounded-3xl border transition-all duration-300 cursor-pointer text-left relative overflow-hidden
                      \${selectedCampaignForAnalytics?.id === campaign.id 
                        ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-md' 
                        : 'border-zinc-150 hover:border-zinc-300 hover:shadow-sm'}
                    \`}
                  >
                    <div className="flex gap-4">`;

const replaceCampaigns = `              <div className="space-y-4">
                <AnimatePresence>
                {campaigns.map((campaign, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.3, ease: "easeOut" }}
                    key={campaign.id}
                    onClick={() => setSelectedCampaignForAnalytics(campaign)}
                    className={\`
                      bg-white p-5 rounded-3xl border transition-all duration-300 cursor-pointer text-left relative overflow-hidden
                      \${selectedCampaignForAnalytics?.id === campaign.id 
                        ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg scale-[1.01]' 
                        : 'border-zinc-150 hover:border-zinc-300 hover:shadow-md'}
                    \`}
                  >
                    <div className="flex gap-4">`;

if(code.includes(targetCampaigns)) {
    code = code.replace(targetCampaigns, replaceCampaigns);
    
    // add close tag
    const targetClose = `                  </div>
                ))}
              </div>`;
    const replaceClose = `                  </motion.div>
                ))}
                </AnimatePresence>
              </div>`;
    code = code.replace(targetClose, replaceClose);

    console.log('Campaign items polished!');
} else {
    console.log('Target Campaign items not found.');
}

fs.writeFileSync('components/HostMarketing.tsx', code);
