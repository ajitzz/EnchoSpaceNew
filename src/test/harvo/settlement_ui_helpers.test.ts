import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {settlementMinor,verifySettlementBytes} from '../../../components/marketing/settlementHelpers.js';
describe('settlement evidence user-input boundary',()=>{
 it('preserves zero, exact decimals and values above JavaScript safe integer range',()=>{expect(settlementMinor('0')).toBe('0');expect(settlementMinor('10.09')).toBe('1009');expect(settlementMinor('90071992547409.93')).toBe('9007199254740993');});
 it.each(['','-1','1e3','1.005','01','1,000','92233720368547758.08'])('rejects ambiguous or unsupported amount %s',value=>expect(()=>settlementMinor(value)).toThrow());
 it('reads the actual downloaded bytes and refuses substituted document content',async()=>{const bytes=new TextEncoder().encode('retained invoice bytes').buffer;const hash=createHash('sha256').update(new Uint8Array(bytes)).digest('hex');await expect(verifySettlementBytes(bytes,hash)).resolves.toBeUndefined();await expect(verifySettlementBytes(new TextEncoder().encode('substituted invoice').buffer,hash)).rejects.toThrow('does not match');});
});
