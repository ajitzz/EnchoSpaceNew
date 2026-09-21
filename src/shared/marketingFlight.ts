import {z} from 'zod';

// India pilot contract. A fixed offset is accepted only with this explicit IANA
// zone; other zones need their own reviewed gap/fold policy, not an offset guess.
const instant=z.string().regex(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/).refine(value=>{
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)&&new Date(parsed+330*60000).toISOString().slice(0,19)===value.slice(0,19);
},'Invalid India local date and time');
export const flightScheduleSchema=z.object({
 version:z.literal(1),timeZone:z.literal('Asia/Kolkata'),preset:z.literal('LONG_WEEKEND'),
 startsAt:instant,endsAt:instant,
}).strict().superRefine((v,c)=>{
 const start=new Date(v.startsAt.slice(0,10)+'T00:00:00Z');
 if(start.getUTCDay()!==3||!v.startsAt.endsWith('T06:00:00+05:30')||!v.endsAt.endsWith('T23:59:59+05:30')||
  Date.parse(v.endsAt)-Date.parse(v.startsAt)!==6*86400000-6*3600000-1000)
  c.addIssue({code:'custom',message:'Long Weekend runs Wednesday 06:00 through Monday 23:59:59 India Time'});
});
export type FlightSchedule=z.infer<typeof flightScheduleSchema>;
export function longWeekendFlight(now=new Date()):FlightSchedule{
 if(!Number.isFinite(now.getTime()))throw new Error('FLIGHT_CLOCK_INVALID');
 const local=new Date(now.getTime()+330*60000);
 const start=new Date(local.toISOString().slice(0,10)+'T00:00:00Z');
 start.setUTCDate(start.getUTCDate()+(3-start.getUTCDay()+7)%7);
 if(Date.parse(start.toISOString().slice(0,10)+'T06:00:00+05:30')<=now.getTime())start.setUTCDate(start.getUTCDate()+7);
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+5);
 return flightScheduleSchema.parse({version:1,timeZone:'Asia/Kolkata',preset:'LONG_WEEKEND',startsAt:start.toISOString().slice(0,10)+'T06:00:00+05:30',endsAt:end.toISOString().slice(0,10)+'T23:59:59+05:30'});
}
export function accountLocalTime(iso:string,timeZone:string):string{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}
