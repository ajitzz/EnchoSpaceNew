import React from 'react';
import { CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { getCampaignReadiness, type CampaignReadinessInput } from '../lib/campaignReadiness';

export function CampaignReadinessStrip({ campaign }: { campaign: CampaignReadinessInput }) {
  const state = getCampaignReadiness(campaign);
  const steps = [
    { label: 'Admin approval', done: state.approved },
    { label: 'Policy review', done: state.policyCleared },
    { label: 'Payment recorded', done: state.funded },
    { label: 'Funds released', done: state.escrowReleased },
  ];
  return (
    <section className="campaign-readiness" aria-label="Campaign publishing requirements">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck size={18} aria-hidden="true" />
        {state.canPublish ? 'Ready for publishing checks' : 'Publishing requirements'}
      </div>
      <ol className="grid grid-cols-2 gap-3 mt-3 xl:grid-cols-4">
        {steps.map(step => (
          <li key={step.label} className={`flex items-start gap-2 text-sm ${step.done ? 'text-emerald-800' : 'text-slate-600'}`}>
            {step.done ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> : <Clock3 size={16} className="shrink-0 mt-0.5" aria-hidden="true" />}
            <span>{step.label}<span className="sr-only">: {step.done ? 'complete' : 'pending'}</span></span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-slate-600 mt-3">Approval, payment and delivery are separate. Network status confirms when an ad is running.</p>
    </section>
  );
}
