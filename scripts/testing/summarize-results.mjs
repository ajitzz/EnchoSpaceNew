import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {relative, resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

// CI artifacts deliberately exclude assertion names, error messages, stacks,
// console output and arbitrary absolute paths. Those can contain fixture PII or
// credentials even when the test process itself has an isolated environment.
export function summarizeResults(report, root) {
  if (!report || !Array.isArray(report.testResults) || report.testResults.length > 10000)
    throw new Error('Invalid test report');
  const files = report.testResults.map(result => {
    if (typeof result.name !== 'string' || !Array.isArray(result.assertionResults)) throw new Error('Invalid test file');
    const name = relative(root, resolve(result.name)).replaceAll('\\', '/');
    if (isAbsolute(name) || !/^(?:src\/test\/[A-Za-z0-9_./-]+|test_[A-Za-z0-9_.-]+)\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)
      || name.split('/').includes('..')) throw new Error('Test report contains an unexpected path');
    const counts = {passed: 0, failed: 0, pending: 0};
    for (const assertion of result.assertionResults) {
      if (assertion.status === 'passed') counts.passed++;
      else if (assertion.status === 'failed') counts.failed++;
      else if (['pending', 'skipped', 'todo', 'disabled'].includes(assertion.status)) counts.pending++;
      else throw new Error('Unknown test outcome');
    }
    if (!['passed', 'failed', 'pending'].includes(result.status)) throw new Error('Unknown suite outcome');
    return {file: name, status: result.status, ...counts};
  }).sort((a,b) => a.file.localeCompare(b.file));
  return {
    schemaVersion: 1,
    filesPassed: files.filter(f => f.status === 'passed').length,
    filesFailed: files.filter(f => f.status === 'failed').length,
    ...files.reduce((sum,f) => ({passed: sum.passed + f.passed, failed: sum.failed + f.failed, pending: sum.pending + f.pending}), {passed:0,failed:0,pending:0}),
    files,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, output] = process.argv.slice(2);
    if (!input || !output || statSync(input).size > 100_000_000) throw new Error('Invalid input');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const summary = summarizeResults(JSON.parse(readFileSync(input, 'utf8')), root);
    writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', {mode:0o600});
    console.log(`Test evidence: ${summary.passed} passed, ${summary.failed} failed, ${summary.pending} pending; ${summary.filesFailed} failing files.`);
    for (const file of summary.files.filter(f => f.status === 'failed')) console.log(`FAILED ${file.file}`);
  } catch {
    // Parsing errors themselves must not echo the untrusted report.
    console.error('Safe test summary unavailable; inspect the isolated local run.');
    process.exitCode = 1;
  }
}
