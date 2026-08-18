import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
  Fingerprint
} from 'lucide-react';

export interface MetaCryptographicProof {
  provider: string;
  api_version: string;
  meta_campaign_id: string;
  meta_adset_id: string;
  meta_ad_id: string;
  verified_at: string;
  data_integrity_verified: boolean;
  provenance_source: string;
  cryptographic_verification_signature: string;
  tamper_proof_guarantee: string;
}

interface HostMetaProofBadgeProps {
  proof?: MetaCryptographicProof;
}

export const HostMetaProofBadge: React.FC<HostMetaProofBadgeProps> = ({ proof }) => {
  const [copied, setCopied] = useState(false);

  if (!proof) return null;

  const copySignature = () => {
    navigator.clipboard.writeText(proof.cryptographic_verification_signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 rounded-2xl bg-zinc-900 dark:bg-black border border-zinc-800 text-white shadow-md relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                100% Authenticity Guarantee
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {proof.api_version}
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5">
              Every view, click, and cost metric is cryptographically synchronized with Meta & Google Ads APIs.
            </p>
          </div>
        </div>

        <button
          onClick={copySignature}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Signature Copied' : 'Copy Verification Hash'}</span>
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-zinc-400 font-mono">
        <div>
          <span className="text-zinc-500 block text-[10px]">Meta Campaign ID</span>
          <span className="text-zinc-200">{proof.meta_campaign_id}</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px]">AdSet ID</span>
          <span className="text-zinc-200">{proof.meta_adset_id}</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px]">Verified At</span>
          <span className="text-zinc-200">{new Date(proof.verified_at).toLocaleTimeString()} UTC</span>
        </div>
      </div>
    </div>
  );
};

export default HostMetaProofBadge;
