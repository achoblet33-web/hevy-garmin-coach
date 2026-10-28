// PUBLIC READ-ONLY TRAINING SIMULATION. No private fitness data, keys, or production API.
import { buildRunningWorkout } from "../Backend/running-workouts.mjs";
const asJson = (payload,status=200) => new Response(JSON.stringify(payload), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
const day = delta => { const d=new Date(); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); };
const date = delta => day(delta)+"T07:30:00";
const mock = () => ({
 demo:true,version:"3.0.0-demo",syncedAt:new Date().toISOString(),period:{start:day(-90),end:day(0),days:90},
 sources:{intervals:{configured:true,ok:true},calendar:{ok:true},wellness:{ok:true},hevy:{configured:true,ok:true}},
 activities:[
 {id:"demo-run-1",source:"Intervals.icu",category:"Course",title:"DEMO · Footing facile",startedAt:date(-2),durationMinutes:42,distanceKm:7.1,averageHeartRate:140},
 {id:"demo-run-2",source:"Intervals.icu",category:"Course",title:"DEMO · Endurance",startedAt:date(-5),durationMinutes:58,distanceKm:9.3,averageHeartRate:145},
 {id:"demo-run-3",source:"Intervals.icu",category:"Course",title:"DEMO · Tempo",startedAt:date(-9),durationMinutes:46,distanceKm:8.4,averageHeartRate:158}
 ],
 strength:[{id:"demo-hevy-1",source:"Hevy",title:"DEMO · Jambes",startedAt:date(-1),durationMinutes:53,exercises:[{title:"Squat",sets:[{weightKg:60,reps:8,rpe:8}]}]}],
 planned:[{id:"demo-p1",title:"DEMO · Fractionné 6 × 800 m",date:day(1),type:"Run",structured:true}],
 wellness:[{date:day(-1),hrv:58,restingHR:50,sleepSecs:27000}],
 warnings:["Mode de démonstration : aucune connexion au compte Intervals.icu, Hevy ou Apple Watch."],
 });
export default {
 async fetch(request,env) {
  const u = new URL(request.url);
  if (u.pathname==="/" && u.searchParams.get("demo")!=="1") {
    return Response.redirect(u.origin+"/?demo=1",302);
  }
  if(!u.pathname.startsWith("/v3/")) return env.ASSETS.fetch(request);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
  if(u.pathname==="/v3/status" && request.method==="GET")
    return asJson({ok:true,demo:true,version:"3.0.0-demo",intervals:{configured:true},hevy:{configured:true},watch:{directlyConnected:false}});
  if(u.pathname==="/v3/dashboard" && request.method==="GET")return asJson(mock());
  if((u.pathname==="/v3/workouts/preview" || u.pathname==="/v3/workouts/publish") && request.method==="POST"){
    try {
      const body=await request.json();
      const workout=buildRunningWorkout(body,day(0));
      if(u.pathname.endsWith("/preview")) return asJson({ok:true,demo:true,preview:{...workout,note:"DÉMO : zones Z1/Z2/Z4 indicatives, aucune cible personnelle calibrée."}});
      return asJson({ok:true,demo:true,simulated:true,watchStatus:"non vérifié",
        event:{id:"demo-"+workout.external_id,title:workout.name,structured:true,date:workout.start_date_local.slice(0,10)},
        message:"SIMULATION UNIQUEMENT : aucune séance créée dans Intervals.icu ou sur Apple Watch."});
    } catch(error){return asJson({error:String(error.message||error)},400);}
  }
  return asJson({error:"Route introuvable en démo."},404);
 }
};
