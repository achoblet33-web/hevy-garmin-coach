/**
 * KINTRA Coach 2.0 – explainable, local plan reconciliation and proposals.
 * Never invent source measurements or change a plan without explicit acceptance.
 */
import {reconcileWorkouts} from "./workout-reconciliation.mjs";
import {evaluateReadiness} from "./kintra-coach.mjs";

const numeric=x=>x===null||x===undefined||x===""||!Number.isFinite(Number(x))?null:Number(x);
const dateOf=x=>String(x??"").slice(0,10);
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T12:00:00Z"));
const add=(date,days)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const monday=date=>{const day=new Date(date+"T12:00:00Z").getUTCDay();return add(date,-((day+6)%7))};
const rounded=x=>Math.round(x*10)/10;
const sum=items=>rounded(items.reduce((s,x)=>s+Math.max(0,numeric(x.distanceKm)||0),0));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=x=>x===null?"—":Number(x).toLocaleString("fr-FR",{maximumFractionDigits:1});
const quality=x=>["interval","tempo","threshold","speed","hills"].includes(x.kind);
const lowerBody=/squat|deadlift|soulev[ée]|fente|lunge|leg press|leg curl|leg extension|hip thrust|ischio|quadricep|mollet|calf|jambes?/i;
function isRun(x){return x?.category==="Course"||/run/i.test(String(x?.type||""))}
function isFuture(x,date){return x.date>=date&&x.status!=="done"&&x.status!=="skipped"&&x.kind!=="rest"}
function lowerBodySessions(strength,date){
 return (Array.isArray(strength)?strength:[]).filter(s=>{
  const day=dateOf(s.startedAt||s.date);
  return day>=add(date,-2)&&day<=date&&(s.exercises||[]).some(x=>lowerBody.test(x.title||x.name||""));
 });
}
export function buildCoachReview({plan,activities=[],strength=[],wellness=[],date}={}){
 if(!plan||!validDate(date))return null;
 const runs=(Array.isArray(activities)?activities:[]).filter(isRun);
 const weekFrom=monday(date),weekTo=add(weekFrom,6);
 const planned=(plan.sessions||[]).filter(x=>x.date>=weekFrom&&x.date<=weekTo&&x.kind!=="rest");
 const due=planned.filter(x=>x.date<=date);
 const observed=runs.filter(x=>dateOf(x.startedAt)>=weekFrom&&dateOf(x.startedAt)<=date);
 const matches=reconcileWorkouts(observed,planned);
 const confirmed=matches.filter(x=>x.matchStatus==="confirmed");
 const possible=matches.filter(x=>x.matchStatus==="suggested");
 const legs=lowerBodySessions(strength,date);
 const readiness=evaluateReadiness({activities:runs,wellness,strength,date});
 const haveRecovery=readiness.signals.length>0;
 const next=(plan.sessions||[]).filter(x=>isFuture(x,date)&&x.date<=add(date,7)).sort((a,b)=>a.date.localeCompare(b.date));
 const nextQuality=next.find(quality);
 const proposals=[];
 if(nextQuality&&(legs.length>0||readiness.state==="caution")){
  const evidence=[];
  if(legs.length)evidence.push(legs.length+" séance(s) jambes dans les trois derniers jours");
  if(readiness.state==="caution")evidence.push("signaux de récupération à surveiller");
  proposals.push({id:"ease:"+nextQuality.id,targetId:nextQuality.id,kind:"ease-quality",
   title:"Alléger la prochaine séance intense",reason:evidence.join(" et ")+". Proposition prudente, à confirmer selon tes sensations.",
   evidence,from:{title:nextQuality.title,date:nextQuality.date,kind:nextQuality.kind,distanceKm:nextQuality.distanceKm},
   to:{title:"Endurance facile",kind:"easy",distanceKm:rounded(Math.max(2,(numeric(nextQuality.distanceKm)||5)*.75))}});
 }
 // A volume comparison is not an adherence score: planned sessions may still be in the future.
 const plannedKm=sum(planned),dueKm=sum(due),recordedKm=observed.length?sum(observed):null;
 const deltaKm=recordedKm!==null&&dueKm>0?rounded(recordedKm-dueKm):null;
 const alerts=[];
 if(legs.length)alerts.push("Musculation : travail des jambes récent. Évite d'imposer une intensité si les jambes sont lourdes.");
 else if(!strength.length)alerts.push("Musculation : aucune séance synchronisée pour ce calcul.");
 if(readiness.state==="caution")alerts.push("Récupération : signaux mesurés à surveiller. Aucun diagnostic ou score de fatigue calculé.");
 else if(!haveRecovery)alerts.push("Récupération : aucune mesure récente ; aucun état favorable n'est déduit.");
 else if(readiness.state==="limited")alerts.push("Récupération : historique encore insuffisant pour conclure.");
 if(observed.length&&!confirmed.length)alerts.push("Course : sorties enregistrées, mais aucune association certaine à une séance du plan.");
 return {date,weekFrom,weekTo,plannedKm,dueKm,recordedKm,deltaKm,
  plannedCount:planned.length,dueCount:due.length,recordedCount:observed.length,
  confirmedCount:confirmed.length,possibleCount:possible.length,readiness:readiness.state,
  strengthCount:(Array.isArray(strength)?strength:[]).filter(x=>dateOf(x.startedAt||x.date)>=weekFrom&&dateOf(x.startedAt||x.date)<=date).length,
  alerts,proposals,matching:matches.map(x=>({id:x.id,status:x.matchStatus,
    actualId:x.actual?.id||null,candidates:x.candidates.map(c=>c.id)}))};
}
export function previewCoachAdjustment(plan,proposal,date){
 if(!plan||!proposal||!validDate(date))throw Error("Proposition ou plan manquant.");
 const session=(plan.sessions||[]).find(x=>x.id===proposal.targetId);
 if(!session||!isFuture(session,date)||session.date>add(date,7))throw Error("Cette séance n'est plus modifiable.");
 if(proposal.kind!=="ease-quality"||!quality(session))throw Error("Proposition non applicable à cette séance.");
 const before={id:session.id,date:session.date,title:session.title,kind:session.kind,
  distanceKm:session.distanceKm,intensity:session.intensity};
 const after={...session,kind:"easy",title:"Endurance facile",
  distanceKm:rounded(Math.max(2,(numeric(session.distanceKm)||5)*.75)),
  intensity:"RPE 2–4",reason:"Adaptation confirmée après revue course, musculation et récupération.",
  coachAdjustedAt:date,coachAdjustment:"ease-quality"};
 const sessions=plan.sessions.map(x=>x.id===session.id?after:x);
 const summary=(plan.summary||[]).map(x=>({...x,plannedKm:sum(sessions.filter(s=>s.week===x.week&&s.kind!=="rest"))}));
 return {before,after,plan:{...plan,sessions,summary,notes:[...(plan.notes||[]),
  "Coach 2.0 : allègement volontaire de "+session.date+" ; aucune écriture dans Intervals.icu ou Hevy."]}};
}
export function renderCoachReview(review,enabled=true){
 if(!review)return "";
 const signals=review.alerts.map(x=>'<p class="kintra-coach-v2-signal">'+esc(x)+'</p>').join("");
 const actions=enabled?review.proposals.map((p,i)=>
  '<button class="btn secondary full" data-action="coachProposal:'+i+'">'+esc(p.title)+' ›</button>').join(""):
  '<p class="sub">Conseils désactivés dans Coach.</p>';
 const compare=review.recordedKm===null?
  "Aucune sortie enregistrée pour cette période ; réalisé non vérifiable.":
  "Écart indicatif sur les échéances passées : "+(review.deltaKm===null?"non comparable":(review.deltaKm>0?"+":"")+number(review.deltaKm)+" km")+".";
 return '<section class="card kintra-coach-v2" data-testid="coach-v2-review">'+
  '<div class="eyebrow">KINTRA COACH 2.0 · ANALYSE CROISÉE</div><h3 class="heading">Prévu / réalisé</h3>'+
  '<p class="sub">Semaine du '+esc(review.weekFrom)+' au '+esc(review.weekTo)+'. Les séances futures restent prévues.</p>'+
  '<div class="kintra-coach-v2-grid">'+
   '<div><small>Prévu cette semaine</small><strong>'+number(review.plannedKm)+' km</strong></div>'+
   '<div><small>Prévu jusqu’à aujourd’hui</small><strong>'+number(review.dueKm)+' km</strong></div>'+
   '<div><small>Course enregistrée</small><strong>'+number(review.recordedKm)+' km</strong></div>'+
   '<div><small>Musculation enregistrée</small><strong>'+review.strengthCount+' séance(s)</strong></div>'+
  '</div><p class="sub">'+esc(compare)+'</p>'+
  '<p class="kintra-coach-v2-matching">'+review.confirmedCount+' correspondance(s) confirmée(s) · '+review.possibleCount+' rapprochement(s) non confirmé(s).</p>'+
  '<div class="kintra-coach-v2-signals"><strong>Course × musculation × récupération</strong>'+signals+'</div>'+
  '<div class="kintra-coach-v2-proposals"><strong>Propositions soumises à confirmation</strong>'+
  (review.proposals.length?actions:'<p class="sub">Aucun allègement justifié par les données actuellement disponibles.</p>')+
  '</div><small class="sub">Analyse indicative, non médicale. Aucun changement du plan ni publication externe sans action explicite.</small></section>';
}
export function renderCoachProposalPreview(preview,reason){
 if(!preview)return "";
 return '<h2>Vérifier la proposition</h2><p class="sub">'+esc(reason)+'</p>'+
 '<div class="kintra-coach-v2-comparison"><div><small>AVANT</small><strong>'+esc(preview.before.title)+'</strong>'+
 '<span>'+number(numeric(preview.before.distanceKm))+' km · '+esc(preview.before.intensity||"Non précisée")+'</span></div>'+
 '<div><small>APRÈS CONFIRMATION</small><strong>'+esc(preview.after.title)+'</strong>'+
 '<span>'+number(preview.after.distanceKm)+' km · '+esc(preview.after.intensity)+'</span></div></div>'+
 '<p class="sub">Seule cette séance du '+esc(preview.after.date)+' sera modifiée localement. Aucune publication automatique sur Intervals.icu ou Hevy.</p>'+
 '<div class="actions"><button class="btn full" data-action="coachAccept">Confirmer l’ajustement</button>'+
 '<button class="btn secondary" data-action="coachReject">Conserver le plan</button></div>';
}
