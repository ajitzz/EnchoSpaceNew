const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `export function classifyMetaError(data: any): MetaErrorClassification {
  const e = data?.error || data;
  const code = Number(e?.code || 0);
  const subcode = Number(e?.error_subcode || 0);
  const msg = String(e?.message || e?.error_user_msg || (typeof data === 'string' ? data : '')).toLowerCase();`;

const replacement = `export function classifyMetaError(data: any): MetaErrorClassification {
  const e = data?.error || data;
  const code = Number(e?.code || 0);
  const subcode = Number(e?.error_subcode || 0);
  const msg = String(e?.message || e?.error_user_msg || (typeof data === 'string' ? data : '')).toLowerCase();

  if (msg.includes('assignment to constant variable') || msg.includes('is not a function') || msg.includes('is not defined') || e instanceof TypeError || e instanceof ReferenceError || msg.includes('cannot read properties') || msg.includes('typeerror') || msg.includes('referenceerror')) {
    return {
      code_name: 'INTERNAL_RUNTIME_ERROR',
      category: 'INTERNAL_APPLICATION',
      severity: 'BLOCKER',
      user_title: 'Internal Application Error',
      user_message: 'The publishing engine encountered an internal code execution fault.',
      technical_message: \`Runtime Error: \${e?.message || msg}\`,
      retryable: false,
      requires_human_action: false,
      blocks_dispatch: true,
      rollback_required: false,
      recommended_action: 'Engineering action required. Please inspect application logs.'
    };
  }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched classifyMetaError');
} else {
  console.log('classifyMetaError target not found');
}
