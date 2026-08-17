import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
  Lock,
  Loader2,
  X,
  AlertTriangle
} from 'lucide-react';

interface ActionPreview {
  action: string;
  current_state: string;
  what_will_happen: string;
  what_will_not_happen: string;
  why_allowed: string;
  expected_result: string;
  financial_impact: string;
  unknown_outcome_behavior: string;
}

interface AdminActionControlPanelProps {
  allowedActions?: string[];
  actionPreviews?: Record<string, ActionPreview>;
  campaignId: number | string;
  onActionComplete?: () => void;
}

export const AdminActionControlPanel: React.FC<AdminActionControlPanelProps> = ({
  allowedActions = [],
  actionPreviews = {},
  campaignId,
  onActionComplete
}) => {
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [actionPreview, setActionPreview] = useState<ActionPreview | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [rejectionFeedback, setRejectionFeedback] = useState<string>('Ad creative or targeting specifications require adjustments.');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const token = localStorage.getItem('token') || '';

  const handleOpenModal = (actionKey: string) => {
    setSelectedActionKey(actionKey);
    if (actionPreviews[actionKey]) {
      setActionPreview(actionPreviews[actionKey]);
    } else {
      setActionPreview({
        action: actionKey,
        current_state: 'Authorized state transition.',
        what_will_happen: `Execute ${actionKey} command on Meta campaign.`,
        what_will_not_happen: 'No unauthorized state or budget corruption will occur.',
        why_allowed: 'Admin authorization valid.',
        expected_result: 'State synchronizes across Meta and ENCHO databases.',
        financial_impact: 'Protected within contractual ledger.',
        unknown_outcome_behavior: 'Auto-reconciles on failure.'
      });
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedActionKey) return;
    setIsExecuting(true);
    try {
      let endpoint = `/api/admin/marketing/campaigns/${campaignId}/action`;
      const method = 'POST';
      let body: any = { action: selectedActionKey };

      if (selectedActionKey === 'APPROVE') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/approve`;
      } else if (selectedActionKey === 'REJECT') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/reject`;
        body = { feedback: rejectionFeedback };
      } else if (selectedActionKey === 'PAUSE' || selectedActionKey === 'EMERGENCY_PAUSE') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/pause`;
        if (selectedActionKey === 'EMERGENCY_PAUSE') body = { emergency: true };
      } else if (selectedActionKey === 'RESUME') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/resume`;
      } else if (selectedActionKey === 'RESYNC') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/resync`;
      } else if (selectedActionKey === 'RECONCILE') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/reconcile`;
      } else if (selectedActionKey === 'QUARANTINE') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/quarantine`;
      } else if (selectedActionKey === 'ROLLBACK') {
        endpoint = `/api/admin/marketing/campaigns/${campaignId}/rollback`;
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        setNotification({ type: 'success', message: data.message || `Action ${selectedActionKey} completed successfully.` });
        setSelectedActionKey(null);
        setActionPreview(null);
        if (onActionComplete) onActionComplete();
      } else {
        setNotification({ type: 'error', message: data.error || `Failed to execute ${selectedActionKey}.` });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Network error executing action.' });
    } finally {
      setIsExecuting(false);
    }
  };

  const renderActionButton = (actionKey: string) => {
    switch (actionKey) {
      case 'APPROVE':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('APPROVE')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Dispatch
          </button>
        );
      case 'REJECT':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('REJECT')}
            className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject with Feedback
          </button>
        );
      case 'PAUSE':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('PAUSE')}
            className="px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Pause className="w-3.5 h-3.5" /> Pause Delivery
          </button>
        );
      case 'EMERGENCY_PAUSE':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('EMERGENCY_PAUSE')}
            className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 animate-pulse"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Emergency Pause
          </button>
        );
      case 'RESUME':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('RESUME')}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Resume Campaign
          </button>
        );
      case 'RESYNC':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('RESYNC')}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-sync Truth
          </button>
        );
      case 'RECONCILE':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('RECONCILE')}
            className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> Deep Reconcile
          </button>
        );
      case 'QUARANTINE':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('QUARANTINE')}
            className="px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Quarantine
          </button>
        );
      case 'ROLLBACK':
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal('ROLLBACK')}
            className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Rollback & Refund
          </button>
        );
      default:
        return (
          <button
            key={actionKey}
            onClick={() => handleOpenModal(actionKey)}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl"
          >
            {actionKey}
          </button>
        );
    }
  };

  return (
    <div className="space-y-4" role="region" aria-label="Admin Action Controls">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
          role="alert"
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Allowed Actions Button Row */}
      <div className="flex flex-wrap items-center gap-2.5">
        {allowedActions.length === 0 ? (
          <span className="text-xs text-zinc-400 italic">No operational mutations currently required.</span>
        ) : (
          allowedActions.map(renderActionButton)
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedActionKey && actionPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
        >
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 id="action-modal-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Confirm {actionPreview.action || selectedActionKey}
              </h3>
              <button
                onClick={() => { setSelectedActionKey(null); setActionPreview(null); }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedActionKey === 'REJECT' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Rejection Reason for Host:
                </label>
                <textarea
                  value={rejectionFeedback}
                  onChange={(e) => setRejectionFeedback(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
            )}

            <div className="space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300 font-sans">
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">What will happen:</strong>
                <span>{actionPreview.what_will_happen}</span>
              </div>
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">What will NOT happen:</strong>
                <span>{actionPreview.what_will_not_happen}</span>
              </div>
              <div>
                <strong className="block text-zinc-900 dark:text-zinc-100 mb-0.5">Financial Impact:</strong>
                <span>{actionPreview.financial_impact}</span>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl text-[11px] text-zinc-500">
                <span>{actionPreview.unknown_outcome_behavior}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => { setSelectedActionKey(null); setActionPreview(null); }}
                disabled={isExecuting}
                className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={isExecuting}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isExecuting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isExecuting ? 'Executing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminActionControlPanel;
