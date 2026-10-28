import {reconcileWorkouts,summarizeRun,findPlanWorkout} from "./workout-reconciliation.mjs";
import {analyzeRun} from "./kintra-insights.mjs";
import {renderRouteMap} from "./kintra-map.mjs";
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
  ${rows||`<div class="empty"><strong>Aucune course terminée importée</strong>Synchronise Companion après ta course, puis actualise KINTRA.</div>`}
 </article>`;
}
export function renderActivityReport({activity,activities=[],planned=[],plan=null,segments=null,detail=null,mapEnabled=false,loading=false,feedback=null}={}){
 if(!activity)return `<div class="card empty">Cette course n'est pas disponible dans l'historique synchronisé.</div>`;
 const info=summarizeRun(activity),known=!!activity.pairedEventId;
 const linked=planned.find(p=>String(p.id)===String(activity.pairedEventId));
 const relative=known?linked:null;
 const local=known?null:findPlanWorkout(plan,activity);
 const plannedKm=Number(relative?.distanceKm||0);
 const delta=known&&plannedKm&&info.distanceKm!=null?+(info.distanceKm-plannedKm).toFixed(2):null;
 const laps=Array.isArray(segments?.segments)?segments.segments:[];
 const insight=analyzeRun({activity,activities,segments:laps,feedback});
 const validPaces=laps.map(x=>Number(x.averagePaceMinKm)).filter(x=>Number.isFinite(x)&&x>0);
 const bestPace=validPaces.length?Math.min(...validPaces):null;
 const lapRows=laps.length?`<div class="kintra-laps-scroll"><table class="kintra-laps-table">
  <thead><tr><th>Rep.</th><th>Distance</th><th>Allure</th><th>FC moy.</th></tr></thead>
  <tbody>${laps.map((lap,i)=>`<tr><td>${i+1}<small>${e(lap.label||"Tour")}</small></td>
   <td>${nf(lap.distanceMeters)} m</td><td><strong>${pace(lap.averagePaceMinKm)}</strong>
   <span class="kintra-split-bar"><i style="width:${bestPace&&Number(lap.averagePaceMinKm)>0?Math.min(100,Math.max(5,Math.round(bestPace/Number(lap.averagePaceMinKm)*100))):0}%"></i></span>
   <small>${lap.durationSeconds==null?"Durée indisponible":nf(lap.durationSeconds)+" s"}</small></td>
   <td>${lap.averageHeartRate==null?"—":nf(lap.averageHeartRate)+" bpm"}</td></tr>`).join("")}</tbody>
 </table></div>`:"";

 return `<button class="textButton" data-action="backActivity">‹ Retour aux activités</button>
 <div class="detailsHeader"><div class="eyebrow">Séance terminée · ${date(activity.startedAt)}</div>
  <h2>${e(activity.title||"Ma course")}</h2>
  <p class="sub">${known?"Associée à une séance du calendrier Intervals.icu ✓":"Association au calendrier non confirmée"}</p>
  <div class="statrow"><div class="stat"><strong>${nf(info.distanceKm)}</strong><small>Km courus</small></div>
   <div class="stat"><strong>${nf(info.durationMinutes)}</strong><small>Minutes</small></div>
   <div class="stat"><strong>${pace(info.paceMinKm)}</strong><small>Allure moyenne</small></div></div></div>
 ${loading?`<div class="card"><strong>Chargement du parcours et des statistiques GPS…</strong></div>`:
 detail?.route?renderRouteMap(detail.route.points||[],mapEnabled):`<div class="card kintra-map-empty" data-testid="route-map-empty">
  <strong>Parcours non encore disponible</strong><p class="sub">Ouvre une activité synchronisée et actualise les données GPS.</p></div>`}
 ${detail?.note?`<p class="sub kintra-map-note">${e(detail.note)}</p>`:""}
 ${detail?.detail?`<article class="card kintra-complete-metrics" data-testid="complete-run-metrics">
 <span class="eyebrow">INFORMATIONS COMPLÉMENTAIRES</span><h3 class="heading">Données de ta course</h3>
 <div class="kintra-more-metrics">${[
 ["Dénivelé +",detail.detail.elevationGain==null?"—":nf(detail.detail.elevationGain)+" m"],
 ["Dénivelé −",detail.detail.elevationLoss==null?"—":nf(detail.detail.elevationLoss)+" m"],
 ["Vitesse max.",detail.detail.maxSpeedKmh==null?"—":nf(detail.detail.maxSpeedKmh)+" km/h"],
 ["FC max.",detail.detail.maxHeartRate==null?"—":nf(detail.detail.maxHeartRate)+" bpm"],
 ["Cadence moy.",detail.detail.averageCadence==null?"—":nf(detail.detail.averageCadence)+" pas/min"],
 ["Puissance moy.",detail.detail.power==null?"—":nf(detail.detail.power)+" W"],
 ["Temps en mouvement",detail.detail.movingMinutes==null?"—":nf(detail.detail.movingMinutes)+" min"],
 ["Durée écoulée",detail.detail.elapsedMinutes==null?"—":nf(detail.detail.elapsedMinutes)+" min"],
 ].map(([name,value])=>`<div><small>${name}</small><strong>${value}</strong></div>`).join("")}</div>
 </article>`:""}
 <div class="card"><div class="eyebrow">Analyse</div><h3 class="heading">Résultat de ta course</h3>
  <div class="statrow"><div class="stat"><strong>${nf(info.averageHeartRate)}</strong><small>FC moyenne</small></div>
   <div class="stat"><strong>${nf(info.trainingLoad)}</strong><small>Charge</small></div>
   <div class="stat"><strong>${nf(info.rpe)}</strong><small>RPE Intervals</small></div></div>
  ${known?`<div class="callout" style="margin-top:12px">Séance liée : ${e(relative?.title||"identifiant "+activity.pairedEventId)}</div>`:
   `<p class="warning">Le lien avec la séance prévue n'est pas certifié. KINTRA ne déclare pas la séance du programme « réalisée » automatiquement.</p>`}
  ${delta!=null?`<p class="sub">Prévu : ${nf(plannedKm)} km · Écart réel : ${delta>=0?"+":""}${nf(delta)} km.</p>`:""}
  ${local?`<p class="sub">Une séance du plan local existe ce jour-là, sans preuve que c'est la même course.</p>`:""}
 </div>
 <div class="card"><div class="between"><h3 class="heading">Analyse des temps</h3><button class="textButton" data-action="loadLaps" ${loading?"disabled":""}>${loading?"Lecture…":"Actualiser"}</button></div>
  ${loading?`<p class="sub">Lecture des fractions depuis Intervals.icu…</p>`:
   segments?.error?`<p class="warning">${e(segments.error)}</p>`:
   lapRows||`<div class="empty"><strong>Pas de segments détaillés disponibles</strong>Le détail dépend des tours enregistrés et analysés dans Intervals.icu.</div>`}
  ${segments?.note?`<p class="sub">${e(segments.note)}</p>`:""}
 </div>
 <div class="card kintra-coach-review" data-testid="post-run-insights"><div class="eyebrow">CONSEILS PERSONNALISÉS</div>
 <h3 class="heading">Analyse et pistes d'amélioration</h3>
 ${insight.observations.map(o=>`<p class="sub">• ${e(o)}</p>`).join("")}
 ${insight.recommendations.map(o=>`<div class="kintra-insight-tip">${e(o)}</div>`).join("")}
 <p class="sub">Analyse statistique indicative : aucune donnée manquante n'a été estimée.</p></div>
 <div class="card"><div class="eyebrow">Retour d'expérience</div><h3 class="heading">Comment s'est passée ta course ?</h3>
  <p class="sub">Ton ressenti est stocké sur cet appareil et n'ajuste pas automatiquement ton programme.</p>
  ${feedback?`<div class="callout">Difficulté : ${nf(feedback.rpe)}/10${feedback.comment?` · ${e(feedback.comment)}`:""}</div>`:""}
  <div class="actions"><button class="btn secondary full" data-action="activityFeedback">Donner mon ressenti</button></div></div>`;
}