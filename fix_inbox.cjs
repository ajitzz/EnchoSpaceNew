const fs = require('fs');
let code = fs.readFileSync('components/InboxPage.tsx', 'utf8');

const target = `  const [sending, setSending] = useState(false);`;
const replacement = `  const [sending, setSending] = useState(false);
  const [scoringIntent, setScoringIntent] = useState(false);

  const handleScoreIntent = async () => {
    if (!selectedThread) return;
    setScoringIntent(true);
    try {
      const res = await fetch(\`/api/marketing/threads/\${selectedThread}/score-intent\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${localStorage.getItem('token')}\` }
      });
      const data = await res.json();
      if (res.ok && data.intent_score) {
         setThreads(threads.map(t => t.id === selectedThread ? { ...t, lead_intent_score: data.intent_score } : t));
         // also update active thread locally if needed
         addToast('Lead Intent Scored: ' + data.intent_score, 'success');
      } else {
         addToast(data.error || 'Failed to score intent', 'error');
      }
    } catch(e) {
      addToast('Error scoring intent', 'error');
    } finally {
      setScoringIntent(false);
    }
  };`;

if(code.includes(target) && !code.includes('handleScoreIntent')) {
  code = code.replace(target, replacement);
}

const target2 = `                    <h3 className="font-semibold text-gray-900">{otherUser?.name}</h3>
                  </div>
                  <div className="flex gap-2">`;
                  
const replacement2 = `                    <h3 className="font-semibold text-gray-900">{otherUser?.name}</h3>
                  </div>
                  <div className="flex gap-2 items-center">
                    {activeThread?.lead_intent_score && activeThread.lead_intent_score !== 'neutral' && (
                       <span className={\`px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm \${
                          activeThread.lead_intent_score.includes('HOT') ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-orange-100/50' :
                          activeThread.lead_intent_score.includes('WARM') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          activeThread.lead_intent_score.includes('CONVERTED') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                       }\`}>
                         {activeThread.lead_intent_score}
                       </span>
                    )}
                    {user?.role === 'host' && (
                      <button 
                        onClick={handleScoreIntent}
                        disabled={scoringIntent}
                        className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors font-medium flex items-center gap-1.5 border border-indigo-200"
                      >
                        {scoringIntent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        AI Score Lead
                      </button>
                    )}`;

if (code.includes(target2) && !code.includes('AI Score Lead')) {
  code = code.replace(target2, replacement2);
}

const target3 = `import { Send, ArrowLeft, MoreVertical, Phone, Video, Info, FileText } from 'lucide-react';`;
const replacement3 = `import { Send, ArrowLeft, MoreVertical, Phone, Video, Info, FileText, Sparkles, Loader2 } from 'lucide-react';`;

if (code.includes(target3) && !code.includes('Sparkles')) {
  code = code.replace(target3, replacement3);
}

fs.writeFileSync('components/InboxPage.tsx', code);
console.log('Inbox fixed');
