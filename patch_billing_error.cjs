const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  // 5. Missing Payment Method
  if ((code === 100 && subcode === 1359188) || msg.includes('payment method')) {
    return {
      code_name: 'NO_PAYMENT_METHOD',
      category: 'AD_ACCOUNT',
      severity: 'BLOCKER',
      user_title: 'No Payment Method on Meta Ad Account',
      user_message: 'Master Ad Account has no valid payment method attached.',
      technical_message: \`Graph API Code 100 / Subcode 1359188: Payment method missing.\`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Add valid payment method in Meta Billing & Payment Centre.'
    };
  }`;

const replacement = `  // 5. Missing Payment Method
  if ((code === 100 && subcode === 1359188) || msg.includes('payment method')) {
    return {
      code_name: 'META_BILLING_PAYMENT_METHOD_REQUIRED',
      category: 'EXTERNAL_BILLING',
      severity: 'BLOCKER',
      user_title: 'No Payment Method on Meta Ad Account',
      user_message: 'Master Ad Account has no valid payment method attached.',
      technical_message: \`Graph API Code 100 / Subcode 1359188: Payment method missing.\`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Add a valid Meta-supported payment method to Master Meta Ad Account act_1681483723153196 in Meta Billing & Payments.'
    };
  }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log('Patched classifyMetaError for billing');
} else {
  console.log('classifyMetaError target not found');
}
