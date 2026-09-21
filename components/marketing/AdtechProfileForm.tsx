import React from 'react';
import type {AdtechProfile} from '../../src/shared/adtech/contracts';
export function AdtechProfileForm({value,onChange,disabled}:{value:AdtechProfile;onChange:(v:AdtechProfile)=>void;disabled:boolean}){
 const change=(path:string,val:unknown)=>{const copy=structuredClone(value);const parts=path.split('.');let cursor:any=copy;for(const key of parts.slice(0,-1))cursor=cursor[key];cursor[parts.at(-1)!]=val;onChange(copy);};
 const field=(label:string,path:string,type:'number'|'text'='number',nullable=false)=>{const current=path.split('.').reduce((obj:any,key)=>obj[key],value);return <label key={path}>{label}<input type={type} value={current??''} step={path==='ai.minimumScore'?'0.1':'any'} onChange={e=>change(path,nullable&&e.target.value===''?null:typeof current==='number'?Number(e.target.value):e.target.value)}/></label>;};
 const select=(label:string,path:string,options:string[])=>{const current=path.split('.').reduce((obj:any,key)=>obj[key],value);return <label>{label}<select value={current} onChange={e=>change(path,e.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select></label>;};
 const toggle=(path:string,options:string[]|number[])=>{const current=path.split('.').reduce((obj:any,key)=>obj[key],value) as unknown[];return <div className="adt-options">{options.map(option=><label key={option} className="mkt-checkbox"><input type="checkbox" checked={current.includes(option)} onChange={e=>change(path,e.target.checked?[...current,option]:current.filter(v=>v!==option))}/>{option}</label>)}</div>;};
 return <fieldset disabled={disabled} className="adt-profile"><legend>{value.tier} strategy</legend>
  <p className="mkt-caption">Amounts below are exact INR paise. ₹1 = 100 paise. Ranges are advisory hypotheses, not promised returns.</p>
  <div className="mkt-field-pair">{field('Minimum nightly price · paise','minPriceMinor')}{field('Exclusive maximum · blank = no ceiling','maxPriceMinor','number',true)}</div>
  {(['total','daily','cacHypothesis'] as const).map(range=><div className="mkt-field-pair" key={range}>{field(`${range} minimum · paise`,`budget.${range}.min`)}{field(`${range} maximum · paise`,`budget.${range}.max`)}</div>)}
  <details open><summary>Meta delivery</summary><div className="mkt-fields">
   {select('Objective','meta.objective',['OUTCOME_SALES','OUTCOME_LEADS'])}{select('Conversion event','meta.conversionEvent',['PURCHASE','LEAD'])}
   {select('Optimization goal','meta.optimizationGoal',['OFFSITE_CONVERSIONS'])}{select('Attribution window','meta.attribution',['1d_click','1d_click_1d_view','7d_click_1d_view'])}
   {select('Placement mode','meta.placementMode',['MANUAL','ADVANTAGE_PLUS'])}{toggle('meta.placements',['FB_FEED','FB_STORIES','FB_REELS','IG_FEED','IG_STORIES','IG_REELS'])}
   <p className="mkt-caption">Audience Network is excluded. Advantage+ and lead optimization require additional adapter and conversion authority before campaigns can use them.</p>
   <div className="mkt-field-pair">{field('Minimum age','meta.ageMin')}{field('Maximum age','meta.ageMax')}</div>
   <span>Gender selection · neither selected means unrestricted</span>{toggle('meta.genders',[1,2])}<span>1: men · 2: women. Provider policy restrictions still apply.</span>
   {select('Bid strategy','meta.bidStrategy',['LOWEST_COST_WITHOUT_CAP','LOWEST_COST_WITH_BID_CAP'])}{field('Bid cap · paise; blank for uncapped','meta.bidCapMinor','number',true)}
   <span>Special ad category</span>{toggle('meta.specialAdCategories',['HOUSING'])}
  </div></details>
  <details><summary>Google Search delivery</summary><div className="mkt-fields">{select('Bidding','google.bidding',['MAXIMIZE_CONVERSIONS'])}{field('Optional target CPA · paise','google.targetCpaMinor','number',true)}{select('Location intent','google.geoMode',['PRESENCE','PRESENCE_OR_INTEREST'])}<span>Allowed match types</span>{toggle('google.matchTypes',['EXACT','PHRASE'])}
   <label>Negative keywords · one EXACT: phrase or PHRASE: phrase per line<textarea rows={5} value={value.google.negativeKeywords.map(k=>`${k.matchType}: ${k.text}`).join('\n')} onChange={e=>change('google.negativeKeywords',e.target.value.split('\n').filter(Boolean).map(line=>{const match=/^(EXACT|PHRASE):\s*(.*)$/.exec(line);return {matchType:match?.[1]??'EXACT',text:match?.[2]??line};}))}/></label>
  </div></details>
  <details><summary>Quality and host adjustment limits</summary><div className="mkt-fields">{field('AI passing score · 0–10','ai.minimumScore')}<label className="mkt-checkbox"><input type="checkbox" checked={value.hostOverrides.enabled} onChange={e=>change('hostOverrides.enabled',e.target.checked)}/>Allow bounded audience radius adjustments</label>{field('Maximum feeder count','hostOverrides.maxFeeders')}<div className="mkt-field-pair">{field('Minimum radius · km','hostOverrides.minRadiusKm')}{field('Maximum radius · km','hostOverrides.maxRadiusKm')}</div></div></details>
 </fieldset>;
}
