import { describe, it, expect } from 'vitest';
import { DoubleEntryLedgerService } from '../lib/doubleEntryLedgerService';

describe('Milestone 1: Immutable Double-Entry Ledger & Financial Safety', () => {
  it('records a balanced double-entry transaction (Debits === Credits)', async () => {
    const executedQueries: Array<{ sql: string; params: any[] }> = [];

    const mockClient = {
      query: async (sql: string, params: any[] = []) => {
        executedQueries.push({ sql, params });

        if (sql.includes('SELECT id FROM ledger_entries')) {
          return { rows: [] }; // No existing entry
        }
        if (sql.includes('INSERT INTO ledger_entries')) {
          return { rows: [{ id: 'entry-uuid-101' }] };
        }
        if (sql.includes('SELECT id FROM wallet_accounts')) {
          return { rows: [{ id: 501 }] };
        }
        if (sql.includes('INSERT INTO ledger_lines')) {
          return { rows: [{ id: 901 }] };
        }
        if (sql.includes('UPDATE wallet_accounts') || sql.includes('UPDATE host_wallets')) {
          return { rows: [] };
        }
        return { rows: [] };
      }
    };

    const result = await DoubleEntryLedgerService.recordTransaction(mockClient as any, {
      transactionRef: 'TX_REF_TEST_001',
      eventType: 'WALLET_FUNDING',
      description: 'Host wallet topup of ₹5000 via Stripe',
      lines: [
        {
          userId: null,
          accountType: 'GATEWAY_CLEARING',
          entryType: 'DEBIT',
          amount: 5000,
          currency: 'INR'
        },
        {
          userId: 101,
          accountType: 'HOST_WALLET',
          entryType: 'CREDIT',
          amount: 5000,
          currency: 'INR'
        }
      ]
    });

    expect(result.entryId).toBe('entry-uuid-101');
    expect(result.transactionRef).toBe('TX_REF_TEST_001');
    expect(result.isIdempotentReplay).toBe(false);
    expect(result.totalDebits).toBe(5000);
    expect(result.totalCredits).toBe(5000);
  });

  it('rejects unbalanced transactions where Debits != Credits', async () => {
    const mockClient = {
      query: async () => ({ rows: [] })
    };

    await expect(
      DoubleEntryLedgerService.recordTransaction(mockClient as any, {
        transactionRef: 'TX_UNBALANCED',
        eventType: 'WALLET_FUNDING',
        description: 'Unbalanced funding attempt',
        lines: [
          {
            userId: null,
            accountType: 'GATEWAY_CLEARING',
            entryType: 'DEBIT',
            amount: 5000,
            currency: 'INR'
          },
          {
            userId: 101,
            accountType: 'HOST_WALLET',
            entryType: 'CREDIT',
            amount: 4000, // Unbalanced by 1000
            currency: 'INR'
          }
        ]
      })
    ).rejects.toThrow(/LEDGER UNBALANCED/);
  });

  it('handles idempotent replay without duplicating ledger lines', async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes('SELECT id FROM ledger_entries')) {
          return { rows: [{ id: 'existing-entry-uuid-999' }] };
        }
        return { rows: [] };
      }
    };

    const result = await DoubleEntryLedgerService.recordTransaction(mockClient as any, {
      transactionRef: 'TX_IDEMPOTENT_REPLAY',
      eventType: 'AD_SPEND_DEDUCTION',
      description: 'Deduct ad spend',
      lines: [
        {
          userId: 101,
          accountType: 'HOST_WALLET',
          entryType: 'DEBIT',
          amount: 2500,
          currency: 'INR'
        },
        {
          userId: null,
          accountType: 'AD_SPEND_ESCROW',
          entryType: 'CREDIT',
          amount: 2500,
          currency: 'INR'
        }
      ]
    });

    expect(result.isIdempotentReplay).toBe(true);
    expect(result.entryId).toBe('existing-entry-uuid-999');
  });

  it('computes audited balance directly from immutable ledger lines', async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes('SELECT COALESCE(SUM')) {
          return { rows: [{ audited_balance: '12500.50' }] };
        }
        return { rows: [] };
      }
    };

    const balance = await DoubleEntryLedgerService.getAuditedBalance(mockClient as any, 101, 'HOST_WALLET');
    expect(balance).toBe(12500.50);
  });
});
