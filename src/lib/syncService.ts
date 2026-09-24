// Keep a single implementation of durable browser synchronization. The former
// duplicate drifted independently and could bypass actor-scoping safeguards.
export * from '../../lib/syncService.js';
