import {afterAll,beforeAll,expect,vi} from 'vitest';
import pg from 'pg';
/** Compatibility storage only. Current provider/finance tests exercise positive v2 paths. */
export function useLegacyPaidBoundaryFixture() {
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 let hostId:number;
 beforeAll(async()=>{hostId=(await pool.query("INSERT INTO users(name,email,role)VALUES('Boundary host','boundary@example.test','host')RETURNING id")).rows[0].id;});
 afterAll(async()=>{await pool.end();});
 return {
  pool,
  async campaign(status='approved') {
   return (await pool.query("INSERT INTO host_marketing_campaigns(host_id,title,budget,status,admin_approved,policy_cleared,payment_status,escrow_status,media_urls)VALUES($1,'Boundary',100,$2,true,true,'paid','holding',$3) RETURNING id",[hostId,status,JSON.stringify(['https://assets.example.test/a.jpg','https://assets.example.test/b.jpg'])])).rows[0].id as number;
  },
 };
}
export async function assertRetiredPaidCall(pool:pg.Pool,id:number,action:()=>Promise<unknown>) {
 const tables=['host_marketing_campaigns','campaign_financial_contracts','campaign_creative_variants','meta_publishing_transactions','meta_publishing_events','provider_entities'];
 const snapshot=async()=>Promise.all(tables.map(table=>pool.query(`SELECT * FROM ${table} ORDER BY id`).then(result=>result.rows)));
 const before=await snapshot();
 const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Retired path attempted network access'));
 try {
  await expect(action()).rejects.toThrow('HARVO_V2_REQUIRED');
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
  expect((await pool.query('SELECT id FROM host_marketing_campaigns WHERE id=$1',[id])).rows).toHaveLength(1);
 } finally {fetchSpy.mockRestore();}
}
