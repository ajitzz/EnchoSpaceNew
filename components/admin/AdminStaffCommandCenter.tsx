import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  Lock,
  Unlock,
  LogOut,
  Sliders,
  CheckCircle2,
  XCircle,
  Search,
  Check,
  Copy,
  ExternalLink,
  Activity,
  Zap,
  Clock,
  Terminal,
  FileText,
  DollarSign,
  Radio,
  Eye,
  AlertOctagon,
  ChevronDown,
  QrCode,
  ArrowRight,
} from 'lucide-react';

interface Props {
  token?: string;
}

interface DepartmentTelemetry {
  department: string;
  headcount: number;
  activeHeadcount: number;
  suspendedHeadcount: number;
  activeSessions: number;
  roles: string[];
}

interface GlobalStats {
  totalStaff: number;
  activeStaff: number;
  suspendedStaff: number;
  activeSessions: number;
  pendingApprovals: number;
  emergencyQuarantineActive: boolean;
}

interface StaffMember {
  membershipId: string;
  userId: number;
  fullName: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  version: number;
  department: string;
  roleKey: string;
  roleName: string;
  environment: string;
  scopeType: string;
  scopeId: string;
  maxDailySpendPaise: number;
  activeSessions: number;
  lastActiveAt: string | null;
  claimedTasksCount: number;
  acceptedAt: string;
  expiresAt: string | null;
  suspendedAt: string | null;
  offboardedAt: string | null;
}

interface PendingAuthorization {
  authorizationId: string;
  permissionCode: string;
  resourceType: string;
  resourceId: string;
  environment: string;
  amountMinor: number | null;
  status: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  makerName: string;
  makerEmail: string;
  makerMembershipId: string;
}

interface IamAuditEvent {
  id: string;
  sequence: number;
  actorUserId: number;
  actorName: string;
  actorEmail: string;
  eventType: string;
  entityType: string;
  entityId: string;
  previousHash: string | null;
  newHash: string | null;
  evidence: Record<string, any>;
  reason: string;
  createdAt: string;
}

const DEPARTMENTS = [
  { id: 'marketing', name: 'Marketing Operations', desc: 'Campaign flight, ad strategy & publisher pipelines' },
  { id: 'creative', name: 'Creative & Policy', desc: 'Listing media audit, copyright & compliance checks' },
  { id: 'approvals', name: 'Campaign Quality & Approvals', desc: 'Dual-control independent reviewer desk' },
  { id: 'adtech', name: 'AdTech & Provider Integrations', desc: 'Meta/Google Ad accounts & pause-circuit automation' },
  { id: 'finance', name: 'Finance & Revenue Risk', desc: 'Settlements, GST tax ledger & refund governance' },
  { id: 'safety', name: 'Incident Response & Safety', desc: 'Platform safety, blast-radius mitigation & pauses' },
  { id: 'support', name: 'Customer Care & Support', desc: 'Guest & host disputes, concierge & escalation desk' },
  { id: 'audit', name: 'Statutory Audit & Governance', desc: 'Read-only immutable cryptographic verification desk' },
];

const DEPARTMENT_ROLES: Record<string, { key: string; name: string; desc: string }[]> = {
  marketing: [
    { key: 'campaign_operator', name: 'Campaign Operator', desc: 'Drafts and executes campaign parameters from policy' },
    { key: 'strategy_architect', name: 'Strategy Architect', desc: 'Designs target audience corridors and bids' },
    { key: 'strategy_publisher', name: 'Strategy Publisher', desc: 'Independently publishes reviewed ad strategies' },
  ],
  creative: [
    { key: 'creative_policy_reviewer', name: 'Creative & Policy Reviewer', desc: 'Reviews rights, media quality, and claim accuracy' },
  ],
  approvals: [
    { key: 'campaign_approver', name: 'Campaign Approver', desc: 'Dual-control reviewer for live ad campaigns' },
  ],
  adtech: [
    { key: 'provider_operator', name: 'Provider Operator', desc: 'Manages Meta/Google API bridges and rate limits' },
  ],
  finance: [
    { key: 'finance_risk_reviewer', name: 'Finance & Risk Reviewer', desc: 'Reviews large refunds (>₹15k) and settlements' },
  ],
  safety: [
    { key: 'incident_commander', name: 'Incident Commander', desc: 'Executes time-critical emergency safety holds' },
  ],
  support: [
    { key: 'support_analyst', name: 'Support Analyst', desc: 'Assists guest and host service conversations' },
  ],
  audit: [
    { key: 'auditor', name: 'Statutory Auditor', desc: 'Read-only access to immutable Merkle hash logs' },
  ],
};

export const AdminStaffCommandCenter: React.FC<Props> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'departments' | 'authorizations' | 'audit'>('roster');
  const [loading, setLoading] = useState(true);
  const [telemetry, setTelemetry] = useState<Record<string, DepartmentTelemetry>>({});
  const [stats, setStats] = useState<GlobalStats>({
    totalStaff: 0,
    activeStaff: 0,
    suspendedStaff: 0,
    activeSessions: 0,
    pendingApprovals: 0,
    emergencyQuarantineActive: false,
  });
  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [authorizations, setAuthorizations] = useState<PendingAuthorization[]>([]);
  const [auditEvents, setAuditEvents] = useState<IamAuditEvent[]>([]);
  const [merkleStatus, setMerkleStatus] = useState<{
    verified?: boolean;
    totalEvents?: number;
    headHash?: string;
    brokenAtSequence?: number | null;
    reason?: string;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isHireOpen, setIsHireOpen] = useState(false);
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [selectedStaffForQuota, setSelectedStaffForQuota] = useState<StaffMember | null>(null);
  const [newQuotaPaise, setNewQuotaPaise] = useState<number>(5000000);
  const [hiredResult, setHiredResult] = useState<{
    magicLink: string;
    invitationToken: string;
    email: string;
    roleKey: string;
  } | null>(null);
  const [isCommandHudOpen, setIsCommandHudOpen] = useState(false);
  const [hudQuery, setHudQuery] = useState('');
  const [showQrCode, setShowQrCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Hiring Form State
  const [hireForm, setHireForm] = useState({
    fullName: '',
    email: '',
    department: 'marketing',
    roleKey: 'campaign_operator',
    environment: 'PRODUCTION',
    maxDailySpendPaise: 5000000, // ₹50,000 INR
    hiringReason: 'Authorized workforce hiring for operational scalability and desk staffing.',
  });
  const [sodWarning, setSodWarning] = useState<string | null>(null);

  // Emergency Freeze Form
  const [freezeTier, setFreezeTier] = useState<1 | 2 | 3>(1);
  const [freezeTargetId, setFreezeTargetId] = useState('');
  const [freezeDepartment, setFreezeDepartment] = useState('marketing');
  const [freezeReason, setFreezeReason] = useState('Emergency platform security intervention and blast-radius containment.');

  const getAuthHeader = useCallback(() => {
    const t = token || localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }, [token]);

  // Load Overview Data
  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/workforce/overview', { credentials: 'include', headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data.departmentTelemetry || {});
        setStats(data.globalStats || {});
      }
    } catch (e) {
      console.error('Failed to load workforce overview', e);
    }
  }, [getAuthHeader]);

  // Load Staff Roster
  const loadRoster = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (departmentFilter) params.append('department', departmentFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/admin/workforce/roster?${params.toString()}`, { credentials: 'include', headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setRoster(data.staff || []);
      }
    } catch (e) {
      console.error('Failed to load roster', e);
    }
  }, [getAuthHeader, searchQuery, departmentFilter, statusFilter]);

  // Load Authorizations
  const loadAuthorizations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/workforce/authorizations', { credentials: 'include', headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setAuthorizations(data.authorizations || []);
      }
    } catch (e) {
      console.error('Failed to load authorizations', e);
    }
  }, [getAuthHeader]);

  // Load Audit Trail
  const loadAuditTrail = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/workforce/audit?limit=50', { credentials: 'include', headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setAuditEvents(data.events || []);
      }
    } catch (e) {
      console.error('Failed to load audit trail', e);
    }
  }, [getAuthHeader]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadRoster(), loadAuthorizations(), loadAuditTrail()]);
      setLoading(false);
    };
    init();
  }, [loadOverview, loadRoster, loadAuthorizations, loadAuditTrail]);

  // Global Command HUD (Cmd + K / Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandHudOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsCommandHudOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time SoD Pre-Check
  useEffect(() => {
    if (hireForm.roleKey) {
      fetch('/api/admin/workforce/validate-sod', {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ targetRoleKey: hireForm.roleKey }),
      })
        .then(res => res.json())
        .then(data => {
          if (!data.allowed) {
            setSodWarning(data.violation || 'Segregation of Duties Conflict Detected');
          } else {
            setSodWarning(null);
          }
        })
        .catch(() => setSodWarning(null));
    }
  }, [hireForm.roleKey, getAuthHeader]);

  // Handle Hire Submit
  const handleHireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/workforce/hire', {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(hireForm),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Hiring Failed: ${data.error}`);
        return;
      }
      setHiredResult({
        magicLink: data.magicLink,
        invitationToken: data.invitationToken,
        email: data.email,
        roleKey: data.roleKey,
      });
      loadOverview();
      loadRoster();
      loadAuditTrail();
    } catch (err: any) {
      alert(`Hiring Error: ${err.message}`);
    }
  };

  // Handle Lifecycle Action
  const handleLifecycle = async (membershipId: string, action: 'SUSPEND' | 'RESUME' | 'REVOKE_SESSIONS' | 'OFFBOARD') => {
    const reasonPrompt = prompt(`Enter mandatory justification for ${action}:`, `Administrative ${action.toLowerCase()} action executed via God-Mode portal.`);
    if (!reasonPrompt || reasonPrompt.trim().length < 10) {
      alert('Justification must be at least 10 characters.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/workforce/members/${membershipId}/lifecycle`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ action, reason: reasonPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Lifecycle Action Failed: ${data.error}`);
        return;
      }
      loadOverview();
      loadRoster();
      loadAuditTrail();
    } catch (err: any) {
      alert(`Error executing lifecycle: ${err.message}`);
    }
  };

  // Handle Quota Adjustment
  const handleQuotaSubmit = async () => {
    if (!selectedStaffForQuota) return;
    const reasonPrompt = prompt('Enter justification for quota modification:', 'Operational spend quota adjustment approved by Admin.');
    if (!reasonPrompt || reasonPrompt.trim().length < 10) {
      alert('Justification must be at least 10 characters.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/workforce/members/${selectedStaffForQuota.membershipId}/quotas`, {
        method: 'PATCH',
        headers: getAuthHeader(),
        body: JSON.stringify({ maxDailySpendPaise: newQuotaPaise, reason: reasonPrompt.trim() }),
      });
      if (res.ok) {
        setIsQuotaModalOpen(false);
        loadRoster();
        loadAuditTrail();
      }
    } catch (err: any) {
      alert(`Error updating quota: ${err.message}`);
    }
  };

  // Handle Maker-Checker Ratification
  const handleRatify = async (authorizationId: string, decision: 'APPROVE' | 'REJECT') => {
    const reasonPrompt = prompt(`Enter justification for ${decision}:`, `Dual-control ${decision.toLowerCase()} by Platform Admin.`);
    if (!reasonPrompt || reasonPrompt.trim().length < 10) {
      alert('Justification must be at least 10 characters.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/workforce/authorizations/${authorizationId}/decision`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ decision, reason: reasonPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Ratification failed: ${data.error}`);
        return;
      }
      loadAuthorizations();
      loadOverview();
      loadAuditTrail();
    } catch (err: any) {
      alert(`Ratification error: ${err.message}`);
    }
  };

  // Handle Merkle Chain Verification
  const handleVerifyChain = async () => {
    try {
      const res = await fetch('/api/admin/workforce/audit/verify-chain', {
        method: 'POST',
        headers: getAuthHeader(),
      });
      const data = await res.json();
      setMerkleStatus(data);
    } catch (err: any) {
      alert(`Verification error: ${err.message}`);
    }
  };

  // Handle Emergency Freeze
  const handleEmergencyFreezeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('CAUTION: Are you sure you want to execute this Emergency Freeze action? This will immediately sever staff access.')) {
      return;
    }
    try {
      const res = await fetch('/api/admin/workforce/emergency-freeze', {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({
          tier: freezeTier,
          targetMembershipId: freezeTier === 1 ? freezeTargetId : undefined,
          department: freezeTier === 2 ? freezeDepartment : undefined,
          reason: freezeReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Freeze failed: ${data.error}`);
        return;
      }
      alert(`Emergency Freeze Executed: ${data.frozenCount} members suspended, ${data.sessionsRevoked} sessions terminated.`);
      setIsFreezeModalOpen(false);
      loadOverview();
      loadRoster();
      loadAuditTrail();
    } catch (err: any) {
      alert(`Freeze error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-indigo-950/40 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                FAANG L7/L8 IAM Engine
              </span>
              <span className="text-xs text-slate-400 font-mono">Master Org ID: 00000000-0000-4000-8000-000000000001</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Workforce Command Center
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-mono">
                GOD-MODE
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Enterprise staff authority management, Segregation of Duties (SoD) gatekeeper, blast-radius spend controls, and nuclear kill-switches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setHudQuery('');
                setIsCommandHudOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors shadow-sm"
              title="Global Command Palette (Press ⌘K or Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>⌘K</span>
            </button>

            <button
              onClick={() => {
                setHiredResult(null);
                setIsHireOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-indigo-500/20"
            >
              <UserPlus className="w-4 h-4" />
              Hire Staff Member
            </button>

            <button
              onClick={handleVerifyChain}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Terminal className="w-4 h-4 text-emerald-400" />
              Verify Merkle Chain
            </button>

            <button
              onClick={() => setIsFreezeModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-sm font-medium transition-colors"
            >
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              Emergency Freeze
            </button>
          </div>
        </div>

        {/* Global Telemetry KPI Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Staff</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{stats.totalStaff}</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">{stats.activeStaff} Active on duty</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Live Staff Sessions</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.activeSessions}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">__Host-encho_workforce bound</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Dual-Control Approvals</span>
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{stats.pendingApprovals}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Pending Maker-Checker reviews</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Suspended Staff</span>
              <Lock className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{stats.suspendedStaff}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Isolated from work queues</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Quarantine Status</span>
              <Radio className={`w-4 h-4 ${stats.emergencyQuarantineActive ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`} />
            </div>
            <div className={`text-lg font-bold mt-1 ${stats.emergencyQuarantineActive ? 'text-rose-400' : 'text-emerald-400'}`}>
              {stats.emergencyQuarantineActive ? 'QUARANTINED' : 'NORMAL (GREEN)'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Zero-Bypass active</div>
          </div>
        </div>

        {/* Cryptographic Merkle Status Badge if verified */}
        {merkleStatus && (
          <div className={`mt-4 p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
            merkleStatus.verified
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {merkleStatus.verified ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
              <span>
                {merkleStatus.verified
                  ? `Merkle Audit Chain 100% Cryptographically Verified across ${merkleStatus.totalEvents} events. Head Hash: ${merkleStatus.headHash?.slice(0, 16)}...`
                  : `CRYPTO INTEGRITY BREACH: Chain broken at sequence #${merkleStatus.brokenAtSequence}: ${merkleStatus.reason}`}
              </span>
            </div>
            <button onClick={() => setMerkleStatus(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'roster'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Staff Roster & Telemetry
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            {roster.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'departments'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Shield className="w-4 h-4" />
          Department Pulse Matrix
        </button>

        <button
          onClick={() => setActiveTab('authorizations')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'authorizations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Dual-Control Maker-Checker Desk
          {authorizations.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
              {authorizations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Merkle Audit Trail
        </button>
      </div>

      {/* TAB 1: STAFF ROSTER */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search staff by name or email..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="OFFBOARDED">Offboarded</option>
              </select>

              <button
                onClick={loadRoster}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                title="Refresh Roster"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3">Staff Identity</th>
                    <th className="px-6 py-3">Department & Role</th>
                    <th className="px-6 py-3">Spend Ceiling</th>
                    <th className="px-6 py-3">Sessions & Tasks</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">God-Mode Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        No staff members found matching the criteria. Click &quot;Hire Staff Member&quot; to provision someone.
                      </td>
                    </tr>
                  ) : (
                    roster.map(staff => (
                      <tr key={staff.membershipId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{staff.fullName}</div>
                          <div className="text-xs text-gray-500 font-mono">{staff.email}</div>
                          <div className="text-[11px] text-gray-400 font-mono mt-0.5">UID #{staff.userId}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {staff.department.toUpperCase()}
                          </div>
                          <div className="font-medium text-gray-900 text-xs mt-1">{staff.roleName || staff.roleKey}</div>
                          <div className="text-[11px] text-gray-500 font-mono">Env: {staff.environment}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">
                            ₹{(staff.maxDailySpendPaise / 100).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[11px] text-gray-400">Daily Max Spend</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                              staff.activeSessions > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <Activity className="w-3 h-3" />
                              {staff.activeSessions} active
                            </span>
                            <span className="text-xs text-gray-500">
                              {staff.claimedTasksCount} tasks
                            </span>
                          </div>
                          {staff.lastActiveAt && (
                            <div className="text-[11px] text-gray-400 mt-1">
                              Last active: {new Date(staff.lastActiveAt).toLocaleTimeString()}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {staff.status === 'ACTIVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              Active
                            </span>
                          )}
                          {staff.status === 'SUSPENDED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                              <Lock className="w-3 h-3" />
                              Suspended
                            </span>
                          )}
                          {staff.status === 'OFFBOARDED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                              <XCircle className="w-3 h-3" />
                              Offboarded
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {staff.status === 'ACTIVE' ? (
                              <button
                                onClick={() => handleLifecycle(staff.membershipId, 'SUSPEND')}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded border border-amber-200 transition-colors"
                                title="Emergency Suspend"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            ) : staff.status === 'SUSPENDED' ? (
                              <button
                                onClick={() => handleLifecycle(staff.membershipId, 'RESUME')}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200 transition-colors"
                                title="Resume Access"
                              >
                                <Unlock className="w-4 h-4" />
                              </button>
                            ) : null}

                            <button
                              onClick={() => handleLifecycle(staff.membershipId, 'REVOKE_SESSIONS')}
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                              title="Force Logout (Revoke Sessions)"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => {
                                setSelectedStaffForQuota(staff);
                                setNewQuotaPaise(staff.maxDailySpendPaise);
                                setIsQuotaModalOpen(true);
                              }}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 transition-colors"
                              title="Adjust Spend Quota"
                            >
                              <Sliders className="w-4 h-4" />
                            </button>

                            {staff.status !== 'OFFBOARDED' && (
                              <button
                                onClick={() => handleLifecycle(staff.membershipId, 'OFFBOARD')}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
                                title="Permanently Offboard"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENT PULSE MATRIX */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEPARTMENTS.map(dept => {
            const data = telemetry[dept.id] || {
              department: dept.id,
              headcount: 0,
              activeHeadcount: 0,
              suspendedHeadcount: 0,
              activeSessions: 0,
              roles: [],
            };
            return (
              <div
                key={dept.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {dept.id.toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      data.activeSessions > 0 ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      <Activity className="w-3.5 h-3.5" />
                      {data.activeSessions} online
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{dept.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{dept.desc}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <span className="text-gray-500">Headcount</span>
                      <div className="font-bold text-gray-900 text-base">{data.headcount}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <span className="text-gray-500">Suspended</span>
                      <div className={`font-bold text-base ${data.suspendedHeadcount > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                        {data.suspendedHeadcount}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setDepartmentFilter(dept.id);
                      setActiveTab('roster');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    View Roster →
                  </button>

                  <button
                    onClick={() => {
                      setFreezeTier(2);
                      setFreezeDepartment(dept.id);
                      setIsFreezeModalOpen(true);
                    }}
                    className="text-xs font-medium text-rose-600 hover:text-rose-800"
                  >
                    Freeze Dept
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: DUAL-CONTROL MAKER-CHECKER RATIFICATION DESK */}
      {activeTab === 'authorizations' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <h4 className="font-bold">Dual-Control Maker-Checker Gatekeeper</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                FAANG L7/L8 compliance prohibits unilateral operational actions on guest funds &gt; ₹15,000 INR or live campaign unpauses &gt; ₹10,000 INR. As Admin/Platform Owner, ratify or reject staged actions below.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {authorizations.length === 0 ? (
              <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <h4 className="font-semibold text-gray-700">All Clear</h4>
                <p className="text-xs text-gray-500 mt-1">No pending Maker-Checker approvals requiring ratification.</p>
              </div>
            ) : (
              authorizations.map(auth => (
                <div key={auth.authorizationId} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      {auth.permissionCode}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      Expires: {new Date(auth.expiresAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Resource Target</div>
                    <div className="font-semibold text-gray-900 font-mono text-sm">
                      {auth.resourceType} : {auth.resourceId}
                    </div>
                  </div>

                  {auth.amountMinor && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Staged Transaction Amount</span>
                      <span className="text-base font-bold text-gray-900">
                        ₹{(auth.amountMinor / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-800">Maker Stated Justification: </span>
                    {auth.reason}
                  </div>

                  <div className="text-xs text-gray-500 flex items-center justify-between pt-2 border-t border-gray-100">
                    <span>Requested by: <strong className="text-gray-700">{auth.makerName}</strong> ({auth.makerEmail})</span>
                    <span>{new Date(auth.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handleRatify(auth.authorizationId, 'APPROVE')}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                      Ratify & Approve
                    </button>
                    <button
                      onClick={() => handleRatify(auth.authorizationId, 'REJECT')}
                      className="flex-1 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-700 border border-rose-200 rounded-lg text-sm font-semibold transition-colors"
                    >
                      Reject Action
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CRYPTOGRAPHIC MERKLE AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Immutable SHA-256 Merkle Chained Audit Log</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Every workforce creation, role grant, suspension, and maker-checker approval is cryptographically chained.
              </p>
            </div>
            <button
              onClick={handleVerifyChain}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              Re-Verify 100% Chain
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-gray-50 text-gray-500 uppercase font-semibold border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Seq #</th>
                    <th className="px-4 py-3">Event Kind</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Hash Link (Previous → New)</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-600">
                  {auditEvents.map(evt => (
                    <tr key={evt.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">#{evt.sequence}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                          {evt.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{evt.actorName || `UID #${evt.actorUserId}`}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {evt.entityType}:{evt.entityId.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-500">
                        {evt.previousHash?.slice(0, 8)}... → <strong className="text-emerald-700">{evt.newHash?.slice(0, 8)}...</strong>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-gray-700" title={evt.reason}>
                        {evt.reason}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: HIRE STAFF DRAWER / MODAL */}
      {isHireOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {hiredResult ? (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Staff Successfully Hired &amp; Bound</h3>
                  <p className="text-xs text-gray-500">
                    Account provisioned with restricted workforce credentials. Provide the magic onboarding link below to the staff member.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 font-mono text-xs">
                  <div className="text-gray-500">Staff Email: <strong className="text-gray-900">{hiredResult.email}</strong></div>
                  <div className="text-gray-500">Assigned Role: <strong className="text-indigo-600">{hiredResult.roleKey}</strong></div>
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-gray-500 mb-1">Magic Onboarding URL:</div>
                    <div className="p-2 bg-white border border-slate-300 rounded text-slate-800 break-all select-all font-mono text-[11px]">
                      {hiredResult.magicLink}
                    </div>
                  </div>
                </div>

                {/* QR Code toggle */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowQrCode(!showQrCode)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>{showQrCode ? 'Hide QR Code' : 'Display Onboarding QR Code'}</span>
                  </button>
                  <span className="text-[11px] text-gray-400">Valid for 7 days</span>
                </div>

                {showQrCode && (
                  <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <div className="p-3 bg-white border-2 border-slate-900 rounded-lg shadow-sm">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(hiredResult.magicLink)}`}
                        alt="Onboarding QR Code"
                        className="w-40 h-40 object-contain"
                        loading="lazy"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 text-center">
                      Scan with employee device camera to immediately onboard into Operations Workspace.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(hiredResult.magicLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedLink ? 'Copied Link!' : 'Copy Magic Link'}
                  </button>
                  <button
                    onClick={() => setIsHireOpen(false)}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleHireSubmit} className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Hire Staff Member</h3>
                    <p className="text-xs text-gray-500">Provisions restricted workforce credentials directly into IAM.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHireOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                {sodWarning && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{sodWarning}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Full Legal Name</label>
                    <input
                      type="text"
                      required
                      value={hireForm.fullName}
                      onChange={e => setHireForm({ ...hireForm, fullName: e.target.value })}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Work / Corporate Email</label>
                    <input
                      type="email"
                      required
                      value={hireForm.email}
                      onChange={e => setHireForm({ ...hireForm, email: e.target.value })}
                      placeholder="e.g. rahul.marketing@encho.in"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Department</label>
                      <select
                        value={hireForm.department}
                        onChange={e => {
                          const dept = e.target.value;
                          const firstRole = DEPARTMENT_ROLES[dept]?.[0]?.key || 'campaign_operator';
                          setHireForm({ ...hireForm, department: dept, roleKey: firstRole });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        {DEPARTMENTS.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned Role</label>
                      <select
                        value={hireForm.roleKey}
                        onChange={e => setHireForm({ ...hireForm, roleKey: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        {(DEPARTMENT_ROLES[hireForm.department] || []).map(r => (
                          <option key={r.key} value={r.key}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Max Daily Spend Blast-Radius (₹ INR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={hireForm.maxDailySpendPaise / 100}
                      onChange={e => setHireForm({ ...hireForm, maxDailySpendPaise: Number(e.target.value) * 100 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-900"
                    />
                    <span className="text-[11px] text-gray-400">Default ₹50,000 INR per day</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Hiring Justification (Mandatory)</label>
                    <textarea
                      required
                      rows={2}
                      value={hireForm.hiringReason}
                      onChange={e => setHireForm({ ...hireForm, hiringReason: e.target.value })}
                      placeholder="Audit justification for adding this personnel to Encho workforce..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsHireOpen(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-sm"
                  >
                    Hire &amp; Generate Magic Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: SPEND QUOTA ADJUSTMENT */}
      {isQuotaModalOpen && selectedStaffForQuota && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Adjust Spend Quota Ceiling</h3>
            <p className="text-xs text-gray-500">
              Modifies maximum operator blast-radius daily spend ceiling for <strong>{selectedStaffForQuota.fullName}</strong>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Max Daily Spend (₹ INR)</label>
              <input
                type="number"
                min={0}
                step={5000}
                value={newQuotaPaise / 100}
                onChange={e => setNewQuotaPaise(Number(e.target.value) * 100)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base font-bold text-gray-900"
              />
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuotaSubmit}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold shadow-sm"
              >
                Save Quota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EMERGENCY FREEZE SWITCH */}
      {isFreezeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border-2 border-rose-500/20">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertOctagon className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900">Emergency Security Freeze</h3>
            </div>
            <p className="text-xs text-gray-500">
              Select the freeze blast radius. Active sessions will be immediately terminated and held task leases released.
            </p>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="freezeTier"
                    checked={freezeTier === 1}
                    onChange={() => setFreezeTier(1)}
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900">Tier 1: Single Staff Freeze</div>
                    <div className="text-[11px] text-gray-500">Freezes one specific suspicious account</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="freezeTier"
                    checked={freezeTier === 2}
                    onChange={() => setFreezeTier(2)}
                  />
                  <div>
                    <div className="text-xs font-bold text-gray-900">Tier 2: Department Isolation</div>
                    <div className="text-[11px] text-gray-500">Freezes all staff in a targeted department</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-lg border border-rose-300 bg-rose-50/50 cursor-pointer">
                  <input
                    type="radio"
                    name="freezeTier"
                    checked={freezeTier === 3}
                    onChange={() => setFreezeTier(3)}
                  />
                  <div>
                    <div className="text-xs font-bold text-rose-900">Tier 3: Nuclear Global Quarantine</div>
                    <div className="text-[11px] text-rose-700">Freezes ALL non-admin staff across the platform</div>
                  </div>
                </label>
              </div>

              {freezeTier === 1 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Membership ID</label>
                  <input
                    type="text"
                    required
                    value={freezeTargetId}
                    onChange={e => setFreezeTargetId(e.target.value)}
                    placeholder="Enter UUID..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono"
                  />
                </div>
              )}

              {freezeTier === 2 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target Department</label>
                  <select
                    value={freezeDepartment}
                    onChange={e => setFreezeDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Emergency Justification (Mandatory)</label>
                <textarea
                  required
                  rows={2}
                  value={freezeReason}
                  onChange={e => setFreezeReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsFreezeModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmergencyFreezeSubmit}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold shadow-sm"
              >
                Execute Freeze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: GLOBAL COMMAND HUD (CMD + K / CTRL + K) */}
      {isCommandHudOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden divide-y divide-slate-800 text-slate-200">
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3.5 gap-3 bg-slate-900">
              <Search className="w-5 h-5 text-indigo-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={hudQuery}
                onChange={e => setHudQuery(e.target.value)}
                placeholder="Search staff by name, email, department, or type a command..."
                className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 text-sm font-sans"
              />
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                ESC
              </span>
            </div>

            {/* Suggestions / Results */}
            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
              {/* Quick Actions (when query is empty or matches) */}
              {(!hudQuery || 'hire staff add user'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setHiredResult(null);
                    setIsHireOpen(true);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-xs transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-white">Hire New Staff Member</div>
                      <div className="text-[11px] text-slate-400">Atomic provisioning with role &amp; spend quota binding</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                </button>
              )}

              {(!hudQuery || 'emergency freeze panic lock kill switch'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setIsFreezeModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-rose-950/40 flex items-center justify-between text-xs transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                      <AlertOctagon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-rose-300 group-hover:text-rose-200">Emergency Freeze Protocol</div>
                      <div className="text-[11px] text-rose-400/80">Execute Tier 1, 2, or 3 operational freeze</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-rose-500 group-hover:text-rose-300" />
                </button>
              )}

              {(!hudQuery || 'merkle audit verify tamper check integrity'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setActiveTab('audit');
                    handleVerifyChain();
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-xs transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Terminal className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-white">Verify Merkle Audit Chain</div>
                      <div className="text-[11px] text-slate-400">Traverse cryptographic hash chain from genesis to head</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                </button>
              )}

              {/* Navigation Shortcuts */}
              {(!hudQuery || 'department pulse overview metrics'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setActiveTab('departments');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center justify-between text-xs transition-colors text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span>Go to Department Pulse Matrix</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">TAB 1</span>
                </button>
              )}

              {(!hudQuery || 'roster staff members directory'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setActiveTab('roster');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center justify-between text-xs transition-colors text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Go to Staff Roster Directory</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">TAB 2</span>
                </button>
              )}

              {(!hudQuery || 'maker checker authorizations pending ratify'.includes(hudQuery.toLowerCase())) && (
                <button
                  onClick={() => {
                    setIsCommandHudOpen(false);
                    setActiveTab('authorizations');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center justify-between text-xs transition-colors text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Go to Maker-Checker Ratification Desk</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">TAB 3</span>
                </button>
              )}

              {/* Filtered Staff Results */}
              {hudQuery && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 py-1">
                    Matching Staff Members
                  </div>
                  {roster.filter(m =>
                    m.fullName.toLowerCase().includes(hudQuery.toLowerCase()) ||
                    m.email.toLowerCase().includes(hudQuery.toLowerCase()) ||
                    m.department.toLowerCase().includes(hudQuery.toLowerCase()) ||
                    m.roleName.toLowerCase().includes(hudQuery.toLowerCase())
                  ).slice(0, 8).map(member => (
                    <div
                      key={member.membershipId}
                      className="px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center">
                          {member.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 group-hover:text-white text-xs flex items-center gap-1.5">
                            <span>{member.fullName}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                              member.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {member.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{member.email} · {member.roleName}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsCommandHudOpen(false);
                            setActiveTab('roster');
                            setSearchQuery(member.email);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                        >
                          View in Roster
                        </button>
                        {member.status === 'ACTIVE' && (
                          <button
                            onClick={() => {
                              setIsCommandHudOpen(false);
                              handleLifecycle(member.membershipId, 'SUSPEND');
                            }}
                            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-xs"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="px-4 py-2 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Tip: Press <strong>ESC</strong> to dismiss or click outside</span>
              <span>Encho Master IAM God-Mode</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
