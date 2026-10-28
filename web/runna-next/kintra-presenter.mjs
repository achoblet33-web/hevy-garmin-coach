/* KINTRA: source-grounded dashboard and progress metrics. */
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=x=>x==null||x===""||!Number.isFinite(Number(x))?null:Number(x);
const shift=(d,n)=>{const v=new Date(d+"T12:00:00Z");v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10)};
const shown=x=>num(x)===null?"—":num(x).toLocaleString("fr-FR",{maximumFractionDigits:1});
export const formatPace=x=>{const v=num(x);if(v===null||v<=0)return "—";const s=Math.round(v*60);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")+" /km"};
export const formatTime=x=>{const v=num(x);if(v===null||v<=0)return "—";const s=Math.round(v*60);return [Math.floor(s/3600),String(Math.floor(s/60)%60).padStart(2,"0"),String(s%60).padStart(2,"0")].join(":")};
export function weeklyRunningBars(activities=[],date){
 const bars=Array.from({length:7},(_,i)=>{const day=shift(date,i-6);
 const runs=activities.filter(x=>x?.category==="Course"&&String(x.startedAt||"").slice(0,10)===day);
 return {day,count:runs.length,km:+runs.reduce((s,x)=>s+Math.max(0,num(x.distanceKm)||0),0).toFixed(1)}});
 return {bars,totalKm:+bars.reduce((s,b)=>s+b.km,0).toFixed(1),count:bars.reduce((s,b)=>s+b.count,0)};
}
export function sleepTrend(wellness=[],date){
 const rows=wellness.filter(x=>x?.date<=date&&x.date>=shift(date,-8)&&num(x.sleepSecs)>0).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const recent=rows.find(x=>x.date>=shift(date,-1))||null;
 const reference=rows.filter(x=>x!==recent).slice(0,6).map(x=>num(x.sleepSecs)).filter(x=>x!==null);
 const amount=recent?num(recent.sleepSecs):null;
 return {hours:amount===null?null:Math.floor(amount/3600),minutes:amount===null?null:Math.floor(amount%3600/60),
  changePct:amount!==null&&reference.length>=3?Math.round((amount/(reference.reduce((a,b)=>a+b,0)/reference.length)-1)*100):null,
  score:num(recent?.sleepScore),date:recent?.date||null};
}
export function strengthDistribution(strength=[],date){
 const recent=strength.filter(x=>{const d=String(x.startedAt||"").slice(0,10);return d>=shift(date,-6)&&d<=date});
 const r={total:recent.length,upper:0,lower:0,mixed:0,other:0};
 for(const x of recent){const name=String(x.title||"");
 const lower=/jamb|leg|lower|bas du corps|squat|fente|deadlift|soulev/i.test(name);
 const upper=/upper|haut|push|pull|pector|dos|épaule|chest|back/i.test(name);
 if(lower&&upper)r.mixed++;else if(lower)r.lower++;else if(upper)r.upper++;else r.other++;
 }return r;
}
export function renderWeeklyChart(activities=[],date,plan=null){
 const wk=weeklyRunningBars(activities,date),max=Math.max(1,...wk.bars.map(x=>x.km));
 const bars=wk.bars.map(x=>`<div class="kintra-week-bar"><div class="kintra-week-column"><i style="height:${x.km?Math.max(4,Math.round(x.km/max*100)):0}%" title="${esc(x.km)} km"></i></div><small>${new Date(x.day+"T12:00:00Z").toLocaleDateString("fr-FR",{weekday:"narrow",timeZone:"UTC"})}</small></div>`).join("");
 const period=plan?.summary?.find(x=>x.from<=date&&date<=shift(x.from,6));
 return `<div class="kintra-week-chart" aria-label="Volume de course réel par jour">${bars}</div>
 <div class="kintra-week-caption">${shown(wk.totalKm)} km enregistrés${period?.plannedKm>0?" · objectif du plan "+shown(period.plannedKm)+" km":""}</div>`;
}
export function renderRaceSummary(activities=[],feedback={}){
 const latest=activities.filter(x=>x?.category==="Course").sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0];
 if(!latest)return `<article class="card" data-testid="progress-feature"><h3 class="heading">Dernière séance</h3><p class="sub">Synchronise une course pour afficher un bilan.</p></article>`;
 const id=String(latest.externalId||latest.id||"").replace(/^intervals:/,"");
 const rpe=num(feedback["activity:"+id]?.rpe)??num(latest.rpe);
 const pace=num(latest.distanceKm)>0&&num(latest.durationMinutes)>0?Number(latest.durationMinutes)/Number(latest.distanceKm):null;
 const metrics=[["Distance",shown(latest.distanceKm)+" km"],["Durée",formatTime(latest.durationMinutes)],["Allure moy.",formatPace(pace)],
 ["FC moyenne",num(latest.averageHeartRate)===null?"—":shown(latest.averageHeartRate)+" bpm"],["Charge",shown(latest.trainingLoad)],["Ressenti",rpe===null?"—":shown(rpe)+"/10"]];
 return `<article class="card kintra-completed-card" data-testid="progress-feature">
 <div class="kintra-completed-status">✓ Séance enregistrée <small>${esc(String(latest.startedAt||"").slice(0,10))}</small></div>
 <button class="kintra-completed-title" data-action="activity:${esc(id)}"><span class="kintra-run-symbol">↗</span><strong>${esc(latest.title||"Course")}</strong><span>›</span></button>
 <div class="kintra-completed-stats">${metrics.map(([label,value])=>`<div><strong>${esc(value)}</strong><small>${esc(label)}</small></div>`).join("")}</div>
 <p class="sub">${latest.pairedEventId?"Associée au calendrier Intervals.icu":"Association avec la séance prévue non confirmée"}</p>
 <button class="btn secondary full" data-action="activity:${esc(id)}">Voir les fractions et le bilan ›</button></article>`;
}