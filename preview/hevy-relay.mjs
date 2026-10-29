// Read-only Hevy Pro connector. Keys are per-request and not persisted server-side.
const numeric=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
export async function hevyFetch(request){
 const key=request.headers.get("x-hevy-api-key")||"";
 // Hevy's personal developer API keys are UUID-shaped.
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key))
  return response({error:"Renseigne une clé développeur Hevy Pro valide."},401);
 try{
  // Fetch up to 60 recent workouts (six pages) to cover a typical 90-day training view.
  // All reads are sequential, bounded, and do not save the key or full response server-side.
  const getPage=async page=>{
    const r=await fetch("https://api.hevyapp.com/v1/workouts?page="+page+"&pageSize=10",{
      method:"GET",headers:{"api-key":key,Accept:"application/json"},signal:AbortSignal.timeout(12500)});
    if(!r.ok)throw Object.assign(new Error(r.status===401||r.status===403?
      "Hevy a refusé ta clé API. Vérifie ton compte Pro et Developer Settings.":"Hevy momentanément indisponible."),{status:r.status===401||r.status===403?401:502});
    return r.json();
  };
  const first=await getPage(1),pageCount=Math.max(1,Math.min(999,Number(first?.page_count)||1));
  const remaining=Array.from({length:Math.min(6,pageCount)-1},(_,i)=>i+2);
  const pages=[first];
  // Two parallel API reads at a time, max 6 pages. Avoid slow serial loading on iPhone.
  for(let i=0;i<remaining.length;i+=2){
    const pair=await Promise.all(remaining.slice(i,i+2).map(page=>getPage(page)));
    pages.push(...pair);
  }
  const workouts=pages.flatMap(p=>Array.isArray(p?.workouts)?p.workouts:[]);
  const normalized=workouts.slice(0,60).map(x=>({
   id:"hevy:"+String(x.id||""),source:"Hevy",category:"Musculation",
   title:String(x.title||"Séance Hevy").slice(0,150),startedAt:x.start_time||x.created_at||null,
   endedAt:x.end_time||null,notes:String(x.description||"").slice(0,450),
   exercises:Array.isArray(x.exercises)?x.exercises.slice(0,40).map(z=>({
    title:String(z.title||z.exercise_template?.title||"Exercice").slice(0,100),
    templateId:String(z.exercise_template_id||"").slice(0,70),notes:String(z.notes||"").slice(0,350),
    sets:Array.isArray(z.sets)?z.sets.slice(0,60).map(set=>({
     reps:numeric(set.reps),weightKg:numeric(set.weight_kg),rpe:numeric(set.rpe),
     type:String(set.type||"normal").slice(0,25),durationSeconds:numeric(set.duration_seconds),distanceMeters:numeric(set.distance_meters)
    })):[]
   })):[]
  })).filter(x=>x.startedAt);
  return response({ok:true,source:"Hevy Pro",strength:normalized,pageCount,partialHistory:pageCount>6,workoutCount:normalized.length});
 }catch(error){return response({error:error?.message||"Connexion Hevy momentanément indisponible."},Number(error?.status)||503);}
}
