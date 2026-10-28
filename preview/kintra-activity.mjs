// Privacy-first GPS normalization. Never forward complete workout files or opaque provider payloads.
const n=x=>x===null||x===undefined||x===""||!Number.isFinite(Number(x))?null:Number(x);
function gpsValid(lat,lon){return lat!==null&&lon!==null&&Math.abs(lat)<=90&&Math.abs(lon)<=180}
export function normalizeStreams(raw){
 const streams=Array.isArray(raw)?raw:Array.isArray(raw?.streams)?raw.streams:[];
 const get=type=>streams.find(s=>s?.type===type)||null;
 const gps=get("latlng");
 const lats=gps?.data||[],lons=gps?.data2||[];
 const points=[];
 if(Array.isArray(lats)&&Array.isArray(lons)&&lats.length===lons.length){
  const step=Math.max(1,Math.ceil(lats.length/420));
  for(let i=0;i<lats.length;i+=step){
   const lat=n(lats[i]),lon=n(lons[i]);
   if(gpsValid(lat,lon))points.push([lat,lon]);
  }
  const last=lats.length-1;
  if(last>=0&&last%step!==0&&gpsValid(n(lats[last]),n(lons[last])))points.push([n(lats[last]),n(lons[last])]);
 }
 const metric=(type,mapper=x=>x)=>{
  const v=get(type)?.data||[];
  if(!Array.isArray(v)||!v.length)return {min:null,max:null,average:null};
  const arr=v.map(n).filter(x=>x!==null);if(!arr.length)return {min:null,max:null,average:null};
  const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
  return {min:mapper(Math.min(...arr)),max:mapper(Math.max(...arr)),average:mapper(avg)};
 };
 return {points,hasGps:points.length>=2,count:points.length,sourcePoints:Array.isArray(lats)?lats.length:0,
   altitude:metric("altitude",x=>Math.round(x)),speed:metric("velocity_smooth",x=>+(x*3.6).toFixed(1)),
   cadence:metric("cadence",x=>Math.round(x)),heartRate:metric("heartrate",x=>Math.round(x)),
   power:metric("watts",x=>Math.round(x))};
}
export function normalizeDetail(raw){
 const a=raw&&typeof raw==="object"?raw:{};
 return {elevationGain:n(a.total_elevation_gain??a.icu_elevation_gain),
  elevationLoss:n(a.total_elevation_loss),maxSpeedKmh:n(a.max_speed)==null?null:+(Number(a.max_speed)*3.6).toFixed(1),
  averageSpeedKmh:n(a.average_speed)==null?null:+(Number(a.average_speed)*3.6).toFixed(1),
  averageCadence:n(a.average_cadence??a.avg_cadence),maxHeartRate:n(a.max_heartrate??a.max_hr),
  power:n(a.icu_average_watts??a.average_watts),
  movingMinutes:n(a.moving_time)==null?null:+(Number(a.moving_time)/60).toFixed(1),
  elapsedMinutes:n(a.elapsed_time)==null?null:+(Number(a.elapsed_time)/60).toFixed(1),
  calories:n(a.calories??a.kilojoules),intensity:n(a.icu_intensity)};
}
