import React,{useEffect,useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
export interface FeederPin {label:string;latitude:number;longitude:number;radiusKm:number;evidenceHash?:string;}
/** Only public audience locations are accepted. Stay coordinates never enter this view. */
export function AdtechMap({pins,onSelect}:{pins:FeederPin[];onSelect?:(latitude:number,longitude:number)=>void}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layers=useRef<L.LayerGroup|null>(null),select=useRef(onSelect);
 useEffect(()=>{select.current=onSelect;},[onSelect]);
 useEffect(()=>{
  if(!container.current)return;
  const current=L.map(container.current,{scrollWheelZoom:false}).setView([20,78],4);map.current=current;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:18}).addTo(current);
  layers.current=L.layerGroup().addTo(current);
  current.on('click',event=>select.current?.(Number(event.latlng.lat.toFixed(6)),Number(event.latlng.lng.toFixed(6))));
  const observer=new ResizeObserver(()=>current.invalidateSize());observer.observe(container.current);
  return()=>{observer.disconnect();current.remove();map.current=null;layers.current=null;};
 },[]);
 useEffect(()=>{
  layers.current?.clearLayers();const points:L.LatLngExpression[]=[];
  for(const pin of pins){if(!Number.isFinite(pin.latitude)||!Number.isFinite(pin.longitude)||!Number.isFinite(pin.radiusKm))continue;
   const position:L.LatLngExpression=[pin.latitude,pin.longitude];points.push(position);
   const label=document.createElement('span');label.textContent=`${pin.label} · ${pin.radiusKm} km`;
   L.circle(position,{radius:pin.radiusKm*1000,color:'#315c49',weight:2,fillOpacity:.12}).bindTooltip(label).addTo(layers.current!);
   L.circleMarker(position,{radius:5,color:'#173c32',fillOpacity:1}).addTo(layers.current!);
  }
  if(points.length&&map.current)map.current.fitBounds(L.latLngBounds(points).pad(.3),{maxZoom:9,animate:false});
 },[pins]);
 return <div><div ref={container} className="adt-map" aria-label="Public audience feeder map"/><p className="mkt-caption">Circles show feeder radii. Locked district exclusions are listed below; their exact provider boundaries are not drawn. All map controls also have form equivalents.</p></div>;
}
