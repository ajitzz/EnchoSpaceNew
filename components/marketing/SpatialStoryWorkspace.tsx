import {useCallback,useEffect,useRef,useState} from 'react';
import {marketingRequest} from './api';
import type {CreativePage,CreativeRecord} from './creativeTypes';
import {spatialSections,type StoryEvidence} from '../../src/shared/marketingStory';
import {HostCreativeWorkspace} from './CreativeWorkspace';

type Fact={id:string;field:string;value:string};
type Story=StoryEvidence & {decision:string};
type Source={id:string|number;url:string;type:string;approved:boolean};

export function SpatialStoryWorkspace({listingId,media=[],admin=false,selected,onSelect}:{listingId:number;media?:Source[];admin?:boolean;selected?:string;onSelect?:(story:StoryEvidence|null)=>void}) {
  const [facts,setFacts]=useState<{factHash:string;facts:Fact[]}|null>(null);
  const [images,setImages]=useState<CreativeRecord[]>([]),[stories,setStories]=useState<Story[]>([]);
  const [choices,setChoices]=useState(spatialSections.map(section=>({section,factId:'',imageId:''})));
  const [landscape,setLandscape]=useState(''),[source,setSource]=useState('');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({}),[attested,setAttested]=useState<Record<string,boolean>>({});
  const requestKeys=useRef(new Map<string,string>());
  const load=useCallback(async()=>{
    try {
      const [projection,records]=await Promise.all([
        marketingRequest<{factHash:string;facts:Fact[]}>(`/listings/${listingId}/marketing-facts`),
        marketingRequest<Story[]>(`/listings/${listingId}/spatial-stories`),
      ]);
      setFacts(projection);setStories(records);
      if(admin){setError('');return;}
      const collected:CreativeRecord[]=[];let cursor:string|null=null;
      // Bounded listing-specific picker. Display only independently approved formats.
      for(let page=0;page<5;page++){
        const result:CreativePage=await marketingRequest(`/creatives?listingId=${listingId}&state=APPROVED&limit=20${cursor?`&before=${cursor}`:''}`);
        collected.push(...result.items);cursor=result.nextCursor;if(!cursor)break;
      }
      setImages(collected);setError('');
    }catch(reason){setError(reason instanceof Error?reason.message:'Spatial story evidence could not be loaded.');}
  },[listingId,admin]);
  useEffect(()=>{void load();},[load]);
  const selection=(image:CreativeRecord)=>({sourceAssetId:image.sourceAssetId,derivativeId:image.id,manifestHash:image.manifestHash!});
  async function send(path:string,body:unknown){
    setBusy(true);setError('');const identity=JSON.stringify({path,body});
    if(!requestKeys.current.has(identity))requestKeys.current.set(identity,crypto.randomUUID());
    try {await marketingRequest(path,{method:'POST',headers:{'Idempotency-Key':requestKeys.current.get(identity)!},body:JSON.stringify(body)});await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'The story could not be saved.');}
    finally{setBusy(false);}
  }
  const canCapture=confirmed&&facts&&choices.every(c=>c.factId&&images.some(i=>i.id===c.imageId))&&images.some(i=>i.id===landscape);
  return <section className="mkt-creative-workspace" aria-label={admin?'Review spatial stories':'Property spatial story'}>
    <div className="mkt-section-heading"><div><span className="mkt-eyebrow">Property evidence</span><h3>A story in four spaces</h3></div><button type="button" className="mkt-text-button" disabled={busy} onClick={()=>void load()}>Refresh story evidence</button></div>
    <p className="mkt-caption">Four distinct photographs and exact property labels. An independent administrator checks the image, caption and section together before publication. Image delivery remains subject to the ad network’s approval.</p>
    {error&&<p role="alert">{error}</p>}
    {!admin&&<details><summary>Compose a new spatial story</summary>
      <label>Prepare a property photograph<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Choose an approved photo</option>{media.filter(m=>m.approved&&m.type==='IMAGE').map((m,index)=><option key={m.id} value={m.id}>Property photo {index+1}</option>)}</select></label>
      {source&&<HostCreativeWorkspace key={source} listingId={listingId} sourceAssetId={source} onSelect={()=>{void load();}}/>}
      <div className="mkt-story-grid">{choices.map((card,index)=><fieldset key={card.section}><legend>{card.section[0].toUpperCase()+card.section.slice(1)}</legend>
        <label>Exact property label<select value={card.factId} onChange={e=>setChoices(old=>old.map((v,i)=>i===index?{...v,factId:e.target.value}:v))}><option value="">Choose a recorded fact</option>{facts?.facts.filter(f=>['name','amenity','title'].includes(f.field)&&f.value.length<=25).map(f=><option key={f.id} value={f.id}>{f.value}</option>)}</select></label>
        <label>Reviewed square photo<select value={card.imageId} onChange={e=>setChoices(old=>old.map((v,i)=>i===index?{...v,imageId:e.target.value}:v))}><option value="">Choose an approved image</option>{images.filter(i=>i.format==='SQUARE').map(i=><option key={i.id} value={i.id}>Photo {i.sourceAssetId} · {i.manifestHash?.slice(0,8)}</option>)}</select></label>
        {images.find(i=>i.id===card.imageId)?.url&&<img src={images.find(i=>i.id===card.imageId)!.url!} alt="Selected property photograph" loading="lazy"/>}
      </fieldset>)}</div>
      <label>Reviewed landscape image for Google<select value={landscape} onChange={e=>setLandscape(e.target.value)}><option value="">Choose an approved landscape</option>{images.filter(i=>i.format==='LANDSCAPE').map(i=><option key={i.id} value={i.id}>Photo {i.sourceAssetId} · landscape</option>)}</select></label>
      <label className="mkt-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I have the rights to these images and confirm each photograph accurately represents its selected label and property section.</label>
      <button type="button" className="mkt-primary" disabled={busy||!canCapture} onClick={()=>void send('/spatial-stories',{listingId,factHash:facts!.factHash,rightsConfirmed:true,cards:choices.map(card=>({section:card.section,factId:card.factId,image:selection(images.find(i=>i.id===card.imageId)!)})),landscapeImage:selection(images.find(i=>i.id===landscape)!)})}>Save story for independent review</button>
      <p className="mkt-caption">Four square images and one landscape image must already be approved. Each image must fit the 150 KB provider payload limit. Unsupported or missing property facts must be corrected on the property before use.</p>
    </details>}
    {onSelect&&selected&&<button type="button" className="mkt-text-button" onClick={()=>onSelect(null)}>Use the standard single creative instead</button>}
    {stories.map(story=><article key={story.id} className="mkt-story-review"><p><strong>{story.decision==='APPROVE'?'Reviewed story':story.decision==='REVOKE'?'Review withdrawn':'Awaiting editorial review'}</strong> · {story.manifestHash.slice(0,12)}</p>
      <div className="mkt-story-grid">{story.manifest.cards.map(card=><figure key={card.section}><img src={card.image.url} alt={card.title} loading="lazy"/><figcaption><strong>{card.title}</strong><small>Section: {card.section}</small></figcaption></figure>)}</div>
      {!admin&&story.decision==='APPROVE'&&onSelect&&<button type="button" className="mkt-secondary" onClick={()=>onSelect(story)}>{selected===story.id?'Selected for this campaign':'Use this reviewed story'}</button>}
      {admin&&<div className="mkt-fields"><label>Editorial evidence<textarea value={notes[story.id]??''} onChange={e=>setNotes(old=>({...old,[story.id]:e.target.value}))} minLength={20} maxLength={2000}/></label><label className="mkt-checkbox"><input type="checkbox" checked={!!attested[story.id]} onChange={e=>setAttested(old=>({...old,[story.id]:e.target.checked}))}/>I inspected all four original property facts, photographs and section assignments.</label><div className="mkt-review-actions">{(['APPROVE','REVOKE'] as const).map(decision=><button type="button" key={decision} className="mkt-secondary" disabled={busy||!attested[story.id]||(notes[story.id]?.trim().length??0)<20} onClick={()=>void send(`/admin/spatial-stories/${story.id}/review`,{manifestHash:story.manifestHash,decision,reason:notes[story.id],spatialAccuracyConfirmed:true})}>{decision==='APPROVE'?'Approve exact story':'Withdraw story approval'}</button>)}</div></div>}
    </article>)}
  </section>;
}
