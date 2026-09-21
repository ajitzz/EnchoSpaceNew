import {useEffect,useState} from 'react';
import './marketing.css';

export function PublicSpatialStory({slug}:{slug:string}){
  const [story,setStory]=useState<{cards:Array<{section:string;title:string;image:string}>}|null>(null);
  useEffect(()=>{
    const abort=new AbortController();setStory(null);
    void fetch(`/api/stays/${encodeURIComponent(slug)}/spatial-story`,{signal:abort.signal})
      .then(async response=>{if(!response.ok)throw new Error('STORY_UNAVAILABLE');return response.json();})
      .then(value=>{if(!abort.signal.aborted)setStory(value);})
      .catch(()=>{ /* Optional editorial content never substitutes invented property details. */ });
    return ()=>abort.abort();
  },[slug]);
  useEffect(()=>{
    if(story?.cards.some(card=>`#${card.section}`===window.location.hash))document.getElementById(window.location.hash.slice(1))?.scrollIntoView({block:'start'});
  },[story]);
  if(!story?.cards.length)return null;
  return <section className="mkt-public-story" aria-label="Explore the property"><h2>Explore the property</h2><div className="mkt-story-grid">{story.cards.map(card=><article id={card.section} key={card.section}><img src={card.image} alt={card.title} loading="lazy"/><h3>{card.title}</h3></article>)}</div></section>;
}
