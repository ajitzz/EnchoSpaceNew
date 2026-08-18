import pg from 'pg';

export type LedgerAccountType = 
  | 'HOST_WALLET'
  | 'GATEWAY_CLEARING'
  | 'ENCHO_FEE_REVENUE'
  | 'AD_SPEND_ESCROW'
  | 'PLATFORM_RESERVE';

export type LedgerEventType = 
  | 'WALLET_FUNDING'
  | 'AD_SPEND_DEDUCTION'
  | 'ESCROW_RELEASE'
  | 'TRAPPED_CASH_REFUND'
  | 'BOOKING_PAYOUT'
  | 'AD_REFUEL';

export interface LedgerLineParam {
  userId?: number | null;
  accountType: LedgerAccountType;
  entryType: 'CREDIT' | 'DEBIT';
  amount: number;
  currency?: string;
}

export interface RecordLedgerTransactionParams {
  transactionRef: string;
  eventType: LedgerEventType;
  legacyTransactionType?: string;
  description: string;
  lines: LedgerLineParam[];
}

export interface LedgerRecordResult {
  entryId: string;
  transactionRef: string;
  isIdempotentReplay: boolean;
  totalDebits: number;
  totalCredits: number;
}

export class DoubleEntryLedgerService {
  /**
   * Records a strictly balanced double-entry transaction.
   * Invariant 1: Sum(Debits) === Sum(Credits)
   * Invariant 2: Append-only immutable journal.
   * Invariant 3: Idempotent by transactionRef.
   */
  public static async recordTransaction(
    client: pg.PoolClient | pg.Pool,
    params: RecordLedgerTransactionParams
  ): Promise<LedgerRecordResult> {
    const { transactionRef, eventType, legacyTransactionType, description, lines } = params;

    if (!lines || lines.length < 2) {
      throw new Error(`[LEDGER ERROR] A double-entry transaction must contain at least 2 legs. Provided: ${lines?.length || 0}`);
    }

    // 1. Balance Conservation Check (Debits === Credits)
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of lines) {
      const amount = Number(line.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error(`[LEDGER ERROR] Invalid line amount: ${line.amount}`);
      }
      if (line.entryType === 'DEBIT') {
        totalDebits += amount;
      } else if (line.entryType === 'CREDIT') {
        totalCredits += amount;
      } else {
        throw new Error(`[LEDGER ERROR] Invalid entryType: ${line.entryType}. Must be CREDIT or DEBIT.`);
      }
    }

    // Floating-point delta check (within 0.001)
    if (Math.abs(totalDebits - totalCredits) > 0.009) {
      try {
        const { MetricsRegistry } = await import('./observability/metricsRegistry.js');
        const { AlertService } = await import('./observability/alertService.js');
        MetricsRegistry.recordLedgerImbalance();
        AlertService.emitAlert(
          'LEDGER_IMBALANCE',
          'CRITICAL',
          'Double-Entry Ledger Imbalance Violation',
          `Transaction ${transactionRef} rejected: Debits (${totalDebits.toFixed(2)}) != Credits (${totalCredits.toFixed(2)})`,
          'Investigate transaction construction and prevent corrupted ledger insertion.',
          { transactionRef, totalDebits, totalCredits, lines }
        );
      } catch (e) {
        // Continue to throw error
      }

      throw new Error(
        `[LEDGER UNBALANCED] Transaction is unbalanced. Debits (${totalDebits.toFixed(2)}) != Credits (${totalCredits.toFixed(2)})`
      );
    }

    // 2. Check Idempotency
    const existingEntry = await client.query(
      `SELECT id FROM ledger_entries WHERE transaction_ref = $1`,
      [transactionRef]
    );

    if (existingEntry.rows.length > 0) {
      try {
        const { MetricsRegistry } = await import('./observability/metricsRegistry.js');
        MetricsRegistry.recordDuplicateTransactionAttempt();
      } catch (e) {
        // Continue
      }

      return {
        entryId: existingEntry.rows[0].id,
        transactionRef,
        isIdempotentReplay: true,
        totalDebits,
        totalCredits
      };
    }

    // 3. Insert Master Ledger Entry
    const entryRes = await client.query(
      `INSERT INTO ledger_entries (transaction_ref, event_type, description, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (transaction_ref) DO NOTHING
       RETURNING id`,
      [transactionRef, eventType, description]
    );

    let entryId: string;
    if (entryRes.rows.length > 0) {
      entryId = entryRes.rows[0].id;
    } else {
      const fetchAgain = await client.query(`SELECT id FROM ledger_entries WHERE transaction_ref = $1`, [transactionRef]);
      entryId = fetchAgain.rows[0].id;
      return {
        entryId,
        transactionRef,
        isIdempotentReplay: true,
        totalDebits,
        totalCredits
      };
    }

    // 4. Resolve/Create Accounts and Insert Ledger Lines
    for (const line of lines) {
      const currency = line.currency || 'INR';
      const userId = line.userId || null;

      // Find or create account
      let accountId: number;
      const accRes = await client.query(
        `SELECT id FROM wallet_accounts 
         WHERE (user_id = $1 OR (user_id IS NULL AND $1 IS NULL)) 
         AND account_type = $2 AND currency = $3
         LIMIT 1`,
        [userId, line.accountType, currency]
      );

      if (accRes.rows.length > 0) {
        accountId = accRes.rows[0].id;
      } else {
        const createAcc = await client.query(
          `INSERT INTO wallet_accounts (user_id, account_type, currency, balance, created_at)
           VALUES ($1, $2, $3, 0.00, NOW())
           RETURNING id`,
          [userId, line.accountType, currency]
        );
        accountId = createAcc.rows[0].id;
      }

      // Insert line
      await client.query(
        `INSERT INTO ledger_lines (entry_id, account_id, entry_type, amount, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [entryId, accountId, line.entryType, line.amount]
      );

      // 5. Update cached balance on wallet_accounts
      const balanceDelta = line.entryType === 'CREDIT' ? line.amount : -line.amount;
      await client.query(
        `UPDATE wallet_accounts SET balance = balance + $1 WHERE id = $2`,
        [balanceDelta, accountId]
      );

      // If this is a HOST_WALLET and userId exists, sync host_wallets table
      if (line.accountType === 'HOST_WALLET' && userId) {
        const hwRes = await client.query(
          `UPDATE host_wallets 
           SET balance = balance + $1, updated_at = NOW() 
           WHERE host_id = $2 RETURNING id`,
          [balanceDelta, userId]
        );

        if (hwRes.rows.length > 0 && legacyTransactionType) {
          const legacyWalletId = hwRes.rows[0].id;
          await client.query(
            `INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, status, description)
             VALUES ($1, $2, $3, $4, 'completed', $5)
             ON CONFLICT DO NOTHING`,
            [legacyWalletId, balanceDelta, legacyTransactionType, transactionRef, description]
          );
        }
      }
    }

    return {
      entryId,
      transactionRef,
      isIdempotentReplay: false,
      totalDebits,
      totalCredits
    };
  }

  /**
   * Computes authoritative balance directly from immutable ledger lines
   */
  public static async getAuditedBalance(
    client: pg.PoolClient | pg.Pool,
    userId: number,
    accountType: LedgerAccountType = 'HOST_WALLET'
  ): Promise<number> {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN ll.entry_type = 'CREDIT' THEN ll.amount ELSE -ll.amount END), 0) as audited_balance
       FROM ledger_lines ll
       JOIN wallet_accounts wa ON ll.account_id = wa.id
       WHERE wa.user_id = $1 AND wa.account_type = $2`,
      [userId, accountType]
    );

    return Number(rows[0]?.audited_balance || 0);
  }
}
