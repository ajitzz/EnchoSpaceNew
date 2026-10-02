import { restrictedWebRuntimeRolePlan } from '../../src/server/deployment/restrictedWebRuntimeRolePlan.js';

// Review-only SQL output. This script has no database client, env-file loader,
// password handling, or execution path. A migration owner must apply reviewed
// statements to one explicitly identified database after staging validation.
if (process.argv.length !== 3) {
  console.error('Usage: tsx scripts/deployment/print-restricted-web-role-plan.ts <new_runtime_role>');
  process.exitCode = 2;
} else {
  try {
    for (const statement of restrictedWebRuntimeRolePlan(process.argv[2])) {
      process.stdout.write(`${statement};\n`);
    }
  } catch {
    console.error('RUNTIME_ROLE_INVALID');
    process.exitCode = 2;
  }
}
