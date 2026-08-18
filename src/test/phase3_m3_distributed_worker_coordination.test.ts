import { describe, it, expect, vi } from 'vitest';
import { DistributedLockService } from '../lib/distributedLock';
import { WebhookWorkerService } from '../lib/webhookWorkerService';

describe('Milestone 3 — Distributed Worker Coordination & Multi-Replica Concurrency', () => {

  describe('1. DistributedLockService — Connection Pinning & Dual-Tier Distributed Locking', () => {
    it('pins lock acquisition, execution, and unlock to the EXACT same pg.PoolClient', async () => {
      const clientQueryMock = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO encho_distributed_worker_locks')) {
          return { rows: [{ lock_id: 1003 }] };
        }
        if (sql.includes('pg_try_advisory_lock')) {
          return { rows: [{ acquired: true }] };
        }
        if (sql.includes('pg_advisory_unlock')) {
          return { rows: [{ unlocked: true }] };
        }
        return { rows: [] };
      });
      const clientReleaseMock = vi.fn();
      const mockClient = {
        query: clientQueryMock,
        release: clientReleaseMock
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient)
      } as any;

      let executed = false;
      const result = await DistributedLockService.withAdvisoryLock(
        mockPool,
        DistributedLockService.LOCKS.ESCROW_AUTO_RELEASE,
        'testWorker',
        async (client) => {
          expect(client).toBe(mockClient);
          executed = true;
          return 'worker_done';
        }
      );

      expect(result.lockAcquired).toBe(true);
      expect(result.executed).toBe(true);
      expect(result.result).toBe('worker_done');
      expect(executed).toBe(true);
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
      expect(clientQueryMock).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [1003]);
      expect(clientReleaseMock).toHaveBeenCalledTimes(1);
    });

    it('immediately skips execution if lock lease is already held by another replica', async () => {
      const clientQueryMock = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO encho_distributed_worker_locks')) {
          return { rows: [] }; // No row updated -> Active lease held by another node
        }
        return { rows: [] };
      });
      const clientReleaseMock = vi.fn();
      const mockClient = {
        query: clientQueryMock,
        release: clientReleaseMock
      };
      const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient)
      } as any;

      let executed = false;
      const result = await DistributedLockService.withAdvisoryLock(
        mockPool,
        DistributedLockService.LOCKS.ESCROW_AUTO_RELEASE,
        'testWorker',
        async () => {
          executed = true;
        }
      );

      expect(result.lockAcquired).toBe(false);
      expect(result.executed).toBe(false);
      expect(executed).toBe(false);
      expect(clientQueryMock).not.toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [1003]);
      expect(clientReleaseMock).toHaveBeenCalledTimes(1);
    });

    it('always releases the client back to pool even if task throws an error', async () => {
      const clientQueryMock = vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO encho_distributed_worker_locks')) {
          return { rows: [{ lock_id: 1004 }] };
        }
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
        if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] };
        return { rows: [] };
      });
      const clientReleaseMock = vi.fn();
      const mockClient = { query: clientQueryMock, release: clientReleaseMock };
      const mockPool = { connect: vi.fn().mockResolvedValue(mockClient) } as any;

      const result = await DistributedLockService.withAdvisoryLock(
        mockPool,
        DistributedLockService.LOCKS.DYNAMIC_CREATIVE_OPT,
        'failingWorker',
        async () => {
          throw new Error('Task crashed abruptly');
        }
      );

      expect(result.lockAcquired).toBe(true);
      expect(result.executed).toBe(true);
      expect(result.error?.message).toBe('Task crashed abruptly');
      expect(clientQueryMock).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [1004]);
      expect(clientReleaseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Multi-Replica Concurrency Simulations (10 Mock Replicas)', () => {
    it('ensures exactly 1 replica wins execution when 10 replicas fire simultaneously', async () => {
      let activeLockHolder: number | null = null;
      const lockState = new Map<number, boolean>();

      const createMockPoolForReplica = (replicaId: number) => {
        return {
          connect: async () => {
            return {
              query: async (sql: string, params: any[]) => {
                if (sql.includes('INSERT INTO encho_distributed_worker_locks')) {
                  const lockId = params[0];
                  if (!lockState.get(lockId)) {
                    lockState.set(lockId, true);
                    activeLockHolder = replicaId;
                    return { rows: [{ lock_id: lockId }] };
                  }
                  return { rows: [] };
                }
                if (sql.includes('UPDATE encho_distributed_worker_locks')) {
                  const lockId = params[0];
                  lockState.set(lockId, false);
                  activeLockHolder = null;
                  return { rows: [] };
                }
                return { rows: [] };
              },
              release: () => {}
            };
          }
        } as any;
      };

      const executionLog: number[] = [];
      const replicaPromises = Array.from({ length: 10 }, (_, i) => {
        const replicaPool = createMockPoolForReplica(i + 1);
        return DistributedLockService.withAdvisoryLock(
          replicaPool,
          DistributedLockService.LOCKS.META_RECONCILIATION,
          `replica_${i + 1}`,
          async () => {
            executionLog.push(i + 1);
            await new Promise(r => setTimeout(r, 20));
          }
        );
      });

      const results = await Promise.all(replicaPromises);

      const lockAcquiredCount = results.filter(r => r.lockAcquired).length;
      const skippedCount = results.filter(r => !r.lockAcquired).length;

      expect(lockAcquiredCount).toBe(1);
      expect(skippedCount).toBe(9);
      expect(executionLog.length).toBe(1);
      expect(lockState.get(DistributedLockService.LOCKS.META_RECONCILIATION)).toBe(false);
    });
  });

  describe('3. Queue Workers Concurrency Safety (FOR UPDATE SKIP LOCKED)', () => {
    it('concurrently drains queue across multiple worker threads without duplication', async () => {
      const queue = Array.from({ length: 30 }, (_, i) => ({
        webhook_id: `wh_${i + 1}`,
        status: 'pending',
        attempts: 0,
        provider: 'stripe',
        event_type: 'checkout.session.completed',
        payload: { data: { object: { id: `pi_${i + 1}`, metadata: { campaign_id: `${i + 1}`, transaction_id: `${100 + i}` } } } },
        correlation_id: `corr_${i + 1}`
      }));

      const processedIds = new Set<string>();

      const mockPool = {
        query: vi.fn().mockImplementation(async (sql: string, params: any[]) => {
          if (sql.includes('UPDATE inbound_webhooks') && sql.includes('FOR UPDATE SKIP LOCKED')) {
            const pending = queue.filter(r => r.status === 'pending').slice(0, 10);
            pending.forEach(r => { r.status = 'processing'; r.attempts += 1; });
            return { rows: pending };
          }
          if (sql.includes("UPDATE inbound_webhooks \n            SET status = 'completed'")) {
            const id = params[0];
            const item = queue.find(r => r.webhook_id === id);
            if (item) item.status = 'completed';
            return { rows: [] };
          }
          return { rows: [] };
        })
      } as any;

      const mockPaymentHandler = vi.fn().mockImplementation(async (txId, campId, piId) => {
        const idKey = String(txId || campId || piId);
        if (processedIds.has(idKey)) {
          throw new Error(`DOUBLE PROCESSING DETECTED for ${idKey}`);
        }
        processedIds.add(idKey);
      });

      const sweep1 = await WebhookWorkerService.processInboundWebhooks(mockPool, mockPaymentHandler);
      const sweep2 = await WebhookWorkerService.processInboundWebhooks(mockPool, mockPaymentHandler);
      const sweep3 = await WebhookWorkerService.processInboundWebhooks(mockPool, mockPaymentHandler);

      expect(sweep1.processed).toBe(10);
      expect(sweep2.processed).toBe(10);
      expect(sweep3.processed).toBe(10);
      expect(processedIds.size).toBe(30);
      expect(queue.every(r => r.status === 'completed')).toBe(true);
    });
  });

  describe('4. Escrow Auto-Release Multi-Replica Financial Invariance', () => {
    it('prevents double-crediting host wallet when multiple replicas attempt escrow release', async () => {
      let lockHeld = false;
      let escrowStatus = 'PENDING';
      let walletBalance = 0;
      const releaseAmount = 1000;

      const mockPool = {
        connect: async () => ({
          query: async (sql: string, params: any[]) => {
            if (sql.includes('INSERT INTO encho_distributed_worker_locks')) {
              if (!lockHeld) {
                lockHeld = true;
                return { rows: [{ lock_id: params[0] }] };
              }
              return { rows: [] };
            }
            if (sql.includes('UPDATE encho_distributed_worker_locks')) {
              lockHeld = false;
              return { rows: [] };
            }
            return { rows: [] };
          },
          release: () => {}
        })
      } as any;

      const executeEscrowReleaseCycle = async () => {
        return DistributedLockService.withAdvisoryLock(
          mockPool,
          DistributedLockService.LOCKS.ESCROW_AUTO_RELEASE,
          'escrowWorker',
          async () => {
            if (escrowStatus === 'RELEASED') return;
            escrowStatus = 'RELEASED';
            walletBalance += releaseAmount;
          }
        );
      };

      const attempts = await Promise.all([
        executeEscrowReleaseCycle(),
        executeEscrowReleaseCycle(),
        executeEscrowReleaseCycle(),
        executeEscrowReleaseCycle(),
        executeEscrowReleaseCycle()
      ]);

      const executedCount = attempts.filter(a => a.lockAcquired).length;
      expect(executedCount).toBe(1);
      expect(walletBalance).toBe(1000); // Exact, NOT 5000!
      expect(escrowStatus).toBe('RELEASED');
    });
  });
});
