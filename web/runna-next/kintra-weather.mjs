// KINTRA weather: relative comfort for running, never a safety or health certification.
const num=x=>x==null||x===""||!Number.isFinite(Number(x))?null:Number(x);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function forecastSlots(data,now=Date.now()){
 const h=data?.hourly||{};
 const times=h.time||[];
 const rows=times.map((time,i)=>({
  epoch:Number(time)*1000,temperature:num(h.temperature_2m?.[i]),
  feels:num(h.apparent_temperature?.[i]),humidity:num(h.relative_humidity_2m?.[i]),
  rain:num(h.precipitation_probability?.[i]),wind:num(h.wind_speed_10m?.[i]),
  uv:num(h.uv_index?.[i]),code:num(h.weather_code?.[i])
 })).filter(x=>Number.isFinite(x.epoch)&&x.epoch>=now-3600000&&x.epoch<=now+24*3600000);
 const tz=data.timezone||"UTC";
 const hours=rows.map(x=>{
  const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",hourCycle:"h23"}).format(x.epoch));
  let penalty=0;
  if(x.feels!=null)penalty+=Math.max(0,x.feels-24)*3+Math.max(0,x.feels-29)*7;
  if(x.rain!=null)penalty+=x.rain*.3;
  if(x.wind!=null)penalty+=Math.max(0,x.wind-15)*.5;
  if(x.humidity!=null)penalty+=Math.max(0,x.humidity-75)*.24;
  if(x.uv!=null)penalty+=Math.max(0,x.uv-5)*4;
  if(hour<6||hour>21)penalty+=20; // avoid suggesting night runs as "best".
  const caution=(x.feels!=null&&x.feels>=32)||(x.rain!=null&&x.rain>=70)||(x.uv!=null&&x.uv>=8);
  return {...x,hour,penalty:Math.round(penalty),caution,grade:caution?"vigilance":penalty<=12?"favorable":penalty<=30?"acceptable":"à surveiller"};
 });
 const first12=hours.filter(x=>x.epoch<=now+12*3600000);
 const candidates=first12.filter(x=>x.hour>=6&&x.hour<=21);
 const best=[...candidates].sort((a,b)=>a.penalty-b.penalty||a.epoch-b.epoch)[0]||null;
 return {hours:first12,best,timezone:tz,available:hours.length>0,
  explanation:"Comparaison indicative fondée sur la température ressentie, la pluie, le vent, l’humidité et l’UV. Ne garantit pas la sécurité d'une sortie."};
}
export function formatLocalHour(epoch,timezone){
 try{return new Intl.DateTimeFormat("fr-FR",{timeZone:timezone||"UTC",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(epoch)}
 catch{return "—"}
}
