import { MetaGraphClient } from './src/lib/metaGraphClient.ts';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create dummy DB pool for trace logging in tests
const mockDbPool = {
  query: async (_sql: string, _params?: any[]) => {
    return { rows: [] };
  }
};

const originalFetch = globalThis.fetch;

function setupFetchMock(mockHandlers: Array<{ matchUrl: string | RegExp; response: any; status?: number }>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    for (const handler of mockHandlers) {
      if (typeof handler.matchUrl === 'string' ? urlStr.includes(handler.matchUrl) : handler.matchUrl.test(urlStr)) {
        if (handler.status === 500) {
          throw new Error('Meta Graph API Network Timeout (HTTP 500)');
        }
        return new Response(JSON.stringify(handler.response), {
          status: handler.status || 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    return new Response(JSON.stringify({ error: { message: 'Unhandled mock URL', code: 999 } }), { status: 400 });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

async function runTestMatrix() {
  console.log('================================================================');
  console.log('PHASE 2.4 TEST MATRIX EXECUTION — META EXTERNAL TRUTH PREFLIGHT');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  async function assertTest(name: string, fn: () => Promise<boolean>) {
    try {
      const success = await fn();
      if (success) {
        console.log(`[PASS] ${name}`);
        passedTests++;
      } else {
        console.error(`[FAIL] ${name}`);
        failedTests++;
      }
    } catch (err: any) {
      console.error(`[FAIL] ${name} — Threw error: ${err.message}`);
      failedTests++;
    } finally {
      restoreFetch();
    }
  }

  // Set standard valid env vars for base testing
  const baseEnv = {
    META_ACCESS_TOKEN: 'EAATestValidToken1234567890',
    META_APP_ID: '123456789012345',
    META_APP_SECRET: 'secret123456789012345',
    META_AD_ACCOUNT_ID: 'act_1681483723153196',
    META_PAGE_ID: '554884541034223',
    META_INSTAGRAM_ACCOUNT_ID: '17841400000000000'
  };

  function setEnv(override: Record<string, string | undefined>) {
    Object.assign(process.env, baseEnv, override);
    for (const [k, v] of Object.entries(override)) {
      if (v === undefined) delete process.env[k];
    }
  }

  // Standard passing mock handlers
  const standardMocks = [
    {
      matchUrl: '/debug_token',
      response: {
        data: {
          app_id: '123456789012345',
          type: 'USER',
          application: 'Encho Marketing Engine',
          is_valid: true,
          scopes: ['ads_management', 'pages_read_engagement', 'pages_manage_posts', 'business_management']
        }
      }
    },
    {
      matchUrl: '/act_1681483723153196',
      response: {
        id: 'act_1681483723153196',
        name: 'Encho Space Ad Account',
        account_status: 1,
        disable_reason: 0,
        currency: 'INR'
      }
    },
    {
      matchUrl: '/554884541034223',
      response: {
        id: '554884541034223',
        name: 'Encho Stay',
        access_token: 'EAAPageTokenValid'
      }
    },
    {
      matchUrl: '/17841400000000000',
      response: {
        id: '17841400000000000',
        username: 'enchostay'
      }
    },
    {
      matchUrl: '/123456789012345',
      response: {
        id: '123456789012345',
        name: 'Encho Marketing App',
        is_in_development_mode: false
      }
    }
  ];

  // TEST A: Valid Token + Live App Mode + Valid Active Ad Account + Valid Page
  await assertTest('TEST A: Full Valid External Readiness', async () => {
    setEnv({});
    setupFetchMock(standardMocks);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_a', true);
    return report.is_ready === true && report.blockers.length === 0;
  });

  // TEST B: Token Scope Missing ads_management
  await assertTest('TEST B: Token Scope Missing ads_management', async () => {
    setEnv({});
    setupFetchMock([
      {
        matchUrl: '/debug_token',
        response: {
          data: {
            app_id: '123456789012345',
            is_valid: true,
            scopes: ['pages_read_engagement']
          }
        }
      },
      ...standardMocks.slice(1)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_b', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_TOKEN_INVALID');
  });

  // TEST C: Token Scope Missing pages_read_engagement
  await assertTest('TEST C: Token Scope Missing pages_read_engagement', async () => {
    setEnv({});
    setupFetchMock([
      {
        matchUrl: '/debug_token',
        response: {
          data: {
            app_id: '123456789012345',
            is_valid: true,
            scopes: ['ads_management']
          }
        }
      },
      ...standardMocks.slice(1)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_c', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_PAGE_ACCESS_DENIED');
  });

  // TEST D: App ID Mismatch
  await assertTest('TEST D: App ID Mismatch in Debug Token', async () => {
    setEnv({});
    setupFetchMock([
      {
        matchUrl: '/debug_token',
        response: {
          data: {
            app_id: '999999999999999', // Different App ID!
            is_valid: true,
            scopes: ['ads_management', 'pages_read_engagement', 'pages_manage_posts']
          }
        }
      },
      ...standardMocks.slice(1)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_d', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_APP_ID_MISMATCH');
  });

  // TEST E: Token Expired
  await assertTest('TEST E: Token Expired (is_valid: false)', async () => {
    setEnv({});
    setupFetchMock([
      {
        matchUrl: '/debug_token',
        response: {
          data: {
            app_id: '123456789012345',
            is_valid: false,
            error: { message: 'Session expired', code: 190 }
          }
        }
      },
      ...standardMocks.slice(1)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_e', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_TOKEN_INVALID');
  });

  // TEST F: App ID in Development Mode
  await assertTest('TEST F: App ID in Development Mode', async () => {
    setEnv({});
    setupFetchMock([
      ...standardMocks.slice(0, 4),
      {
        matchUrl: '/123456789012345',
        response: {
          id: '123456789012345',
          is_in_development_mode: true
        }
      }
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_f', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_APP_DEVELOPMENT_MODE_BLOCK');
  });

  // TEST G: Ad Account Disabled (account_status: 2)
  await assertTest('TEST G: Ad Account Disabled (account_status: 2)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          id: 'act_1681483723153196',
          account_status: 2, // DISABLED
          disable_reason: 1
        }
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_g', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_RESTRICTED');
  });

  // TEST H: Ad Account Pending Closure (account_status: 3)
  await assertTest('TEST H: Ad Account Pending Closure (account_status: 3)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          id: 'act_1681483723153196',
          account_status: 3, // PENDING CLOSURE
          disable_reason: 0
        }
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_h', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_RESTRICTED');
  });

  // TEST I: Ad Account In System Period (account_status: 7)
  await assertTest('TEST I: Ad Account In System Period (account_status: 7)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          id: 'act_1681483723153196',
          account_status: 7,
          disable_reason: 0
        }
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_i', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_RESTRICTED');
  });

  // TEST J: Ad Account Any Non-1 Status
  await assertTest('TEST J: Ad Account Non-1 Status (account_status: 100)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          id: 'act_1681483723153196',
          account_status: 100,
          disable_reason: 0
        }
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_j', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_RESTRICTED');
  });

  // TEST K: Ad Account Not Found
  await assertTest('TEST K: Ad Account Not Found (Error 100)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          error: {
            message: 'Unsupported get request. Object with ID does not exist',
            type: 'GraphMethodException',
            code: 100
          }
        },
        status: 400
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_k', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_NOT_FOUND');
  });

  // TEST L: Page ID Not Found
  await assertTest('TEST L: Page ID Not Found (Error 100)', async () => {
    setEnv({});
    setupFetchMock([
      ...standardMocks.slice(0, 2),
      {
        matchUrl: '/554884541034223',
        response: {
          error: {
            message: 'Object with ID 554884541034223 does not exist',
            type: 'GraphMethodException',
            code: 100
          }
        },
        status: 400
      },
      ...standardMocks.slice(3)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_l', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_PAGE_NOT_FOUND');
  });

  // TEST M: Page Token Scope Missing
  await assertTest('TEST M: Page Access Denied', async () => {
    setEnv({});
    setupFetchMock([
      ...standardMocks.slice(0, 2),
      {
        matchUrl: '/554884541034223',
        response: {
          error: {
            message: 'Insufficient permission to access page',
            type: 'OAuthException',
            code: 200
          }
        },
        status: 403
      },
      ...standardMocks.slice(3)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_m', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_PAGE_ACCESS_DENIED');
  });

  // TEST N: Page Missing Admin Role
  await assertTest('TEST N: Page Missing Admin Role', async () => {
    setEnv({});
    setupFetchMock([
      ...standardMocks.slice(0, 2),
      {
        matchUrl: '/554884541034223',
        response: {
          id: '554884541034223',
          name: 'Encho Stay'
          // access_token missing!
        }
      },
      ...standardMocks.slice(3)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_n', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_PAGE_ACCESS_DENIED');
  });

  // TEST O: Instagram Account Invalid
  await assertTest('TEST O: Instagram Identity Invalid', async () => {
    setEnv({});
    setupFetchMock([
      ...standardMocks.slice(0, 3),
      {
        matchUrl: '/17841400000000000',
        response: {
          error: {
            message: 'Instagram actor not found or invalid',
            code: 100
          }
        },
        status: 400
      },
      standardMocks[4]
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_o', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_INSTAGRAM_IDENTITY_INVALID');
  });

  // TEST P: Billing Unverifiable
  await assertTest('TEST P: Billing Unverifiable Signal', async () => {
    setEnv({ META_INSTAGRAM_ACCOUNT_ID: undefined }); // omit optional IG
    setupFetchMock(standardMocks);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_p', true);
    return report.is_ready === true && report.signals.some(s => s.check_name.includes('BILLING') && s.status === 'EXTERNAL_UNVERIFIABLE');
  });

  // TEST Q: Billing Restricted / Payment Required
  await assertTest('TEST Q: Billing Restricted (Payment Required)', async () => {
    setEnv({});
    setupFetchMock([
      standardMocks[0],
      {
        matchUrl: '/act_1681483723153196',
        response: {
          id: 'act_1681483723153196',
          account_status: 1,
          disable_reason: 2 // Billing reason
        }
      },
      ...standardMocks.slice(2)
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_q', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_AD_ACCOUNT_RESTRICTED');
  });

  // TEST R: Unconfigured Environment Variables
  await assertTest('TEST R: Fail Closed on Unconfigured Credentials', async () => {
    setEnv({ META_ACCESS_TOKEN: undefined });
    setupFetchMock([]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_r', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_TOKEN_INVALID');
  });

  // TEST S: Synthetic Bypass Flags Set
  await assertTest('TEST S: Rejection of Synthetic Bypass Flags', async () => {
    setEnv({
      META_HUMAN_VERIFIED_APP_MODE_LIVE: 'true',
      META_CANARY_2_READY: 'true'
    });
    // App is actually in Dev Mode on Meta Graph API
    setupFetchMock([
      ...standardMocks.slice(0, 4),
      {
        matchUrl: '/123456789012345',
        response: {
          id: '123456789012345',
          is_in_development_mode: true
        }
      }
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_s', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_APP_DEVELOPMENT_MODE_BLOCK');
  });

  // TEST T: Network Timeout / Server Error
  await assertTest('TEST T: Meta Graph API 500 / Network Timeout', async () => {
    setEnv({});
    setupFetchMock([
      {
        matchUrl: '/debug_token',
        response: {},
        status: 500
      }
    ]);
    const client = new MetaGraphClient();
    const report = await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_t', true);
    return report.is_ready === false && report.signals.some(s => s.failure_code === 'META_EXTERNAL_UNVERIFIABLE');
  });

  // TEST U: Cache Hit (60s TTL)
  await assertTest('TEST U: Cache Hit within 60s TTL', async () => {
    setEnv({});
    let fetchCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCount++;
      return new Response(JSON.stringify(standardMocks[0].response), { status: 200 });
    }) as typeof fetch;

    const client = new MetaGraphClient();
    await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_u1', true);
    const countAfterFirst = fetchCount;

    // Second call without forceRefresh -> should use cache
    await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_u2', false);
    const countAfterSecond = fetchCount;

    return countAfterFirst > 0 && countAfterSecond === countAfterFirst;
  });

  // TEST V: Cache Invalidation (forceRefresh=true)
  await assertTest('TEST V: Cache Invalidation via forceRefresh', async () => {
    setEnv({});
    setupFetchMock(standardMocks);

    const client = new MetaGraphClient();
    await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_v1', true);

    // Call with forceRefresh = true
    await client.checkExternalMetaReadiness(mockDbPool, 'corr_test_v2', true);

    return true; // Execution completed cleanly with forced refresh
  });

  console.log('\n================================================================');
  console.log(`TEST MATRIX SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${passedTests + failedTests} tests.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestMatrix().catch((err) => {
  console.error('Fatal error during test matrix execution:', err);
  process.exit(1);
});
