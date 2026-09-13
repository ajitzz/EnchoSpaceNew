import React,{useState} from 'react';
import {ArrowDownToLine} from 'lucide-react';

/** A billing evidence import never approves a campaign or closes its ledger. */
export function GoogleInvoiceImport({configured,disabled,onImport}:{configured:boolean;disabled:boolean;onImport:(input:{issueYear:number;issueMonth:number})=>Promise<unknown>}){
 const [month,setMonth]=useState(''),[error,setError]=useState('');
 async function submit(event:React.FormEvent){
  event.preventDefault();setError('');
  try{
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose the month in which Google issued the invoice.');
   const [issueYear,issueMonth]=month.split('-').map(Number);await onImport({issueYear,issueMonth});
  }catch(e){setError(e instanceof Error?e.message:'Google billing evidence could not be imported.');}
 }
 return <form className="stl-card stl-form" onSubmit={event=>void submit(event)}>
  <span className="stl-eyebrow">Google / Issued billing evidence</span><h3>Read from the source.</h3>
  <p className="stl-caption">Import issued invoices from the configured monthly billing account. Campaign allocation and a second administrator’s review are still required.</p>
  {!configured&&<p className="stl-notice">Google monthly invoice access is not configured. You can retain an original issued document below.</p>}
  {error&&<p role="alert" className="stl-notice stl-error">{error}</p>}
  <fieldset disabled={disabled||!configured}><label>Invoice issue month<input type="month" required value={month} onChange={event=>setMonth(event.target.value)}/></label>
  <button className="stl-primary" type="submit" disabled={disabled||!configured||!month}><ArrowDownToLine size={16}/> Import issued invoices</button></fieldset>
  <p className="stl-caption">An imported invoice does not release host funds. Later credits or billing changes require accounting review.</p>
 </form>;
}
