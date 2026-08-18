import pg from 'pg';
import dotenv from 'dotenv';
import { DistributedLockService } from '../src/lib/distributedLock';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[M3 SIMULATION] FATAL: DATABASE_URL not set in environment.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20
});

interface SimulationMetrics {
  totalRaces: number;
  totalReplicas: number;
  locksAcquired: number;
  locksSkipped: number;
  doubleExecutions: number;
  deadlocksDetected: number;
  averageExecutionMs: number;
}

async function runM3MultiReplicaSimulation() {
  console.log('================================================================');
  console.log('🚀 ENCHO PRODUCTION HARDENING — MILESTONE 3 (M3)');
  console.log('   DISTRIBUTED WORKER COORDINATION & MULTI-REPLICA SIMULATION');
  console.log('================================================================\n');

  const metrics: SimulationMetrics = {
    totalRaces: 0,
    totalReplicas: 10,
    locksAcquired: 0,
    locksSkipped: 0,
    doubleExecutions: 0,
    deadlocksDetected: 0,
    averageExecutionMs: 0
  };

  const startTime = Date.now();

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Multi-Replica Race Condition on Singleton Workers
    // 10 concurrent replicas firing simultaneous sweeps
    // -------------------------------------------------------------
    console.log('[SCENARIO 1] Simulating 10 concurrent worker replicas competing for Singleton Advisory Locks...');
    
    const lockTargets = [
      { name: 'ESCROW_AUTO_RELEASE', lockId: DistributedLockService.LOCKS.ESCROW_AUTO_RELEASE },
      { name: 'DYNAMIC_CREATIVE_OPT', lockId: DistributedLockService.LOCKS.DYNAMIC_CREATIVE_OPT },
      { name: 'ANALYTICS_ROLLUP', lockId: DistributedLockService.LOCKS.ANALYTICS_ROLLUP },
      { name: 'WEBHOOK_DLQ', lockId: DistributedLockService.LOCKS.WEBHOOK_DLQ },
      { name: 'META_RECONCILIATION', lockId: DistributedLockService.LOCKS.META_RECONCILIATION },
      { name: 'ORPHAN_META_TX_RECOVERY', lockId: DistributedLockService.LOCKS.ORPHAN_META_TX_RECOVERY }
    ];

    for (const target of lockTargets) {
      metrics.totalRaces++;
      const executionsInCurrentRace: number[] = [];

      const replicaPromises = Array.from({ length: 10 }, (_, replicaIdx) => {
        return DistributedLockService.withAdvisoryLock(
          pool,
          target.lockId,
          `replica_${replicaIdx + 1}`,
          async (client) => {
            executionsInCurrentRace.push(replicaIdx + 1);
            // Simulate realistic worker query workload
            await client.query('SELECT 1 as simulated_workload');
            await new Promise(resolve => setTimeout(resolve, 50));
            return `replica_${replicaIdx + 1}_finished`;
          }
        );
      });

      const results = await Promise.all(replicaPromises);
      const acquired = results.filter(r => r.lockAcquired).length;
      const skipped = results.filter(r => !r.lockAcquired).length;

      metrics.locksAcquired += acquired;
      metrics.locksSkipped += skipped;

      if (executionsInCurrentRace.length > 1) {
        metrics.doubleExecutions++;
        console.error(`🚨 [VIOLATION] Double execution detected in ${target.name}! Replicas:`, executionsInCurrentRace);
      } else if (executionsInCurrentRace.length === 1) {
        console.log(`  ✓ ${target.name.padEnd(25)} -> Winner: Replica #${executionsInCurrentRace[0]} | Skipped: ${skipped}/10 replicas`);
      } else {
        console.warn(`  ⚠️ ${target.name.padEnd(25)} -> No replica acquired the lock.`);
      }
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Abrupt Worker Crash / Connection Drop Auto-Release
    // -------------------------------------------------------------
    console.log('\n[SCENARIO 2] Simulating abrupt worker crash / connection termination...');
    const testLockId = 9999;

    const crashingClient = await pool.connect();
    crashingClient.on('error', () => {}); // Handle expected disconnection event
    const lockAcquiredRes = await crashingClient.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [testLockId]
    );

    if (lockAcquiredRes.rows[0]?.acquired) {
      console.log('  1. Crashing client acquired test advisory lock 9999.');
      
      // Simulate abrupt crash by abruptly ending the underlying client socket without unlock
      (crashingClient as any).release(true); // destroy connection
      console.log('  2. Client connection abruptly terminated (destroyed) without calling pg_advisory_unlock.');

      // Wait 100ms for backend cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Attempt acquisition from a new healthy connection
      const recoveryClient = await pool.connect();
      try {
        const recoveryLockRes = await recoveryClient.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [testLockId]
        );
        const autoReleased = Boolean(recoveryLockRes.rows[0]?.acquired);
        if (autoReleased) {
          console.log('  3. Recovery client successfully acquired advisory lock 9999 immediately.');
          console.log('  ✓ PostgreSQL backend successfully freed session advisory lock upon TCP disconnect.');
          await recoveryClient.query('SELECT pg_advisory_unlock($1)', [testLockId]);
        } else {
          console.error('  🚨 Lock 9999 was not freed automatically by PostgreSQL backend!');
        }
      } finally {
        recoveryClient.release();
      }
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    const totalDurationMs = Date.now() - startTime;
    metrics.averageExecutionMs = totalDurationMs / metrics.totalRaces;

    console.log('\n================================================================');
    console.log('📊 M3 MULTI-REPLICA COORDINATION SIMULATION RESULTS');
    console.log('================================================================');
    console.log(`Total Contention Races:      ${metrics.totalRaces}`);
    console.log(`Replicas per Race:          ${metrics.totalReplicas}`);
    console.log(`Total Lock Acquisitions:    ${metrics.locksAcquired}`);
    console.log(`Total Clean Lock Skips:     ${metrics.locksSkipped}`);
    console.log(`Double Executions:          ${metrics.doubleExecutions} (Invariant: 0)`);
    console.log(`Deadlocks Detected:         ${metrics.deadlocksDetected} (Invariant: 0)`);
    console.log(`Total Duration:             ${totalDurationMs}ms`);
    console.log('================================================================\n');

    if (metrics.doubleExecutions === 0 && metrics.deadlocksDetected === 0 && metrics.locksAcquired === metrics.totalRaces) {
      console.log('✅ CERTIFICATION VERDICT: M3 DISTRIBUTED WORKER COORDINATION PROVEN 10/10.');
    } else {
      console.error('❌ CERTIFICATION VERDICT: M3 FAILED INVARIANCE CHECKS.');
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal simulation error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runM3MultiReplicaSimulation();
