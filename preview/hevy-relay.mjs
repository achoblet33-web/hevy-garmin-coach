// Read-only Hevy Pro connector. Keys are per-request and not persisted server-side.
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
export async function hevyFetch(request){
 const key=request.headers.get("x-hevy-api-key")||"";
 // Hevy's personal developer API keys are UUID-shaped.
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key))
  return response({error:"Renseigne une clé développeur Hevy Pro valide."},401);
 try{
  const r=await fetch("https://api.hevyapp.com/v1/workouts?page=1&pageSize=10",{
   method:"GET",headers:{"api-key":key,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return response({error:r.status===401||r.status===403?"Hevy a refusé ta clé API. Vérifie l'abonnement Pro et Developer Settings.":"Hevy momentanément indisponible."},
   r.status===401||r.status===403?401:502);
  const parsed=await r.json(),workouts=Array.isArray(parsed?.workouts)?parsed.workouts:[];
  const normalized=workouts.slice(0,10).map(x=>({
   id:"hevy:"+String(x.id||""),source:"Hevy",category:"Musculation",
   title:String(x.title||"Séance Hevy").slice(0,150),startedAt:x.start_time||x.created_at||null,
   exercises:Array.isArray(x.exercises)?x.exercises.slice(0,40).map(z=>({
    title:String(z.title||z.exercise_template?.title||"Exercice").slice(0,100),
    sets:Array.isArray(z.sets)?z.sets.slice(0,60).map(set=>({
     reps:Number.isFinite(Number(set.reps))?Number(set.reps):null,
     weightKg:Number.isFinite(Number(set.weight_kg))?Number(set.weight_kg):null,
     rpe:Number.isFinite(Number(set.rpe))?Number(set.rpe):null
    })):[]
   })):[]
  })).filter(x=>x.startedAt);
  return response({ok:true,source:"Hevy Pro",strength:normalized,pageCount:parsed.page_count||1});
 }catch{return response({error:"Connexion Hevy momentanément indisponible."},503);}
}
