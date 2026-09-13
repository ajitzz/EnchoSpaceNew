import React from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
export function WorkspacePagination({page,hasNext,loading,onPrevious,onNext,label='Campaign'}:{page:number;hasNext:boolean;loading:boolean;onPrevious:()=>void;onNext:()=>void;label?:string}){
 return <nav className="mkt-pagination" aria-label={`${label} pages`}><button className="mkt-text-button" disabled={loading||page===1} onClick={onPrevious}><ArrowLeft size={14}/> Previous</button><span aria-live="polite">Page {page}</span><button className="mkt-text-button" disabled={loading||!hasNext} onClick={onNext}>Next <ArrowRight size={14}/></button></nav>;
}
