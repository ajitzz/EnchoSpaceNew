const classifyMetaError = (raw) => {
  const msg = (raw.error?.message || raw.message || JSON.stringify(raw)).toLowerCase();
  const code = raw.error?.code || raw.code;
  const subcode = raw.error?.error_subcode || raw.error_subcode;

  if ((code === 100 && subcode === 1885183) || msg.includes('development mode')) {
    return {
      code_name: 'META_APP_DEVELOPMENT_MODE_BLOCK',
      category: 'APP_CONFIGURATION',
      severity: 'BLOCKER',
      user_title: 'Meta App in Development Mode',
      user_message: 'Ads creative post was created by an app that is in Development Mode and must be public/live to create the ad.',
      technical_message: `Graph API Error Code 100 / Subcode 1885183: App in Development Mode.`,
      retryable: false,
      requires_human_action: true,
      blocks_dispatch: true,
      rollback_required: true,
      recommended_action: 'Switch Meta App 1347659864208278 from Development to Live/Public Mode in Meta Developers Console.'
    };
  }
  return { code_name: 'UNKNOWN', category: 'UNKNOWN' };
};

const err = new Error('Preflight Failed: Infrastructure Blocker — Meta App 1347659864208278 is currently in Development Mode on Meta Developers Console (error 100/1885183).');
err.metaData = { error: { message: err.message } };

const rawErrorPayload = err.metaData;
const classification = classifyMetaError(rawErrorPayload);
console.log(classification);
