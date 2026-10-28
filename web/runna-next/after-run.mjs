import {reconcileWorkouts,summarizeRun,findPlanWorkout} from "./workout-reconciliation.mjs";
const e=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nf=x=>x==null||!Number.isFinite(Number(x))?"—":Number(x).toLocaleString("fr-FR",{maximumFractionDigits:2});
const date=s=>{const iso=String(s||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return "Date inconnue";
 return new Date(iso+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});};
const pace=v=>{
 if(v==null||!Number.isFinite(Number(v))||Number(v)<=0)return "—";
 const sec=Math.round(Number(v)*60);
 return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")+" /km";
};
export function renderTrainingReview(activities=[],planned=[]){
 const results=reconcileWorkouts(activities,planned);
 const completed=results.filter(x=>x.matchStatus==="confirmed");
 const latest=activities.filter(x=>x.category==="Course").slice(0,5);
 const rows=latest.map(a=>{
  const known=!!a.pairedEventId, id=a.externalId||String(a.id).replace(/^intervals:/,"");
  return `<button class="training" data-action="activity:${e(id)}" style="margin-top:9px">
   <span class="strip" style="background:${known?"#e46b80":"#8b6c7d"}"></span>
   <span style="flex:1;min-width:0">
    <small>${date(a.startedAt)} · ${known?"Séance Intervals associée":"Association à vérifier"}</small>
    <strong>${e(a.title||"Course")}</strong>
    <small>${nf(a.distanceKm)} km · ${nf(a.durationMinutes)} min · FC moy. ${nf(a.averageHeartRate)}</small>
   </span><span class="arrow">›</span></button>`;
 }).join("");
 return `<article class="card" id="tsBilan">
  <div class="between"><div><div class="eyebrow">Après la course</div><h3 class="heading" style="margin-top:8px">Bilan de tes entraînements</h3></div>
    <span class="pill muted">${completed.length} séance${completed.length!==1?"s":""} liée${completed.length!==1?"s":""}</span></div>
  <p class="sub">La montre enregistre ta sortie, Companion la transmet à Intervals.icu. TrainSync confirme l'association uniquement quand la source fournit son identifiant de séance.</p>
  ${rows||`<div class="empty"><strong>Aucune course terminée importée</strong>Synchronise Companion après ta course, puis actualise TrainSync.</div>`}
 </article>`;
}
export function renderActivityReport({activity,planned=[],plan=null,segments=null,loading=false,feedback=null}={}){
 if(!activity)return `<div class="card empty">Cette course n'est pas disponible dans l'historique synchronisé.</div>`;
 const info=summarizeRun(activity),known=!!activity.pairedEventId;
 const linked=planned.find(p=>String(p.id)===String(activity.pairedEventId));
 const relative=known?linked:null;
 const local=known?null:findPlanWorkout(plan,activity);
 const plannedKm=Number(relative?.distanceKm||0);
 const delta=known&&plannedKm&&info.distanceKm!=null?+(info.distanceKm-plannedKm).toFixed(2):null;
 const laps=Array.isArray(segments?.segments)?segments.segments:[];
 const lapRows=laps.map((lap,i)=>`<div class="step">
   <div class="number">${i+1}</div>
   <div style="flex:1;min-width:0"><strong>${e(lap.label||"Segment "+(i+1))}</strong>
    <small>${nf(lap.distanceMeters)} m · ${nf(lap.durationSeconds)} s · ${pace(lap.averagePaceMinKm)}</small>
    ${lap.averageHeartRate?`<small>FC moyenne : ${nf(lap.averageHeartRate)} bpm</small>`:""}
   </div></div>`).join("");
 return `<button class="textButton" data-action="backActivity">‹ Retour aux activités</button>
 <div class="detailsHeader"><div class="eyebrow">Séance terminée · ${date(activity.startedAt)}</div>
  <h2>${e(activity.title||"Ma course")}</h2>
  <p class="sub">${known?"Associée à une séance du calendrier Intervals.icu ✓":"Association au calendrier non confirmée"}</p>
  <div class="statrow"><div class="stat"><strong>${nf(info.distanceKm)}</strong><small>Km courus</small></div>
   <div class="stat"><strong>${nf(info.durationMinutes)}</strong><small>Minutes</small></div>
   <div class="stat"><strong>${pace(info.paceMinKm)}</strong><small>Allure moyenne</small></div></div></div>
 <div class="card"><div class="eyebrow">Analyse</div><h3 class="heading">Résultat de ta course</h3>
  <div class="statrow"><div class="stat"><strong>${nf(info.averageHeartRate)}</strong><small>FC moyenne</small></div>
   <div class="stat"><strong>${nf(info.trainingLoad)}</strong><small>Charge</small></div>
   <div class="stat"><strong>${nf(info.rpe)}</strong><small>RPE Intervals</small></div></div>
  ${known?`<div class="callout" style="margin-top:12px">Séance liée : ${e(relative?.title||"identifiant "+activity.pairedEventId)}</div>`:
   `<p class="warning">Le lien avec la séance prévue n'est pas certifié. TrainSync ne déclare pas la séance du programme « réalisée » automatiquement.</p>`}
  ${delta!=null?`<p class="sub">Prévu : ${nf(plannedKm)} km · Écart réel : ${delta>=0?"+":""}${nf(delta)} km.</p>`:""}
  ${local?`<p class="sub">Une séance du plan local existe ce jour-là, sans preuve que c'est la même course.</p>`:""}
 </div>
 <div class="card"><div class="between"><h3 class="heading">Tours et fractions</h3><button class="textButton" data-action="loadLaps" ${loading?"disabled":""}>${loading?"Lecture…":"Actualiser"}</button></div>
  ${loading?`<p class="sub">Lecture des fractions depuis Intervals.icu…</p>`:
   segments?.error?`<p class="warning">${e(segments.error)}</p>`:
   lapRows||`<div class="empty"><strong>Pas de segments détaillés disponibles</strong>Le détail dépend des tours enregistrés et analysés dans Intervals.icu.</div>`}
  ${segments?.note?`<p class="sub">${e(segments.note)}</p>`:""}
 </div>
 <div class="card"><div class="eyebrow">Retour d'expérience</div><h3 class="heading">Comment s'est passée ta course ?</h3>
  <p class="sub">Ton ressenti est stocké sur cet appareil et n'ajuste pas automatiquement ton programme.</p>
  ${feedback?`<div class="callout">Difficulté : ${nf(feedback.rpe)}/10${feedback.comment?` · ${e(feedback.comment)}`:""}</div>`:""}
  <div class="actions"><button class="btn secondary full" data-action="activityFeedback">Donner mon ressenti</button></div></div>`;
}