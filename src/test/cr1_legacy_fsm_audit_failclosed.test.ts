import { describe, expect, it, vi } from 'vitest';
import { transitionCampaignState } from '../../server.js';
import { createLocalPostgresFixture } from './harvo/postgres.js';

describe('R2-01 legacy campaign transition audit boundary', () => {
  it.each(['cancelled', 'killed'] as const)('rejects administrator-labelled resurrection from terminal %s', async status => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [{ id: 214, status, host_id: 9 }] };
      },
    };
    await expect(transitionCampaignState({
      campaignId: 214,
      expectedCurrentState: status,
      to: 'CAMPAIGN_LIVE',
      actorType: 'admin',
      actorId: 1,
      reason: 'must not revive terminal campaign',
      client,
    })).rejects.toThrow(/terminal|illegal transition/i);
    expect(statements.some(sql => sql.includes('UPDATE host_marketing_campaigns'))).toBe(false);
  });

  it('does not report a successful state change when the audit insert fails', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('SELECT * FROM host_marketing_campaigns')) {
          return { rows: [{ id: 214, status: 'draft', host_id: 9 }] };
        }
        if (sql.includes('INSERT INTO meta_publishing_events')) {
          throw new Error('audit write unavailable');
        }
        return { rows: [], rowCount: 1 };
      },
    };

    await expect(transitionCampaignState({
      campaignId: 214,
      expectedCurrentState: 'draft',
      to: 'pending_approval',
      actorType: 'system',
      reason: 'audit failure regression',
      client,
    })).rejects.toThrow('audit write unavailable');
    expect(statements.some(sql => sql.includes('UPDATE host_marketing_campaigns'))).toBe(true);
    expect(statements.some(sql => sql.includes('INSERT INTO meta_publishing_events'))).toBe(true);
  });

  it('rolls back a caller-owned transition on real disposable PostgreSQL when its audit insert fails', async () => {
    // The common legacy test setup mocks `pg`; explicitly supply its real
    // driver so this case exercises a separate disposable PostgreSQL server.
    const actualPg = await vi.importActual<typeof import('pg')>('pg');
    const fixture = await createLocalPostgresFixture({ schema: 'empty', driver: actualPg.default });
    try {
      await fixture.pool.query(`
        CREATE TABLE host_marketing_campaigns (
          id integer PRIMARY KEY, host_id integer NOT NULL, status text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE TABLE meta_publishing_events (
          id bigserial PRIMARY KEY, campaign_id integer NOT NULL,
          correlation_id text NOT NULL, event_type text NOT NULL,
          from_state text, to_state text NOT NULL, actor_type text,
          actor_id text, reason text NOT NULL,
          CONSTRAINT reject_test_audit CHECK (reason <> 'audit failure regression')
        );
        INSERT INTO host_marketing_campaigns(id,host_id,status) VALUES (214,9,'draft');
      `);

      const writer = await fixture.pool.connect();
      try {
        await writer.query('BEGIN');
        await expect(transitionCampaignState({
          campaignId: 214,
          expectedCurrentState: 'draft',
          to: 'pending_approval',
          actorType: 'system',
          reason: 'audit failure regression',
          client: writer,
        })).rejects.toThrow(/reject_test_audit/);
        await writer.query('ROLLBACK');
      } finally {
        writer.release();
      }

      // A separate connection must see neither a state change nor an audit row.
      expect((await fixture.pool.query('SELECT status FROM host_marketing_campaigns WHERE id=$1', [214])).rows)
        .toEqual([{ status: 'draft' }]);
      expect((await fixture.pool.query('SELECT id FROM meta_publishing_events')).rows).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 30000);
});
