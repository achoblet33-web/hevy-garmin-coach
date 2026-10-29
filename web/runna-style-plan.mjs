import { generateRunningPlan, applyTodayRecommendation, getWeek, moveWorkout } from "./plan-engine.mjs";
/* Performance Coach: new original plan UI, additive to all existing TrainSync modules. */
const KEY="trainsync-v31-running-plans";
const el=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const pretty=s=>new Date(s+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});
const days=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const palette={easy:"#3fbe96",long:"#9f87f7",tempo:"#f6b85c",interval:"#ff8063",race:"#f4df8a",rest:"#9aa59d"};
let plan=null,draft=null,history=[],week=1,activities=[],strength=[],tab="today";
function restore(){try{const d=JSON.parse(localStorage.getItem(KEY)||"{}");plan=d.plan||null;history=d.history||[];}catch{plan=null;history=[];}}
function save(){localStorage.setItem(KEY,JSON.stringify({plan,history:history.slice(-5)}));}
const css=`
.ts31{display:grid;gap:12px;margin:8px 0}.ts31-card{padding:16px;border:1px solid #314338;border-radius:20px;background:#15201b;color:#f0fff4}.ts31-hero{background:linear-gradient(135deg,#1a4f38,#162920)}.ts31-hero h2{font-size:25px;margin:5px 0}.ts31-kicker{font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:850;color:#7be3ae}.ts31-sub{font-size:12px;line-height:1.55;color:#b4c7b9;margin:6px 0 13px}.ts31-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ts31-fields label{font-size:11px;color:#d0e0d3;display:grid;gap:6px;min-width:0}.ts31-fields input,.ts31-fields select{color:#f5fff9;background:#091810;border:1px solid #41614d;padding:11px;border-radius:10px;box-sizing:border-box;min-width:0;width:100%}.ts31-wide{grid-column:span 2}.ts31-days{display:flex;gap:8px;flex-wrap:wrap}.ts31-days label{display:flex;align-items:center;gap:3px}.ts31-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 2px}.ts31-btn{padding:11px;border-radius:11px;background:#397e55;color:#fff;border:1px solid #67c496;font-size:12px;font-weight:750;cursor:pointer}.ts31-alt{background:#22382a;border-color:#405f4a}.ts31-btn:disabled{opacity:.4}.ts31-nav{display:flex;gap:6px;overflow:auto}.ts31-nav button{border:1px solid #3d6049;border-radius:9px;background:#1e3027;color:#c5e8d0;padding:10px;white-space:nowrap;font-size:11px}.ts31-nav button.on{background:#317e55;color:#fff}.ts31-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.ts31-stats div{border-radius:11px;background:#243a2b;padding:11px;min-width:0}.ts31-stats strong{display:block;font-size:18px}.ts31-stats small{font-size:10px;color:#b0c0ad}.ts31-day{padding:12px 0;border-bottom:1px solid #2c4433;display:flex;gap:11px}.ts31-day:last-child{border:0}.ts31-mark{width:4px;border-radius:5px;min-height:50px}.ts31-daymain{flex:1}.ts31-daymain strong{display:block;font-size:14px}.ts31-daymain small{display:block;color:#b8c5b8;font-size:11px;margin-top:5px;line-height:1.4}.ts31-warning{font-size:12px;color:#f7d49e}.ts31-badge{display:inline-block;font-size:11px;color:#8df0b4;background:#214d32;border-radius:99px;padding:5px 10px}.ts31-weekctrl{display:flex;align-items:center;justify-content:space-between}.ts31-weekctrl button{background:#2f4e36;border-radius:10px;border:0;color:#fff;padding:8px 13px}.ts31-progress{background:#334638;border-radius:99px;height:7px;overflow:hidden}.ts31-progress span{background:#7ced9d;height:100%;display:block}@media(max-width:370px){.ts31-fields{grid-template-columns:1fr}.ts31-wide{grid-column:auto}}
`;
const button=(action,label,klass="")=>`<button class="ts31-btn ${klass}" data-ts31="${action}" type="button">${label}</button>`;
function form(){
 const p=plan?.profile||{},next=day(84);
 return `<article class="ts31-card"><div class="ts31-kicker">Créer ou modifier un programme</div><h3>Ton objectif, tes disponibilités</h3>
 <p class="ts31-sub">Renseigne ton kilométrage actuel réel. La planification n'invente ni test de performance ni allure de seuil.</p>
 <div class="ts31-fields">
 <label>Distance<select id="ts31Distance">${[5,10,21.0975,42.195].map(x=>`<option value="${x}" ${(p.distanceKm||10)===x?"selected":""}>${x===21.0975?"Semi-marathon":x===42.195?"Marathon":x+" km"}</option>`).join("")}</select></label>
 <label>Date de course<input type="date" id="ts31Date" min="${day(21)}" max="${day(365)}" value="${p.raceDate||next}"></label>
 <label>Km par semaine actuellement<input type="number" id="ts31Weekly" min="3" max="140" step=".5" placeholder="20" value="${p.weeklyKm??""}"></label>
 <label>Sorties par semaine<select id="ts31Frequency">${[2,3,4,5,6].map(x=>`<option value="${x}" ${(p.frequency||3)===x?"selected":""}>${x} sorties</option>`).join("")}</select></label>
 <label>Sortie longue le<select id="ts31Longday">${days.map((d,i)=>`<option value="${i}" ${(p.longDay??6)===i?"selected":""}>${d}</option>`).join("")}</select></label>
 <label>Temps visé (facultatif)<input id="ts31RaceTime" placeholder="0:49:00"></label>
 <div class="ts31-wide"><span class="ts31-sub">Jours disponibles</span><div class="ts31-days">
 ${days.map((d,i)=>`<label><input type="checkbox" name="ts31Day" value="${i}" ${p.availableDays?p.availableDays.includes(i)?"checked":"":([1,3,6].includes(i)?"checked":"")}>${d}</label>`).join("")}
 </div></div></div>${button("generate","Prévisualiser mon programme")}
 <p class="ts31-warning" id="ts31Message"></p></article>`;
}
function fromForm(){
 const t=el("ts31RaceTime").value.trim();let time=null;
 if(t){if(!/^\d{1,2}:\d{2}:\d{2}$/.test(t))throw Error("Temps au format H:MM:SS attendu.");
 const [h,m,s]=t.split(":").map(Number);if(m>59||s>59)throw Error("Temps invalide.");time=h*60+m+s/60;}
 return {raceDate:el("ts31Date").value,distanceKm:Number(el("ts31Distance").value),
 weeklyKm:Number(el("ts31Weekly").value),frequency:Number(el("ts31Frequency").value),
 longDay:Number(el("ts31Longday").value),availableDays:[...document.querySelectorAll('[name="ts31Day"]:checked')].map(x=>Number(x.value)),targetTimeMinutes:time};
}
function summary(){
 const p=plan.profile,w=plan.summary[Math.min(week-1,plan.summary.length-1)];
 return `<div class="ts31-stats"><div><strong>${plan.totalWeeks}</strong><small>semaines</small></div><div><strong>${p.frequency}</strong><small>sorties/semaine</small></div><div><strong>${w?.plannedKm??0}</strong><small>km prévus semaine ${week}</small></div></div>`;
}
function todayView(){
 if(!plan)return form();
 const now=day(0),today=plan.sessions.find(x=>x.date===now&&x.kind!=="rest");
 const next=plan.sessions.find(x=>x.date>=now&&x.kind!=="rest");
 const rec=applyTodayRecommendation(plan,{today:now,strength});
 const daysLeft=Math.max(0,Math.round((new Date(plan.profile.raceDate+"T12:00:00Z")-new Date(now+"T12:00:00Z"))/86400000));
 return `<article class="ts31-card ts31-hero"><div class="ts31-kicker">Aujourd'hui · Ton coach</div>
 <h2>${esc(today?.title||"Garde le cap")}</h2><p class="ts31-sub">${today?today.distanceKm+" km · "+esc(today.intensity):next?"Prochaine sortie : "+pretty(next.date)+" · "+next.distanceKm+" km":"Aucune séance prévue."}</p>
 <span class="ts31-badge">${daysLeft} jours avant ta course</span><div style="margin:15px 0">${summary()}</div>
 <div class="ts31-progress"><span style="width:${Math.min(100,Math.round(week/plan.totalWeeks*100))}%"></span></div></article>
 <article class="ts31-card"><div class="ts31-kicker">Briefing</div><h3>${esc(rec.title)}</h3>
 <p class="ts31-sub">${esc(rec.reason)}</p><p class="ts31-warning">${rec.changed?"Fatigue récente identifiée : proposition uniquement, aucune séance changée sans accord.":"Vérifie ton ressenti et la météo avant de partir."}</p>
 ${button("plan","Voir les séances")} ${button("adjust","Adapter","ts31-alt")}</article>
 ${plan.notes.map(x=>`<p class="ts31-warning">• ${esc(x)}</p>`).join("")}`;
}
function planView(){
 if(!plan)return form();
 return `<article class="ts31-card"><div class="ts31-kicker">Mon programme</div>
 <h3>${plan.profile.distanceKm} km · ${pretty(plan.profile.raceDate)}</h3>${summary()}
 <div class="ts31-weekctrl" style="margin:15px 0"><button data-ts31="prev">‹</button><div style="text-align:center"><strong>Semaine ${week}/${plan.totalWeeks}</strong><div class="ts31-sub">${esc(plan.summary[week-1]?.phase||"")}</div></div><button data-ts31="next">›</button></div>
 ${getWeek(plan,week).map(x=>`<div class="ts31-day"><span class="ts31-mark" style="background:${palette[x.kind]||"#888"}"></span><div class="ts31-daymain"><div class="ts31-sub">${pretty(x.date)}</div>
 <strong>${esc(x.title)} · ${x.distanceKm} km</strong><small>${esc(x.intensity)} · ${esc(x.reason)}</small>
 <div class="ts31-actions">${x.exportable?button("watch:"+x.id,"Préparer sur la montre"):""}${x.kind!=="race"?button("move:"+x.id,"Déplacer","ts31-alt"):""}
 ${x.kind!=="rest"?button("done:"+x.id,x.status==="done"?"✓ Terminé":"Marquer réalisé","ts31-alt"):""}</div></div></div>`).join("")}
 <p class="ts31-sub">Le plan reste local. Publie chaque séance explicitement via Intervals.icu pour l'Apple Watch.</p>
 ${button("modify","Modifier objectif","ts31-alt")}</article>`;
}
function adjustView(){
 if(!plan)return form();
 return `<article class="ts31-card"><div class="ts31-kicker">Adapter mon programme</div><h3>Vacances, fatigue ou interruption</h3>
 <p class="ts31-sub">TrainSync prépare une nouvelle version que tu peux accepter, annuler ou restaurer. Aucun changement silencieux.</p>
 <div class="ts31-fields"><label>Motif<select id="ts31Mod"><option value="recovery">Pas à 100 %</option><option value="holiday">Vacances</option></select></label>
 <label>Effort autorisé<select id="ts31Level"><option value="easy">Footings faciles</option><option value="off">Pause complète</option></select></label>
 <label>Du<input type="date" id="ts31From" value="${day(0)}"></label><label>Au<input type="date" id="ts31To" value="${day(6)}"></label></div>
 <div class="ts31-actions">${button("rebuild","Prévisualiser l'adaptation")}${history.length?button("undo","Restaurer précédent","ts31-alt"):""}</div>
 <p class="ts31-warning" id="ts31Message"></p></article>`;
}
function metricsView(){
 const runs=activities.filter(x=>x.category==="Course");
 const km=Math.round(runs.reduce((n,x)=>n+(Number(x.distanceKm)||0),0)*10)/10;
 return `<article class="ts31-card"><div class="ts31-kicker">Progression</div><h3>Activités réellement importées</h3>
 <div class="ts31-stats"><div><strong>${runs.length}</strong><small>courses</small></div><div><strong>${km}</strong><small>km importés</small></div><div><strong>—</strong><small>Pace Insights à construire</small></div></div>
 <p class="ts31-sub">Les analyses de tours, les prédictions de chrono et les tendances de seuil exigeront des données de course supplémentaires et une validation des méthodes.</p>
 ${runs.slice(0,8).map(x=>`<div class="ts31-day"><div class="ts31-daymain"><strong>${esc(x.title)}</strong><small>${pretty(String(x.startedAt).slice(0,10))} · ${x.distanceKm||"—"} km</small></div></div>`).join("")}</article>`;
}
function calendarView(){
 if(!plan)return form();
 return `<article class="ts31-card"><div class="ts31-kicker">Calendrier flexible</div><h3>${plan.totalWeeks} semaines</h3>
 ${plan.summary.map(x=>`<div class="ts31-day"><div class="ts31-daymain"><strong>Semaine ${x.week} · ${esc(x.phase)}</strong><small>${x.plannedKm} km · ${x.count} créneaux prévus</small></div>
 <button class="ts31-btn ts31-alt" data-ts31="goto:${x.week}">Voir</button></div>`).join("")}</article>`;
}
function draw(selected="today"){
 tab=selected;const views={today:todayView,plan:planView,adjust:adjustView,metrics:metricsView,calendar:calendarView,create:form};
 el("ts31Pane").innerHTML=(views[selected]||todayView)();
 document.querySelectorAll("[data-ts31-tab]").forEach(b=>b.classList.toggle("on",b.dataset.ts31Tab===selected));
 if(selected==="create" && plan?.profile?.targetTimeMinutes){
  const seconds=Math.round(plan.profile.targetTimeMinutes*60);
  el("ts31RaceTime").value=`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
 }
}
function inspectDraft(){
 if(!draft)return;
 el("ts31Preview")?.remove();
 const card=document.createElement("article");card.id="ts31Preview";card.className="ts31-card";
 card.innerHTML=`<div class="ts31-kicker">Aperçu avant validation</div><h3>${draft.totalWeeks} semaines · ${draft.profile.distanceKm} km</h3>
 <p class="ts31-sub">${draft.sessions.filter(x=>x.kind!=="rest").length} créneaux, semaines d'assimilation et affûtage inclus. Les changements ne sont pas encore enregistrés.</p>
 ${draft.notes.map(x=>`<p class="ts31-warning">• ${esc(x)}</p>`).join("")}
 <div class="ts31-actions">${button("accept","Adopter ce programme")}${button("cancel","Annuler","ts31-alt")}</div>`;
 el("ts31Pane").appendChild(card);
}
function prepare(id){
 const s=plan.sessions.find(x=>x.id===id);
 const kind=el("ts3WorkoutKind"),date=el("ts3WorkoutDate");
 if(!s||!kind||!date)return alert("Préparation Intervals.icu indisponible.");
 kind.value=s.kind;kind.dispatchEvent(new Event("change"));
 date.value=s.date;date.dispatchEvent(new Event("input"));
 el("ts3Preview").textContent=`Programme : ${s.distanceKm} km. Vérifie les intervalles et les durées dans le générateur avant publication.`;
 el("ts3WorkoutForm").scrollIntoView({behavior:"smooth",block:"center"});
}
function notify(error){const e=el("ts31Message");if(e)e.textContent=String(error);else alert(error);}
function handle(event){
 const nav=event.target.closest("[data-ts31-tab]");if(nav){draw(nav.dataset.ts31Tab);return;}
 const button=event.target.closest("[data-ts31]");if(!button)return;
 const cmd=button.dataset.ts31,[action,arg]=cmd.split(":");
 try{
  if(action==="generate"){draft=generateRunningPlan(fromForm(),day(0));inspectDraft();return;}
  if(action==="rebuild"){
   const type=el("ts31Mod").value,mode=el("ts31Level").value,start=el("ts31From").value,end=el("ts31To").value;
   if(!start||!end||start>end)throw Error("Période d'adaptation invalide.");
   const n=Math.round((new Date(end+"T12:00:00Z")-new Date(start+"T12:00:00Z"))/864e5)+1;
   if(n>(type==="recovery"?14:21))throw Error("Durée maximale : 14 jours pour la récupération, 21 pour les vacances.");
   draft=generateRunningPlan(plan.profile,plan.createdAt,{...plan.modifiers,[type]:{start,end,mode}});
   inspectDraft();return;
  }
  if(action==="accept"){
   if(!draft||!confirm("Adopter ce programme localement ? Aucun entraînement n'est envoyé automatiquement vers Intervals.icu."))return;
   if(plan)history.push(plan);history=history.slice(-5);plan=draft;draft=null;week=1;save();draw("today");return;
  }
  if(action==="cancel"){draft=null;el("ts31Preview")?.remove();return;}
  if(action==="prev"||action==="next"){week=Math.max(1,Math.min(plan.totalWeeks,week+(action==="prev"?-1:1)));draw("plan");return;}
  if(action==="goto"){week=Number(arg);draw("plan");return;}
  if(["plan","adjust","modify"].includes(action)){draw(action==="modify"?"create":action);return;}
  if(action==="undo"){if(history.length&&confirm("Restaurer le programme précédent ?")){plan=history.pop();save();draw("plan");}return;}
  if(action==="watch"){prepare(arg);return;}
  if(action==="move"){
   const workout=plan.sessions.find(x=>x.id===arg),next=prompt("Nouvelle date (AAAA-MM-JJ)",workout?.date);
   if(next){plan=moveWorkout(plan,arg,next);save();draw("plan");}return;
  }
  if(action==="done"){plan={...plan,sessions:plan.sessions.map(x=>x.id===arg?{...x,status:x.status==="done"?"planned":"done"}:x)};save();draw("plan");return;}
 }catch(e){notify(e.message||"Modification impossible.");}
}
function start(){
 const hero=document.querySelector("#performanceView .ts3-hero");if(!hero)return;
 const style=document.createElement("style");style.id="ts31Style";style.textContent=css;document.head.appendChild(style);
 const root=document.createElement("section");root.id="ts31Root";root.className="ts31";
 root.innerHTML=`<nav class="ts31-nav" aria-label="Navigation du coach">
 ${[["today","Aujourd'hui"],["plan","Programme"],["calendar","Calendrier"],["adjust","Adapter"],["metrics","Progression"]].map(([id,label])=>`<button data-ts31-tab="${id}">${label}</button>`).join("")}</nav>
 <div id="ts31Pane" class="ts31"></div>`;
 hero.insertAdjacentElement("afterend",root);restore();week=1;draw();
 root.addEventListener("click",handle);
 window.addEventListener("trainsync:v3:dashboard",event=>{
  activities=event.detail?.activities||[];strength=event.detail?.strength||[];
  if(tab==="metrics")draw(tab);
 });
}
document.addEventListener("DOMContentLoaded",start);
