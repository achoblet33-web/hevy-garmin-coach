/**
 * TrainSync live mode — user-owned personal Intervals.icu API key.
 * Key sent only in request header over TLS. Never logged, persisted, cached,
 * embedded in HTML, repo, analytics, or env. No external CORS.
 */
import {buildRunningWorkout} from "../Backend/running-workouts.mjs";
import {normalizeStreams,normalizeDetail} from "./kintra-activity.mjs";
const BASE="https://intervals.icu/api/v1/athlete/0";
const MAX_DAYS=180;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, private","X-Robots-Tag":"noindex","X-Content-Type-Options":"nosniff"}});
const day=(offset=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const num=x=>x==null||x===""?null:Number.isFinite(Number(x))?Number(x):null;
const mustKey=request=>{
 const key=request.headers.get("x-intervals-api-key")||"";
 if(!/^[a-zA-Z0-9_\-]{12,300}$/.test(key))throw Object.assign(new Error("Renseigne une clé Intervals.icu valide dans Profil → Connexion."),{status:401});
 return key;
};
function parseJsonResponse(response){return response.text().then(text=>{try{return text?JSON.parse(text):null}catch{return null}})}
async function fetchIntervals(key,path,options={}){
 const target=path.startsWith("/activity/")?"https://intervals.icu/api/v1"+path:BASE+path;
 const auth=btoa("API_KEY:"+key);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),17000);
 try{
  const res=await fetch(target,{method:options.method||"GET",signal:controller.signal,
   headers:{Authorization:"Basic "+auth,Accept:"application/json","User-Agent":"Mozilla/5.0 (compatible; KINTRA/1.0)",...(options.body?{"Content-Type":"application/json"}:{})},
   ...(options.body?{body:options.body}:{})});
  const payload=await parseJsonResponse(res);
  if(!res.ok)throw Object.assign(new Error(res.status===401||res.status===403?"Clé Intervals.icu invalide ou accès refusé.":"Intervals.icu a refusé la requête (HTTP "+res.status+")."),{status:res.status===401||res.status===403?401:502});
  return payload;
 }finally{clearTimeout(timer);}
}
const normalizeActivity=x=>{
 const stamp=x.start_date_local||x.start_date;
 if(!stamp||!x.id)return null;
 const d=num(x.distance),time=num(x.moving_time)??num(x.elapsed_time)??num(x.duration);
 const type=x.type||x.sport_type||"";
 return {id:"intervals:"+x.id,externalId:String(x.id),pairedEventId:x.paired_event_id==null?null:String(x.paired_event_id),source:"Intervals.icu",provider:x.source||null,
  category:/run/i.test(type)?"Course":/weight|strength/i.test(type)?"Musculation":"Autre",
  title:x.name||type||"Activité",type,startedAt:stamp,distanceKm:d==null?null:+(d/1000).toFixed(2),
  durationMinutes:time==null?null:Math.round(time/60),averageHeartRate:num(x.average_heartrate??x.avg_hr),
  trainingLoad:num(x.icu_training_load??x.training_load),rpe:num(x.icu_rpe??x.rpe)};
};
const normalizeEvent=x=>({id:String(x.id??""),externalId:x.external_id||null,title:x.name||"Séance",
 date:String(x.start_date_local||"").slice(0,10),type:x.type||"",
 pairedActivityId:x.paired_activity_id==null?null:String(x.paired_activity_id),
 distanceKm:num(x.distance)==null?null:+(Number(x.distance)/1000).toFixed(2),
 description:x.description||"",structured:!!(Array.isArray(x.workout_doc?.steps)&&x.workout_doc.steps.length),
 durationMinutes:num(x.moving_time)==null?null:Math.round(Number(x.moving_time)/60)});
async function dashboard(request,key){
 const url=new URL(request.url);
 const raw=Number(url.searchParams.get("days"));
 const days=Number.isFinite(raw)?Math.max(7,Math.min(MAX_DAYS,Math.floor(raw))):90;
 const history="oldest="+day(-days)+"&newest="+day();
 const upcoming="oldest="+day(-7)+"&newest="+day(42)+"&category=WORKOUT";
 const source=[
   ["/activities?"+history,"activities"],["/events?"+upcoming,"planned"],["/wellness?"+history,"wellness"]
 ];
 const results=await Promise.allSettled(source.map(([path])=>fetchIntervals(key,path)));
 // Real auth check prevents a false "connected" state on 3 failed endpoints.
 if(results.every(x=>x.status==="rejected"))throw Object.assign(new Error("Aucune donnée Intervals.icu disponible. Vérifie ta connexion."),{status:502});
 const get=i=>results[i].status==="fulfilled"&&Array.isArray(results[i].value)?results[i].value:[];
 const warnings=results.map((x,i)=>x.status==="rejected"?source[i][1]+" non disponible.":null).filter(Boolean);
 const unique=new Map();
 for(const x of get(0)){const a=normalizeActivity(x);if(a)unique.set(a.id,a);}
 return json({ok:results[0].status==="fulfilled",demo:false,syncedAt:new Date().toISOString(),
  period:{days,start:day(-days),end:day()},activities:[...unique.values()].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))),
  planned:get(1).map(normalizeEvent),
  wellness:get(2).map(x=>({date:String(x.id||x.date||""),hrv:num(x.hrv),restingHR:num(x.restingHR),
    sleepSecs:num(x.sleepSecs),sleepScore:num(x.sleepScore),sleepQuality:num(x.sleepQuality),
    soreness:num(x.soreness),fatigue:num(x.fatigue),weight:num(x.weight),steps:num(x.steps),ctl:num(x.ctl),atl:num(x.atl)})),
  strength:[...unique.values()].filter(a=>a.category==="Musculation"),warnings,sources:{intervals:{ok:results[0].status==="fulfilled"},calendar:{ok:results[1].status==="fulfilled"},
    wellness:{ok:results[2].status==="fulfilled"},hevy:{ok:false,configured:false}}});
}
// Runna-like post-run interval analysis, read-only and restricted to one named activity.
async function activityIntervals(request,key){
 const u=new URL(request.url),id=String(u.pathname.split("/").at(-2)||"");
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))return json({error:"Identifiant d'activité invalide."},400);
 const data=await fetchIntervals(key,"/activity/"+encodeURIComponent(id)+"/intervals");
 const rows=Array.isArray(data?.icu_intervals)?data.icu_intervals:
   Array.isArray(data?.intervals)?data.intervals:Array.isArray(data?.user_intervals)?data.user_intervals:[];
 const normalized=rows.slice(0,150).map((x,i)=>({
   index:i+1,
   label:String(x.name||x.type||x.group_name||"Segment "+(i+1)).slice(0,90),
   distanceMeters:num(x.distance),
   durationSeconds:num(x.moving_time??x.elapsed_time??x.duration),
   averageHeartRate:num(x.average_heartrate??x.avg_hr),
   averagePaceMinKm:null,
   paceSecondsKm:num(x.pace),
   averagePower:num(x.average_watts),
   cadence:num(x.average_cadence)
 }));
 for(const x of normalized)if(x.durationSeconds>0&&x.distanceMeters>0){
   x.averagePaceMinKm=+((x.durationSeconds/60)/(x.distanceMeters/1000)).toFixed(2);
 }
 return json({ok:true,id,segments:normalized,source:"Intervals.icu",intervalsAvailable:rows.length>0,
   note:rows.length?"Segments retournés par Intervals.icu, pas nécessairement les répétitions planifiées.":"Aucun segment analysable fourni par Intervals.icu pour cette activité."});
}
async function activityDetail(request,key){
 const u=new URL(request.url),id=String(u.pathname.split("/").at(-2)||"");
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))return json({error:"Identifiant GPS invalide."},400);
 const root="/activity/"+encodeURIComponent(id);
 const results=await Promise.allSettled([
   fetchIntervals(key,root),
   fetchIntervals(key,root+"/streams.json?types=latlng,altitude,velocity_smooth,cadence,heartrate,watts")
 ]);
 if(results.every(x=>x.status==="rejected"))return json({
   ok:false,error:"Les détails ne sont pas accessibles dans Intervals.icu pour cette activité."},404);
 const detail=results[0].status==="fulfilled"?normalizeDetail(results[0].value):{};
 const route=results[1].status==="fulfilled"?normalizeStreams(results[1].value):normalizeStreams([]);
 return json({ok:true,id,detail,route,source:"Intervals.icu",
  note:route.hasGps?"Tracé issu des positions GPS enregistrées dans Intervals.icu.":
    "Aucun parcours GPS exploitable transmis pour cette activité (source, autorisations ou montre sans trace)."});
}
async function publish(request,key){
 const data=await request.json();
 const workout=buildRunningWorkout(data,day());
 workout.name=workout.name.replace(/^TrainSync/,"KINTRA");
 const date=workout.start_date_local.slice(0,10);
 const existing=await fetchIntervals(key,"/events?oldest="+date+"&newest="+date+"&category=WORKOUT");
 const hit=(Array.isArray(existing)?existing:[]).find(x=>x.external_id===workout.external_id);
 if(hit){
  const saved=await fetchIntervals(key,"/events/"+encodeURIComponent(String(hit.id)));
  const item=normalizeEvent(saved||hit);
  return json({ok:item.structured,existing:true,event:item,watchStatus:"non vérifié",
    message:item.structured?"Cette séance structurée existe déjà dans ton calendrier Intervals.icu. Aucun doublon créé.":"Séance existante, mais les étapes ne sont pas confirmées. Vérifie-la dans Intervals.icu."});
 }
 const result=await fetchIntervals(key,"/events/bulk?upsert=true",{method:"POST",body:JSON.stringify([workout])});
 const created=Array.isArray(result)?result[0]:null;
 if(!created?.id)throw Object.assign(new Error("Intervals.icu n'a pas confirmé la création. Vérifie ton calendrier avant de réessayer."),{status:502});
 const saved=await fetchIntervals(key,"/events/"+encodeURIComponent(String(created.id)));
 const event=normalizeEvent(saved||created);
 return json({ok:event.structured,existing:false,event,watchStatus:"non vérifié",
  message:event.structured?
    "Séance structurée enregistrée dans Intervals.icu. Ouvre Companion sur iPhone pour l'envoyer à l'Apple Watch.":
    "Séance enregistrée, mais étapes non validées : ouvre Intervals.icu et vérifie la structure avant la montre."});
}
export default {
 async fetch(request){
  const u=new URL(request.url);
  if(request.method==="OPTIONS")return json({error:"Méthode non disponible."},405);
  try{
   if(u.pathname==="/v3/status"&&request.method==="GET"){
     const key=mustKey(request);
     const account=await fetchIntervals(key,"");
     return json({ok:true,demo:false,version:"3.2.0-live",intervals:{configured:true,ok:true},
      athlete:{displayName:account?.name||account?.firstname||null},watch:{bridge:"Intervals.icu Companion",directlyConnected:false}});
   }
   if(u.pathname==="/v3/workouts/preview"&&request.method==="POST"){
     const workout=buildRunningWorkout(await request.json(),day());
     workout.name=workout.name.replace(/^TrainSync/,"KINTRA");
     return json({ok:true,demo:false,preview:{...workout,note:"Vérifie que les zones Pace ou HR sont réglées dans Intervals.icu avant l'envoi vers Apple Watch."}});
   }
   const key=mustKey(request);
   if(u.pathname==="/v3/dashboard"&&request.method==="GET")return dashboard(request,key);
   if(/^\/v3\/activities\/[A-Za-z0-9_-]{1,80}\/intervals$/.test(u.pathname)&&request.method==="GET")
     return activityIntervals(request,key);
   if(/^\/v3\/activities\/[A-Za-z0-9_-]{1,80}\/detail$/.test(u.pathname)&&request.method==="GET")
     return activityDetail(request,key);
   if(u.pathname==="/v3/workouts/publish"&&request.method==="POST")return publish(request,key);
   return json({error:"Route ou méthode inconnue."},404);
  }catch(error){
   const status=Number(error?.status)||502;
   return json({error:String(error?.message||"Erreur Intervals.icu").slice(0,190)},status>=400&&status<600?status:502);
  }
 }
};
