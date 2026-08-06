const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

const targetStaircase = `                            {[
                              { label: '1. Ad Impressions', val: selectedCampaignForAnalytics.analytics?.impressions || 15000, desc: 'Metropolitan Reach', color: 'from-blue-500 to-indigo-500' },
                              { label: '2. Page Link Clicks', val: selectedCampaignForAnalytics.analytics?.clicks || 650, desc: 'Active Property Visits', color: 'from-indigo-500 to-violet-500' },
                              { label: '3. CRM Leads', val: campaignLeads?.leads?.length || 12, desc: \`\${Math.round(((campaignLeads?.leads?.length || 12) / (selectedCampaignForAnalytics.analytics?.clicks || 650)) * 100)}% Conversion\`, color: 'from-violet-500 to-fuchsia-500' },
                              { label: '4. Direct Bookings', val: selectedCampaignForAnalytics.analytics?.conversions || 2, desc: 'Closed Nights', color: 'from-emerald-400 to-emerald-600' },
                            ].map((step, idx) => (`

const newStaircase = `                            {[
                              { label: '1. Ad Impressions', val: selectedCampaignForAnalytics.analytics?.impressions || 15000, desc: 'Advantage+ Reach', color: 'from-blue-500 to-indigo-500' },
                              { label: '2. Native Form Opens', val: selectedCampaignForAnalytics.analytics?.clicks || 650, desc: 'Instant Meta Forms', color: 'from-indigo-500 to-violet-500' },
                              { label: '3. CRM Native Leads', val: campaignLeads?.leads?.length || 12, desc: \`\${Math.round(((campaignLeads?.leads?.length || 12) / (selectedCampaignForAnalytics.analytics?.clicks || 650)) * 100)}% Conv. Rate\`, color: 'from-violet-500 to-fuchsia-500' },
                              { label: '4. Direct Bookings', val: selectedCampaignForAnalytics.analytics?.conversions || 2, desc: 'Closed CRM Deals', color: 'from-emerald-400 to-emerald-600' },
                            ].map((step, idx) => (`

code = code.replace(targetStaircase, newStaircase);

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Updated Funnel for Native Leads');
