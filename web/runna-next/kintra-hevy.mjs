// Hevy Pro strength presentation; rendered metrics are read-only from the account.
const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
const num=v=>n(v)==null?"—":n(v).toLocaleString("fr-FR",{maximumFractionDigits:1});
function time(iso){if(!iso)return "—";const d=new Date(iso);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}
export function strengthStats(workouts=[]){
 const rows=Array.isArray(workouts)?workouts:[];
 let sets=0,reps=0,volume=0;
 for(const x of rows)for(const exercise of x.exercises||[])for(const set of exercise.sets||[]){
  sets++;if(n(set.reps)!=null)reps+=n(set.reps);
  if(n(set.weightKg)!=null&&n(set.reps)!=null&&n(set.weightKg)>0)volume+=n(set.weightKg)*n(set.reps);
 }
 return {workouts:rows.length,sets,reps,declaredVolumeKg:Math.round(volume)};
}
export function renderHevyWorkouts(workouts=[],connected=false,partial=false){
 if(!connected)return `<article class="card" data-testid="hevy-workouts"><h3 class="heading">Séances de musculation Hevy</h3>
 <p class="sub">Connecte ta clé Hevy Pro depuis Plus → Connexions pour retrouver tes exercices, séries, charges et répétitions.</p>
 <button class="btn secondary full" data-action="hevy">Connecter Hevy Pro</button></article>`;
 const sorted=[...workouts].sort((a,b)=>String(b.startedAt||"").localeCompare(String(a.startedAt||"")));
 const recent=sorted.slice(0,20),stats=strengthStats(sorted);
 return `<article class="card kintra-hevy-list" data-testid="hevy-workouts">
 <div class="between"><div><span class="eyebrow">HEVY PRO · LECTURE SEULE</span><h3 class="heading">Mes entraînements de musculation</h3></div>
 <button class="textButton" data-action="refreshHevy">↻</button></div>
 <div class="kintra-hevy-stats">
  <div><strong>${stats.workouts}</strong><small>séances importées</small></div>
  <div><strong>${stats.sets}</strong><small>séries</small></div>
  <div><strong>${stats.reps}</strong><small>répétitions saisies</small></div>
 </div>
 ${partial?`<p class="warning">Historique Hevy partiel : seules les 60 séances les plus récentes ont été récupérées.</p>`:""}
 ${recent.length?recent.map(x=>{
  const idx=workouts.indexOf(x),count=(x.exercises||[]).reduce((m,z)=>m+(z.sets?.length||0),0);
  return `<button class="training kintra-hevy-session" data-action="hevyWorkout:${idx}">
  <span class="strip"></span><span class="kintra-hevy-session-body"><small>${time(x.startedAt)}</small>
  <strong>${escape(x.title||"Musculation")}</strong><small>${(x.exercises||[]).length} exercices · ${count} séries</small></span><span class="arrow">›</span></button>`;
 }).join(""):`<p class="sub">Connexion active, mais aucune séance Hevy n'est disponible.</p>`}
 <p class="sub">Les volumes dépendent de tes saisies Hevy ; les charges ne sont pas transformées en charge physiologique de course.</p>
 </article>`;
}
export function renderHevyWorkoutDetail(workout){
 if(!workout)return `<div class="card empty">Séance Hevy introuvable. Actualise tes données.</div>`;
 const stats=strengthStats([workout]);
 const start=new Date(workout.startedAt),end=new Date(workout.endedAt);
 const duration=workout.endedAt&&Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>=start?
   Math.round((end-start)/60000):null;
 const exercises=(workout.exercises||[]).map((x,i)=>`<section class="kintra-hevy-exercise">
 <div class="between"><h4>${i+1}. ${escape(x.title||"Exercice")}</h4><span class="pill muted">${x.sets?.length||0} séries</span></div>
 ${x.notes?`<p class="sub">${escape(x.notes)}</p>`:""}
 <div class="kintra-hevy-sets"><div class="kintra-hevy-sets-head"><span>Série</span><span>Charge</span><span>Rép.</span><span>RPE</span></div>
 ${(x.sets||[]).map((set,index)=>`<div class="kintra-hevy-set-row"><span>${index+1}${set.type==="warmup"?" · Éch.":set.type==="drop"?" · Dégress.":""}</span>
 <strong>${n(set.weightKg)==null?"—":num(set.weightKg)+" kg"}</strong>
 <strong>${n(set.reps)==null?(n(set.durationSeconds)==null?"—":num(set.durationSeconds)+" s"):num(set.reps)}</strong>
 <span>${num(set.rpe)}</span></div>`).join("")}</div></section>`).join("");
 return `<div class="card kintra-hevy-detail" data-testid="hevy-workout-detail">
 <span class="eyebrow">HEVY PRO · SÉANCE TERMINÉE</span><h2>${escape(workout.title||"Musculation")}</h2>
 <p class="sub">${time(workout.startedAt)} · ${duration==null?"Durée non fournie":duration+" min"}</p>
 <div class="kintra-hevy-stats"><div><strong>${workout.exercises?.length||0}</strong><small>exercices</small></div>
 <div><strong>${stats.sets}</strong><small>séries</small></div><div><strong>${stats.reps}</strong><small>répétitions</small></div></div>
 ${workout.notes?`<div class="callout">${escape(workout.notes)}</div>`:""}
 <h3 class="heading">Exercices et séries</h3>${exercises||`<p class="sub">Aucun détail d'exercice transmis par Hevy.</p>`}
 </div>`;
}
