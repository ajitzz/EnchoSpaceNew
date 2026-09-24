import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {scanRoutes} from './verify-inventory.mjs';

test('service factories retain their independently mounted participant and staff prefixes',()=>{
  const routes=scanRoutes('src/server/conversations/serviceRouter.ts',`
    export function createParticipantServiceRouter(){const router=Router();router.get('/threads/:id/assistance',handler);return router;}
    export function createStaffServiceRouter(){const router=Router();router.post('/read',handler);return router;}
  `);
  assert.deepEqual(routes.map(row=>row.paths),[['/api/conversations/v1/threads/:id/assistance'],['/api/operations/v1/service/read']]);
});
test('new factories fail closed until assigned a mounted prefix',()=>{
  assert.throws(()=>scanRoutes('src/server/conversations/serviceRouter.ts',`function newRouter(){const router=Router();router.get('/read',handler);}`),/Uninventoried route factory/);
});
test('generated session action loop expands its concrete paths',()=>{
  const routes=scanRoutes('src/server/operations/sessionRouter.ts',"function createWorkforceSessionRouter(){for(const action of ['begin','complete','logout'] as const)router.post(`/${action}`,handler);}");
  assert.equal(routes.length,1);
  assert.deepEqual(routes[0].paths,['/api/operations/v1/session/begin','/api/operations/v1/session/complete','/api/operations/v1/session/logout']);
});
test('setting reads are excluded and unknown dynamic paths fail closed',()=>{
  assert.equal(scanRoutes('server.ts',"app.get('io');app.get('/health',handler);").length,1);
  assert.throws(()=>scanRoutes('server.ts','app.post(computedRoute,handler);'),/Unresolved dynamic route/);
});
