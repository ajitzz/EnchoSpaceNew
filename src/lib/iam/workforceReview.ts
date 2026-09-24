import type pg from 'pg';
import {z} from 'zod';
import {workforceEnvironmentSchema} from '../../shared/iam/contracts.js';
import {principalContextSchema} from '../../shared/iam/principalContext.js';
import {workforceReviewRequestSchema,workforceReviewSchema,type WorkforceReview} from '../../shared/iam/workforceReview.js';
import {fingerprint} from '../marketing/domain.js';
import {PermissionNotGrantedError} from './authorizationPort.js';
import {PostgresWorkforceAuthorization} from './postgresAuthorization.js';
import {verifyIamWorkforceReviewCatalog} from '../../server/deployment/iamWorkforceReviewReadiness.js';

export class WorkforceReviewError extends Error{
  readonly status:number;
  constructor(readonly code:'INPUT_INVALID'|'PERMISSION_DENIED'|'REVIEW_UNAVAILABLE',cause?:unknown){
    super(code,{cause});this.name='WorkforceReviewError';this.status=code==='INPUT_INVALID'?400:code==='PERMISSION_DENIED'?403:503;
  }
}

/** Read-only domain projection; the transaction writes only its access receipt. */
export class WorkforceReviewReader{
  private readonly authorization:PostgresWorkforceAuthorization;
  private readonly environment:z.infer<typeof workforceEnvironmentSchema>;
  constructor(pool:pg.Pool,environment:z.infer<typeof workforceEnvironmentSchema>){
    this.environment=workforceEnvironmentSchema.parse(environment);
    this.authorization=new PostgresWorkforceAuthorization(pool,this.environment);
  }
  async read(rawPrincipal:unknown,rawRequest:unknown={}):Promise<WorkforceReview>{
    const principal=principalContextSchema.safeParse(rawPrincipal),request=workforceReviewRequestSchema.safeParse(rawRequest);
    if(!principal.success||!request.success)throw new WorkforceReviewError('INPUT_INVALID');
    if(principal.data.actorKind!=='STAFF')throw new WorkforceReviewError('PERMISSION_DENIED');
    const actor=principal.data,organizationId=actor.organizationId!;
    const commandHash=fingerprint({contract:'encho:workforce-review-read:v1',organizationId,environment:this.environment,request:request.data});
    try{
      return await this.authorization.runAuthorized({principal:actor,tenant:{kind:'INTERNAL_ORGANIZATION',organizationId},
        permission:'workforce.member.read',resource:{target:{type:'WORKFORCE',id:organizationId}},
        conditions:{environment:this.environment,commandHash,requestedAt:new Date().toISOString()},evidence:{},
      },async(client,decision)=>{
        if(!(await verifyIamWorkforceReviewCatalog(client)).ready)throw new WorkforceReviewError('REVIEW_UNAVAILABLE');
        const row=(await client.query<{projection:Record<string,unknown>}>(
          'SELECT internal_iam_project_workforce_review($1,$2,$3,$4,$5,$6) AS projection',
          [organizationId,this.environment,request.data.memberAfter??null,request.data.grantAfter??null,request.data.invitationAfter??null,request.data.limit])).rows[0];
        return workforceReviewSchema.parse({...row?.projection,correlationId:actor.correlationId,receiptId:decision.decisionId});
      });
    }catch(error){
      if(error instanceof WorkforceReviewError||error instanceof PermissionNotGrantedError)throw error;
      throw new WorkforceReviewError('REVIEW_UNAVAILABLE',error);
    }
  }
}
