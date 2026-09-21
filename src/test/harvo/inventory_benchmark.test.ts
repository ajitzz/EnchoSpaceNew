import {describe,expect,it} from 'vitest';
import {runConcurrencyBenchmark} from '../../../scripts/bench_concurrency_pg.js';

describe('migration-backed disposable inventory benchmark',()=>{
  it('admits one of 100 simultaneous requests and allocates exactly two room nights',async()=>{
    expect(await runConcurrencyBenchmark()).toEqual({successes:1,conflicts:99,others:0,totalHeldUnits:2});
  },30000);
});
