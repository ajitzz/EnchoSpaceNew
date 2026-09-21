import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  buildCampaignQuote, calculateCosts, dateTime, financeError, fingerprint, identifier, minor, positiveId,
  stableJson, validateCostPolicy, type CampaignQuote, type CampaignQuoteInput, type CostPolicyV1, type FinanceCost, type FinanceCurrency,
} from './financeQuote.js';

type Client = pg.PoolClient;
type Provider = 'STRIPE' | 'RAZORPAY';
type StoredQuote = CampaignQuote & { id: string };
export interface VerifiedCapture {
  provider: Provider; accountId: string; eventId: string; paymentId: string; orderId: string; quoteId: string;
  currency: FinanceCurrency; amountMinor: string; payloadHash: string; capturedAt: string;
}
export interface VerifiedCampaignSettlement {
  reservationId: string; evidenceId: string; evidenceHash: string;
  /** Verified finality covers every authorized provider, including unknown submissions. */
  closedAuthorizations: Array<{ authorizationId: string; provider: 'META' | 'GOOGLE'; accountId: string }>;
  costs: FinanceCost[]; remittanceTaxMinor: string; finalAt: string;
}
export interface VerifiedRefund {
  provider: Provider; accountId: string; eventId: string; paymentId: string; refundRequestId: string;
  externalRefundId: string; currency: FinanceCurrency; amountMinor: string; payloadHash: string;
  status: 'SUCCEEDED' | 'FAILED';
}
export interface FinanceDependencies {
  validateQuote?: (client:pg.PoolClient,input:CampaignQuoteInput)=>Promise<void>;
  /** Supplied by authenticated server composition, never copied from request JSON. */
  actorContext?: { id: number; role: 'host' | 'admin' | 'system' };
  /** Defaults off. A real approved policy and gateway setup must be established by the composition root. */
  fundingEnabled?: boolean;
  verifyCapture?: (untrustedEvent: unknown) => Promise<VerifiedCapture>;
  verifySettlement?: (untrustedEvidence: unknown) => Promise<VerifiedCampaignSettlement>;
  verifyRefund?: (untrustedEvent: unknown) => Promise<VerifiedRefund>;
}
type Line = { account: string; side: 'DEBIT' | 'CREDIT'; amount: bigint };
const debit = (account: string, amount: bigint): Line => ({ account, side: 'DEBIT', amount });
const credit = (account: string, amount: bigint): Line => ({ account, side: 'CREDIT', amount });
const parse = <T>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) as T : value as T;
function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) financeError('FINANCE_INVALID_INPUT', `${field} must be a UUID.`);
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) financeError('FINANCE_UNVERIFIED_EVENT', 'Verified evidence hash is required.');
  return value;
}
function provider(value: unknown): Provider {
  if (value !== 'STRIPE' && value !== 'RAZORPAY') financeError('FINANCE_UNVERIFIED_EVENT', 'Unsupported captured-payment provider.');
  return value;
}

/** All money mutations share one host/currency row lock and a balanced immutable journal. */
export class MarketingFinanceService {
  constructor(private readonly pool: pg.Pool, private readonly dependencies: FinanceDependencies = {}) {}

  private async tx<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const actor = this.dependencies.actorContext;
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0 || !['host', 'admin', 'system'].includes(actor.role)) financeError('FINANCE_FORBIDDEN', 'Trusted authenticated finance actor context is required.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.marketing_admin',$2,true),set_config('app.bypass_rls',$2,true),set_config('lock_timeout','5000',true)", [String(actor.id), String(actor.role === 'admin' || actor.role === 'system')]);
      const result = await operation(client); await client.query('COMMIT'); return result;
    }
    catch (error) { try { await client.query('ROLLBACK'); } catch (rollback) { throw new AggregateError([error, rollback], 'Finance transaction and rollback failed.'); } throw error; }
    finally { client.release(); }
  }

  private assertOwner(hostId: number) {
    const actor = this.dependencies.actorContext;
    if (!actor || (actor.role === 'host' && actor.id !== hostId)) financeError('FINANCE_FORBIDDEN', 'Authenticated actor cannot access another host’s finances.');
  }

  private trustedVerifier() {
    if (!['admin', 'system'].includes(this.dependencies.actorContext?.role ?? '')) financeError('FINANCE_FORBIDDEN', 'Verified payment and settlement ingestion is restricted to trusted server processing.');
  }

  private async account(client: Client, hostId: number, currency: FinanceCurrency, allowFrozen = false) {
    await client.query('INSERT INTO marketing_finance_accounts(host_id,currency) VALUES($1,$2) ON CONFLICT DO NOTHING', [hostId, currency]);
    const account = (await client.query('SELECT * FROM marketing_finance_accounts WHERE host_id=$1 AND currency=$2 FOR UPDATE', [hostId, currency])).rows[0];
    if (account.frozen && !allowFrozen) financeError('FINANCE_ACCOUNT_FROZEN', 'This funding account requires finance review.');
    return account;
  }

  private async journal(client: Client, input: { key: string; kind: string; hostId: number; campaignId: number | null; currency: string; referenceId: string; semantic: unknown }, lines: Line[]) {
    const validLines = lines.filter(line => line.amount > 0n);
    const debits = validLines.filter(l => l.side === 'DEBIT').reduce((sum, l) => sum + l.amount, 0n);
    const credits = validLines.filter(l => l.side === 'CREDIT').reduce((sum, l) => sum + l.amount, 0n);
    if (validLines.length < 2 || debits !== credits) financeError('FINANCE_UNBALANCED', 'Financial journal is not balanced.');
    const id = randomUUID();
    await client.query('INSERT INTO marketing_finance_journals(id,operation_key,fingerprint,kind,host_id,campaign_id,currency,reference_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, input.key, fingerprint(input.semantic), input.kind, input.hostId, input.campaignId, input.currency, input.referenceId]);
    for (const line of validLines) await client.query('INSERT INTO marketing_finance_lines(journal_id,account,side,amount_minor) VALUES($1,$2,$3,$4)', [id, line.account, line.side, line.amount.toString()]);
  }

  async persistPolicy(policy: CostPolicyV1, actorAdminId: number): Promise<CostPolicyV1> {
    validateCostPolicy(policy); positiveId(actorAdminId, 'actorAdminId');
    if (this.dependencies.actorContext?.role !== 'admin' || this.dependencies.actorContext.id !== actorAdminId) financeError('FINANCE_FORBIDDEN', 'Policy changes require the authenticated administrator.');
    return this.tx(async client => {
      const actor = (await client.query('SELECT role FROM users WHERE id=$1', [actorAdminId])).rows[0];
      if (actor?.role !== 'admin') financeError('FINANCE_FORBIDDEN', 'An authenticated administrator must register the financial policy.');
      await client.query('INSERT INTO marketing_finance_policies(policy_id,version,currency,fingerprint,snapshot,admin_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [policy.id, policy.version, policy.currency, fingerprint(policy), stableJson(policy), actorAdminId]);
      const stored = (await client.query('SELECT fingerprint,snapshot FROM marketing_finance_policies WHERE policy_id=$1 AND version=$2', [policy.id, policy.version])).rows[0];
      if (stored.fingerprint !== fingerprint(policy)) financeError('FINANCE_POLICY_IMMUTABLE', 'An existing policy version cannot be changed. Register a new version.');
      return parse<CostPolicyV1>(stored.snapshot);
    });
  }

  async currentPolicy(currency: FinanceCurrency): Promise<CostPolicyV1 | null> {
    return this.tx(async client => {
      const row = (await client.query('SELECT snapshot FROM marketing_finance_policies WHERE currency=$1 ORDER BY created_at DESC,policy_id,version DESC LIMIT 1', [currency])).rows[0];
      return row ? parse<CostPolicyV1>(row.snapshot) : null;
    });
  }

  async quote(input: CampaignQuoteInput, policy: CostPolicyV1): Promise<StoredQuote> {
    this.assertOwner(input.hostId);
    return this.tx(async client => {
      const now = (await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now.toISOString();
      const prior = (await client.query('SELECT snapshot FROM marketing_finance_quotes WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0];
      const quote = buildCampaignQuote(input, policy, prior ? parse<CampaignQuote>(prior.snapshot).quotedAt : now);
      const campaign = (await client.query('SELECT id,host_id,listing_id FROM host_marketing_campaigns WHERE id=$1 FOR SHARE', [input.campaignId])).rows[0];
      if (!campaign || Number(campaign.host_id) !== input.hostId || Number(campaign.listing_id) !== input.listingId) financeError('FINANCE_FORBIDDEN', 'Campaign and property ownership do not match.');
      await this.dependencies.validateQuote?.(client,input);
      const storedPolicy = (await client.query('SELECT fingerprint FROM marketing_finance_policies WHERE policy_id=$1 AND version=$2', [policy.id, policy.version])).rows[0];
      if (storedPolicy?.fingerprint !== quote.policyFingerprint) financeError('FINANCE_POLICY_REQUIRED', 'An exact registered financial policy version is required.');
      const id = randomUUID();
      await client.query(`INSERT INTO marketing_finance_quotes(id,campaign_id,host_id,listing_id,revision,currency,policy_id,policy_version,idempotency_key,fingerprint,snapshot,cost_minor,profit_minor,tax_minor,total_minor,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(idempotency_key) DO NOTHING`,
        [id, quote.campaignId, quote.hostId, quote.listingId, quote.campaignRevision, quote.currency, policy.id, policy.version, quote.idempotencyKey,
          quote.fingerprint, stableJson(quote), quote.costMinor, quote.profitMinor, quote.remittanceTaxMinor, quote.totalMinor, quote.expiresAt]);
      const saved = (await client.query('SELECT id,fingerprint,snapshot FROM marketing_finance_quotes WHERE idempotency_key=$1', [quote.idempotencyKey])).rows[0];
      if (saved.fingerprint !== quote.fingerprint) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Quote key is already bound to a different financial snapshot.');
      return { ...parse<CampaignQuote>(saved.snapshot), id: saved.id };
    });
  }

  async recordVerifiedCapture(untrustedEvent: unknown) {
    this.trustedVerifier();
    if (!this.dependencies.fundingEnabled || !this.dependencies.verifyCapture) financeError('FINANCE_FUNDING_DISABLED', 'Verified gateway funding is not configured.');
    const event = await this.dependencies.verifyCapture(untrustedEvent);
    provider(event.provider); uuid(event.quoteId, 'quoteId'); hash(event.payloadHash);
    for (const key of ['accountId', 'eventId', 'paymentId', 'orderId'] as const) identifier(event[key], key);
    const amount = minor(event.amountMinor, 'captured amount', true); const capturedAt = dateTime(event.capturedAt, 'capturedAt');
    return this.tx(async client => {
      const quote = (await client.query('SELECT * FROM marketing_finance_quotes WHERE id=$1', [event.quoteId])).rows[0];
      if (!quote || quote.currency !== event.currency || BigInt(quote.total_minor) !== amount) financeError('FINANCE_CAPTURE_MISMATCH', 'Verified capture must match the accepted quote currency and full amount.');
      const account = await this.account(client, quote.host_id, quote.currency, true);
      const now = (await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
      if (Date.parse(capturedAt) > now.getTime()) financeError('FINANCE_CAPTURE_MISMATCH', 'Capture timestamp is in the future.');
      const previousEvent = (await client.query('SELECT * FROM marketing_finance_provider_events WHERE provider=$1 AND account_id=$2 AND event_id=$3', [event.provider, event.accountId, event.eventId])).rows[0];
      if (previousEvent && (previousEvent.event_kind !== 'CAPTURE' || previousEvent.payload_hash !== event.payloadHash)) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Payment event identity conflicts with stored evidence.');
      const previous = (await client.query('SELECT * FROM marketing_finance_captures WHERE provider=$1 AND account_id=$2 AND payment_id=$3', [event.provider, event.accountId, event.paymentId])).rows[0];
      if (previous) {
        if (previous.quote_id !== event.quoteId || previous.order_id !== event.orderId || previous.currency !== event.currency || BigInt(previous.amount_minor) !== amount || Number(previous.host_id) !== Number(quote.host_id)) financeError('FINANCE_CAPTURE_MISMATCH', 'A payment cannot fund a second quote or owner.');
        await this.providerEvent(client, event, 'CAPTURE', previous.id);
        return { captureId: previous.id as string, idempotent: true, amountMinor: previous.amount_minor as string };
      }
      if (previousEvent) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Payment event was already consumed.');
      const duplicateQuote = (await client.query('SELECT id FROM marketing_finance_captures WHERE quote_id=$1 LIMIT 1', [event.quoteId])).rows.length > 0;
      // Received cash is always journaled. Payment after quote expiry needs review/refund,
      // while delayed delivery of a capture completed within the quote is still accepted.
      const requiresReview = duplicateQuote || Date.parse(capturedAt) > new Date(quote.expires_at).getTime();
      const id = randomUUID();
      const releaseAt = new Date(Date.parse(capturedAt) + 24 * 60 * 60 * 1000).toISOString();
      await client.query(`INSERT INTO marketing_finance_captures(id,quote_id,host_id,provider,account_id,payment_id,order_id,currency,amount_minor,captured_at,risk_release_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, event.quoteId, quote.host_id, event.provider, event.accountId, event.paymentId, event.orderId, event.currency, event.amountMinor, capturedAt, releaseAt]);
      await this.providerEvent(client, event, 'CAPTURE', id);
      await this.journal(client, { key: `capture:${id}`, kind: 'CAPTURE', hostId: quote.host_id, campaignId: quote.campaign_id, currency: quote.currency, referenceId: id, semantic: event }, [debit('GATEWAY_CLEARING', amount), credit('HOST_AVAILABLE', amount)]);
      await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor+$3,risk_release_at=GREATEST(risk_release_at,$4),frozen=frozen OR $5,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [quote.host_id, quote.currency, event.amountMinor, releaseAt, requiresReview]);
      return { captureId: id, idempotent: false, amountMinor: amount.toString(), requiresReview, riskReleaseAt: new Date(Math.max(new Date(account.risk_release_at).getTime(), Date.parse(releaseAt))).toISOString() };
    });
  }

  private async providerEvent(client: Client, event: { provider: Provider; accountId: string; eventId: string; payloadHash: string }, kind: string, objectId: string) {
    await client.query('INSERT INTO marketing_finance_provider_events(provider,account_id,event_id,payload_hash,event_kind,object_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [event.provider, event.accountId, event.eventId, event.payloadHash, kind, objectId]);
    const stored = (await client.query('SELECT * FROM marketing_finance_provider_events WHERE provider=$1 AND account_id=$2 AND event_id=$3', [event.provider, event.accountId, event.eventId])).rows[0];
    if (stored.payload_hash !== event.payloadHash || stored.event_kind !== kind || stored.object_id !== objectId) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Provider event conflicts with existing financial evidence.');
  }

  async reserve(input: { quoteId: string; hostId: number; idempotencyKey: string }) {
    return this.tx(client => this.reserveInTransaction(client, input));
  }

  /** Caller owns BEGIN/COMMIT and its campaign lock. No nested transaction or connection. */
  async reserveInTransaction(client: Client, input: { quoteId: string; hostId: number; idempotencyKey: string }) {
    uuid(input.quoteId, 'quoteId'); positiveId(input.hostId, 'hostId'); identifier(input.idempotencyKey, 'idempotencyKey');
    this.assertOwner(input.hostId);
      const quote = (await client.query('SELECT * FROM marketing_finance_quotes WHERE id=$1 AND host_id=$2', [input.quoteId, input.hostId])).rows[0];
      if (!quote) financeError('FINANCE_FORBIDDEN', 'Quote does not belong to this host.');
      const account = await this.account(client, input.hostId, quote.currency);
      const prior = (await client.query('SELECT * FROM marketing_finance_reservations WHERE quote_id=$1 OR idempotency_key=$2', [input.quoteId, input.idempotencyKey])).rows;
      const semantic = fingerprint({ quoteId: input.quoteId, hostId: input.hostId });
      if (prior.length) {
        if (prior.length !== 1 || prior[0].fingerprint !== semantic || prior[0].idempotency_key !== input.idempotencyKey) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Reservation key or quote is already bound.');
        return { reservationId: prior[0].id as string, status: prior[0].status as string, idempotent: true };
      }
      const validity = (await client.query(`SELECT q.expires_at>CURRENT_TIMESTAMP AS fresh,
        EXISTS(SELECT 1 FROM marketing_finance_captures p WHERE p.quote_id=q.id AND p.captured_at<=q.expires_at AND p.currency=q.currency AND p.amount_minor=q.total_minor
          AND NOT EXISTS(SELECT 1 FROM marketing_finance_refunds f WHERE f.capture_id=p.id AND f.status IN ('REQUESTED','SUCCEEDED'))) AS accepted_capture
        FROM marketing_finance_quotes q WHERE q.id=$1`, [input.quoteId])).rows[0];
      if (!validity.fresh && !validity.accepted_capture) financeError('FINANCE_QUOTE_EXPIRED', 'Expired quote has no verified capture completed within its acceptance period.');
      const amount = BigInt(quote.total_minor);
      if (BigInt(account.available_minor) < amount) financeError('FINANCE_INSUFFICIENT_FUNDS', 'Verified available funds are insufficient.');
      const id = randomUUID();
      await client.query(`INSERT INTO marketing_finance_reservations(id,quote_id,campaign_id,host_id,revision,currency,total_minor,remaining_minor,status,risk_release_at,idempotency_key,fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7,'RESERVED',$8,$9,$10)`, [id, quote.id, quote.campaign_id, input.hostId, quote.revision, quote.currency, quote.total_minor, account.risk_release_at, input.idempotencyKey, semantic]);
      await this.journal(client, { key: `reserve:${id}`, kind: 'RESERVE', hostId: input.hostId, campaignId: quote.campaign_id, currency: quote.currency, referenceId: id, semantic: { quoteId: input.quoteId } }, [debit('HOST_AVAILABLE', amount), credit('CAMPAIGN_RESERVED', amount)]);
      await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor-$3,reserved_minor=reserved_minor+$3,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [input.hostId, quote.currency, amount.toString()]);
      return { reservationId: id, status: 'RESERVED', idempotent: false };
  }

  /** Final provider/expense evidence is verified outside the short money transaction. */
  async reconcile(untrustedEvidence: unknown) {
    this.trustedVerifier();
    if (!this.dependencies.verifySettlement) financeError('FINANCE_SETTLEMENT_UNVERIFIED', 'Provider finality and final cost verification are not configured.');
    const settlement = await this.dependencies.verifySettlement(untrustedEvidence);
    return this.tx(client => this.reconcileInTransaction(client, settlement));
  }

  /** Trusted billing-close workflow owns the campaign/evidence locks and surrounding transaction. */
  async reconcileInTransaction(client:Client,settlement:VerifiedCampaignSettlement){
    this.trustedVerifier();
    positiveId(this.dependencies.actorContext?.id,'trusted settlement actor');
    uuid(settlement.reservationId, 'reservationId'); identifier(settlement.evidenceId, 'evidenceId'); hash(settlement.evidenceHash); dateTime(settlement.finalAt, 'finalAt');
      const candidate = (await client.query('SELECT * FROM marketing_finance_reservations WHERE id=$1', [settlement.reservationId])).rows[0];
      if (!candidate) financeError('FINANCE_RESERVATION_MISSING', 'Reservation was not found.');
      await this.account(client, candidate.host_id, candidate.currency, true);
      const reservation = (await client.query('SELECT * FROM marketing_finance_reservations WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
      const settlementHash = fingerprint(settlement);
      if (reservation.status !== 'RESERVED') {
        if (reservation.settlement_snapshot?.fingerprint !== settlementHash) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Finalized reservation cannot be settled differently.');
        return { reservationId: reservation.id as string, ...reservation.settlement_snapshot, idempotent: true };
      }
      const authorizations = (await client.query('SELECT id,provider,account_id FROM marketing_finance_authorizations WHERE reservation_id=$1', [reservation.id])).rows;
      if (!Array.isArray(settlement.closedAuthorizations) || settlement.closedAuthorizations.length !== authorizations.length || authorizations.some(auth => !settlement.closedAuthorizations.some(item => item.authorizationId === auth.id && item.provider === auth.provider && item.accountId === auth.account_id))) financeError('FINANCE_PROVIDER_FINALITY_REQUIRED', 'Final evidence must close every authorized provider operation.');
      const quote = parse<CampaignQuote>((await client.query('SELECT snapshot FROM marketing_finance_quotes WHERE id=$1', [reservation.quote_id])).rows[0].snapshot);
      const policy = parse<CostPolicyV1>((await client.query('SELECT snapshot FROM marketing_finance_policies WHERE policy_id=$1 AND version=$2', [quote.policyId, quote.policyVersion])).rows[0].snapshot);
      const actual = calculateCosts(settlement.costs, policy); const tax = minor(settlement.remittanceTaxMinor, 'final tax');
      if (tax > BigInt(quote.remittanceTaxMinor)) financeError('FINANCE_TAX_VARIANCE_REVIEW', 'Tax exceeds the disclosed tax reserve; specialist reconciliation is required.');
      // Each quote line is a host-approved ceiling. Actual overages remain platform expense.
      const hostCosts = settlement.costs.map(line => ({ code: line.code, amountMinor: (minor(line.amountMinor, 'actual cost') < minor(quote.costs.find(q => q.code === line.code)!.amountMinor, 'quoted cost') ? BigInt(line.amountMinor) : BigInt(quote.costs.find(q => q.code === line.code)!.amountMinor)).toString() }));
      const chargeable = calculateCosts(hostCosts, policy).cost;
      const profit = (chargeable * BigInt(quote.markupBps) + 5000n) / 10000n;
      const charge = chargeable + profit + tax;
      if (charge > BigInt(reservation.remaining_minor)) financeError('FINANCE_OVERSPEND', 'Settlement exceeds the host reservation.');
      const refund = BigInt(reservation.remaining_minor) - charge; const overrun = actual.cost - chargeable;
      const lines = [debit('CAMPAIGN_RESERVED', BigInt(reservation.remaining_minor)), credit('CAMPAIGN_COST_PAYABLE', actual.cost), credit('ENCHO_CAMPAIGN_REVENUE', profit), credit('TAX_PAYABLE', tax), credit('HOST_AVAILABLE', refund), debit('PLATFORM_OVERRUN', overrun)];
      const summary = { fingerprint: settlementHash, evidenceId: settlement.evidenceId, evidenceHash: settlement.evidenceHash, actualCostMinor: actual.cost.toString(), chargedCostMinor: chargeable.toString(), profitMinor: profit.toString(), realizedCampaignContributionMinor: (profit - overrun).toString(), platformOverrunMinor: overrun.toString(), taxMinor: tax.toString(), returnedMinor: refund.toString(), finalAt: settlement.finalAt };
      await this.journal(client, { key: `settlement:${reservation.id}`, kind: 'SETTLEMENT', hostId: reservation.host_id, campaignId: reservation.campaign_id, currency: reservation.currency, referenceId: reservation.id, semantic: settlement }, lines);
      await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor+$3,reserved_minor=reserved_minor-$4,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [reservation.host_id, reservation.currency, refund.toString(), reservation.remaining_minor]);
      await client.query("UPDATE marketing_finance_reservations SET remaining_minor=0,status=$2,settlement_snapshot=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [reservation.id, actual.cost === 0n && tax === 0n ? 'RELEASED' : 'SETTLED', stableJson(summary)]);
      return { reservationId: reservation.id as string, ...summary, idempotent: false };
  }

  /** Cancellation is a zero-cost verified final settlement, never an admin balance edit. */
  async release(untrustedEvidence: unknown) { return this.reconcile(untrustedEvidence); }

  /** Only a locally proven, never-submitted campaign can return its intact reserve without provider finality. */
  async releaseBeforeProviderInTransaction(client: Client, input: {
    campaignId: number; hostId: number; revision: number; reservationId: string; idempotencyKey: string; reason: string;
  }) {
    this.assertOwner(input.hostId); uuid(input.reservationId, 'reservationId'); identifier(input.idempotencyKey, 'idempotencyKey');
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.trim().length > 2000) financeError('FINANCE_INVALID_INPUT', 'A meaningful cancellation reason is required.');
    const workflow = await assertCampaignNeverSubmitted(client, input);
    if (workflow.reservation_id !== input.reservationId) financeError('FINANCE_RESERVATION_MISSING', 'The reservation must belong to the current campaign workflow.');
    const candidate = (await client.query('SELECT * FROM marketing_finance_reservations WHERE id=$1 AND campaign_id=$2 AND host_id=$3 AND revision=$4 AND quote_id=$5', [input.reservationId, input.campaignId, input.hostId, String(input.revision), workflow.quote_id])).rows[0];
    if (!candidate) financeError('FINANCE_RESERVATION_MISSING', 'The matching campaign reservation is unavailable.');
    await this.account(client, input.hostId, candidate.currency, true);
    const reservation = (await client.query('SELECT * FROM marketing_finance_reservations WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
    const semantic = { ...input, reason: input.reason.trim(), kind: 'UNSUBMITTED_CANCELLATION' };
    const semanticHash = fingerprint(semantic);
    if (reservation.status !== 'RESERVED') {
      if (reservation.status !== 'RELEASED' || reservation.settlement_snapshot?.fingerprint !== semanticHash) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'This reservation was already closed by different evidence.');
      return { reservationId: reservation.id as string, returnedMinor: reservation.settlement_snapshot.returnedMinor as string, idempotent: true };
    }
    if (BigInt(reservation.remaining_minor) !== BigInt(reservation.total_minor) || (await client.query('SELECT id FROM marketing_finance_authorizations WHERE reservation_id=$1 LIMIT 1', [reservation.id])).rows.length) financeError('FINANCE_PROVIDER_FINALITY_REQUIRED', 'Any spending authorization or consumed reserve requires provider finality.');
    const amount = BigInt(reservation.remaining_minor);
    const summary = { ...semantic, fingerprint: semanticHash, returnedMinor: amount.toString() };
    await this.journal(client, { key: `unsubmitted-cancel:${reservation.id}`, kind: 'UNSUBMITTED_CANCELLATION', hostId: input.hostId, campaignId: input.campaignId, currency: reservation.currency, referenceId: reservation.id, semantic }, [debit('CAMPAIGN_RESERVED', amount), credit('HOST_AVAILABLE', amount)]);
    await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor+$3,reserved_minor=reserved_minor-$3,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [input.hostId, reservation.currency, amount.toString()]);
    await client.query("UPDATE marketing_finance_reservations SET remaining_minor=0,status='RELEASED',settlement_snapshot=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [reservation.id, stableJson(summary)]);
    return { reservationId: reservation.id as string, returnedMinor: amount.toString(), idempotent: false };
  }

  async requestRefund(input: { captureId: string; hostId: number; amountMinor: string; idempotencyKey: string }) {
    return this.tx(client => this.requestRefundInTransaction(client, input));
  }

  /** Share the held obligation and durable dispatch enqueue transaction with the workflow. */
  async requestRefundInTransaction(client: Client, input: { captureId: string; hostId: number; amountMinor: string; idempotencyKey: string }) {
    uuid(input.captureId, 'captureId'); positiveId(input.hostId, 'hostId'); const amount = minor(input.amountMinor, 'refund amount', true); identifier(input.idempotencyKey, 'idempotencyKey');
    this.assertOwner(input.hostId);
      const capture = (await client.query('SELECT * FROM marketing_finance_captures WHERE id=$1 AND host_id=$2', [input.captureId, input.hostId])).rows[0];
      if (!capture) financeError('FINANCE_FORBIDDEN', 'Capture does not belong to this host.');
      const account = await this.account(client, input.hostId, capture.currency, true);
      const semantic = fingerprint({ captureId: input.captureId, hostId: input.hostId, amountMinor: input.amountMinor });
      const previous = (await client.query('SELECT * FROM marketing_finance_refunds WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0];
      if (previous) { if (previous.fingerprint !== semantic) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Refund key is already used.'); return { refundRequestId: previous.id as string, status: previous.status as string, idempotent: true }; }
      const allocated = BigInt((await client.query("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM marketing_finance_refunds WHERE capture_id=$1 AND status IN ('REQUESTED','SUCCEEDED')", [capture.id])).rows[0].amount);
      if (allocated + amount > BigInt(capture.amount_minor) || BigInt(account.available_minor) < amount) financeError('FINANCE_INSUFFICIENT_FUNDS', 'Refund exceeds captured or unreserved available funds.');
      const id = randomUUID();
      await client.query("INSERT INTO marketing_finance_refunds(id,capture_id,host_id,currency,amount_minor,idempotency_key,fingerprint,status) VALUES($1,$2,$3,$4,$5,$6,$7,'REQUESTED')", [id, input.captureId, input.hostId, capture.currency, input.amountMinor, input.idempotencyKey, semantic]);
      await this.journal(client, { key: `refund-request:${id}`, kind: 'REFUND_REQUEST', hostId: input.hostId, campaignId: null, currency: capture.currency, referenceId: id, semantic: input }, [debit('HOST_AVAILABLE', amount), credit('REFUND_PAYABLE', amount)]);
      await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor-$3,refund_pending_minor=refund_pending_minor+$3,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [input.hostId, capture.currency, input.amountMinor]);
      return { refundRequestId: id, status: 'REQUESTED', idempotent: false };
  }

  async recordVerifiedRefund(untrustedEvent: unknown) {
    this.trustedVerifier();
    if (!this.dependencies.verifyRefund) financeError('FINANCE_REFUND_UNVERIFIED', 'Gateway refund verification is not configured.');
    const event = await this.dependencies.verifyRefund(untrustedEvent);
    provider(event.provider); uuid(event.refundRequestId, 'refundRequestId'); hash(event.payloadHash);
    for (const key of ['accountId', 'eventId', 'paymentId', 'externalRefundId'] as const) identifier(event[key], key);
    const amount = minor(event.amountMinor, 'refund amount', true);
    if (!['SUCCEEDED', 'FAILED'].includes(event.status)) financeError('FINANCE_REFUND_UNVERIFIED', 'Refund outcome must be final and verified.');
    return this.tx(async client => {
      const candidate = (await client.query('SELECT * FROM marketing_finance_refunds WHERE id=$1', [event.refundRequestId])).rows[0];
      if (!candidate) financeError('FINANCE_REFUND_UNVERIFIED', 'Refund request does not exist.');
      await this.account(client, candidate.host_id, candidate.currency, true);
      const refund = (await client.query('SELECT * FROM marketing_finance_refunds WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
      const capture = (await client.query('SELECT * FROM marketing_finance_captures WHERE id=$1', [refund.capture_id])).rows[0];
      if (capture.provider !== event.provider || capture.account_id !== event.accountId || capture.payment_id !== event.paymentId || refund.currency !== event.currency || BigInt(refund.amount_minor) !== amount) financeError('FINANCE_REFUND_UNVERIFIED', 'Refund event does not match its captured payment and reserved refund amount.');
      if (refund.status !== 'REQUESTED') {
        if (refund.status !== event.status || refund.external_refund_id !== `${event.provider}:${event.accountId}:${event.externalRefundId}`) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Refund terminal state conflicts with new evidence.');
        await this.providerEvent(client, event, 'REFUND', refund.id); return { refundRequestId: refund.id as string, status: refund.status as string, idempotent: true };
      }
      await this.providerEvent(client, event, 'REFUND', refund.id);
      await this.journal(client, { key: `refund-final:${refund.id}`, kind: `REFUND_${event.status}`, hostId: refund.host_id, campaignId: null, currency: refund.currency, referenceId: refund.id, semantic: event }, [debit('REFUND_PAYABLE', amount), credit(event.status === 'SUCCEEDED' ? 'GATEWAY_CLEARING' : 'HOST_AVAILABLE', amount)]);
      await client.query('UPDATE marketing_finance_accounts SET available_minor=available_minor+$3,refund_pending_minor=refund_pending_minor-$4,updated_at=CURRENT_TIMESTAMP WHERE host_id=$1 AND currency=$2', [refund.host_id, refund.currency, event.status === 'FAILED' ? amount.toString() : '0', amount.toString()]);
      await client.query('UPDATE marketing_finance_refunds SET status=$2,external_refund_id=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [refund.id, event.status, `${event.provider}:${event.accountId}:${event.externalRefundId}`]);
      return { refundRequestId: refund.id as string, status: event.status, idempotent: false };
    });
  }

  async getSnapshot(campaignId: number, hostId: number) {
    positiveId(campaignId, 'campaignId'); positiveId(hostId, 'hostId');
    this.assertOwner(hostId);
    return this.tx(async client => {
    const campaign = (await client.query('SELECT host_id FROM host_marketing_campaigns WHERE id=$1', [campaignId])).rows[0];
    if (!campaign || Number(campaign.host_id) !== hostId) financeError('FINANCE_FORBIDDEN', 'Campaign does not belong to this host.');
    const quotes = (await client.query('SELECT id,snapshot FROM marketing_finance_quotes WHERE campaign_id=$1 AND host_id=$2 ORDER BY created_at DESC', [campaignId, hostId])).rows;
    const reservations = (await client.query('SELECT * FROM marketing_finance_reservations WHERE campaign_id=$1 AND host_id=$2 ORDER BY created_at DESC', [campaignId, hostId])).rows;
    const balances = (await client.query('SELECT currency,available_minor,reserved_minor,refund_pending_minor,risk_release_at,frozen FROM marketing_finance_accounts WHERE host_id=$1 ORDER BY currency', [hostId])).rows;
    return { campaignId, hostId, quotes: quotes.map(row => ({ ...row.snapshot, id: row.id })), reservations, balances, fundingEnabled: this.dependencies.fundingEnabled === true };
    });
  }
}

/** Parent locks serialize with both Google and Meta durable claims; absence is checked inside that boundary. */
export async function assertCampaignNeverSubmitted(client: pg.PoolClient, input: { campaignId: number; hostId: number; revision: number }) {
  positiveId(input.campaignId, 'campaignId'); positiveId(input.hostId, 'hostId'); positiveId(input.revision, 'revision');
  const parent = (await client.query('SELECT c.id,c.host_id,c.status,to_jsonb(c) AS legacy FROM host_marketing_campaigns c WHERE c.id=$1 FOR UPDATE', [input.campaignId])).rows[0];
  const row = (await client.query('SELECT * FROM marketing_campaign_workflows WHERE campaign_id=$1 AND host_id=$2 FOR UPDATE', [input.campaignId, input.hostId])).rows[0];
  if (!parent || parent.host_id !== input.hostId || !row || row.revision !== input.revision) financeError('FINANCE_FORBIDDEN', 'Current campaign ownership and revision are required for cancellation.');
  const legacy = parent.legacy;
  const legacyKeys = ['meta_campaign_id', 'meta_adset_id', 'meta_creative_id', 'meta_ad_id', 'meta_dispatched_at', 'external_status_verified_at', 'insights_synced_at'];
  const allowedStates = ['DRAFT', 'EVALUATING', 'AI_REJECTED', 'PENDING_ADMIN', 'ADMIN_REJECTED', 'APPROVED', 'PUBLISH_QUEUED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED'];
  if (parent.status !== 'HARVO_V2' || legacyKeys.some(key => legacy[key] != null) || ['spent', 'accumulated_spent'].some(key => legacy[key] != null && Number(legacy[key]) !== 0) || !allowedStates.includes(row.state) || row.provider_truth != null || row.telemetry != null) financeError('FINANCE_PROVIDER_FINALITY_REQUIRED', 'Provider history requires verified finality before funds can be released.');
  const history = (await client.query(`SELECT
    EXISTS(SELECT 1 FROM provider_publishing_transactions WHERE campaign_id=$1) OR
    EXISTS(SELECT 1 FROM provider_entities WHERE campaign_id=$1) OR
    EXISTS(SELECT 1 FROM meta_publishing_transactions WHERE campaign_id=$1) OR
    EXISTS(SELECT 1 FROM marketing_finance_authorizations a JOIN marketing_finance_reservations r ON r.id=a.reservation_id WHERE r.campaign_id=$1) OR
    EXISTS(SELECT 1 FROM marketing_jobs WHERE campaign_id=$1 AND (kind IN ('ACTIVATE','PAUSE') OR kind='PUBLISH' AND state='SUCCEEDED')) OR
    EXISTS(SELECT 1 FROM marketing_workflow_events WHERE campaign_id=$1 AND (event_type IN ('PROVIDER_PAUSED_CREATION_VERIFIED','PROVIDER_CONTROL_OBSERVED','TELEMETRY_OBSERVED') OR event_type='OPERATION_QUEUED' AND evidence->>'action' IN ('ACTIVATE','PAUSE'))) AS exists`, [input.campaignId])).rows[0];
  if (history.exists) financeError('FINANCE_PROVIDER_FINALITY_REQUIRED', 'A provider claim, external object or spending authorization requires verified finality.');
  return row;
}

/** Called inside the caller's existing PostgreSQL transaction and workflow lock. */
export async function authorizeSpending(client: pg.PoolClient, input: {
  reservationId: string; campaignId: number; hostId: number; revision: string; provider: 'META' | 'GOOGLE'; accountId: string; amountMinor: string; idempotencyKey: string;
}) {
  uuid(input.reservationId, 'reservationId'); positiveId(input.campaignId, 'campaignId'); positiveId(input.hostId, 'hostId');
  identifier(input.revision, 'revision'); identifier(input.accountId, 'accountId'); identifier(input.idempotencyKey, 'idempotencyKey');
  const amount = minor(input.amountMinor, 'authorized media', true);
  if (!['META', 'GOOGLE'].includes(input.provider)) financeError('FINANCE_INVALID_INPUT', 'Supported ad provider is required.');
  const reservation = (await client.query('SELECT *,risk_release_at<=CURRENT_TIMESTAMP AS risk_released FROM marketing_finance_reservations WHERE id=$1 FOR UPDATE', [input.reservationId])).rows[0];
  if (!reservation || Number(reservation.host_id) !== input.hostId || Number(reservation.campaign_id) !== input.campaignId || reservation.revision !== input.revision || reservation.status !== 'RESERVED' || !reservation.risk_released || BigInt(reservation.remaining_minor) !== BigInt(reservation.total_minor)) financeError('FINANCE_AUTHORIZATION_BLOCKED', 'Matching fully reserved captured funds and completed risk hold are required.');
  const frozen = (await client.query('SELECT frozen FROM marketing_finance_accounts WHERE host_id=$1 AND currency=$2', [input.hostId, reservation.currency])).rows[0]?.frozen;
  if (frozen !== false) financeError('FINANCE_AUTHORIZATION_BLOCKED', 'Funding account is unavailable or frozen.');
  const quote = parse<CampaignQuote>((await client.query('SELECT snapshot FROM marketing_finance_quotes WHERE id=$1', [reservation.quote_id])).rows[0].snapshot);
  if (amount > BigInt(quote.mediaMinor[input.provider])) financeError('FINANCE_OVERSPEND', 'Media authorization exceeds the immutable provider allocation.');
  const semantic = fingerprint({ ...input, idempotencyKey: undefined });
  const existing = (await client.query('SELECT * FROM marketing_finance_authorizations WHERE reservation_id=$1 AND provider=$2 OR idempotency_key=$3', [input.reservationId, input.provider, input.idempotencyKey])).rows;
  if (existing.length) {
    if (existing.length !== 1 || existing[0].fingerprint !== semantic || existing[0].idempotency_key !== input.idempotencyKey) financeError('FINANCE_IDEMPOTENCY_CONFLICT', 'Provider authorization is already bound to another request.');
    return { authorizationId: existing[0].id as string, mediaMinor: existing[0].media_minor as string, currency: reservation.currency as FinanceCurrency, idempotent: true };
  }
  const id = randomUUID();
  await client.query('INSERT INTO marketing_finance_authorizations(id,reservation_id,provider,account_id,media_minor,idempotency_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, input.reservationId, input.provider, input.accountId, amount.toString(), input.idempotencyKey, semantic]);
  return { authorizationId: id, mediaMinor: amount.toString(), currency: reservation.currency as FinanceCurrency, idempotent: false };
}
