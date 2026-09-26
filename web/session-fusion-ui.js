// Présentation fusionnée non destructive : Hevy = musculaire, Garmin = physiologique.
// Aucune donnée d'origine n'est modifiée, effacée ou réimportée.
(() => {
  const fusion=window.TrainSyncSessionFusion;
  if (!fusion) return;
  const originalRenderSessions=typeof renderSessions==="function"?renderSessions:null;
  const originalRenderAnalysis=typeof renderAnalysis==="function"?renderAnalysis:null;
  const originalRenderAll=typeof renderAll==="function"?renderAll:null;
  const originalOpenDetail=typeof openSessionDetail==="function"?openSessionDetail:null;
  const html=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const n=value=>value==null||value===""||!Number.isFinite(Number(value))?null:Number(value);

  function pairs() {
    return Array.isArray(state?.sessions)?fusion.findPairs(state.sessions):[];
  }

  function renderFusedCards() {
    if (typeof currentFilter!=="undefined" && currentFilter!=="all") return;
    const container=document.querySelector("#sessionsList");
    if (!container) return;
    const matches=pairs();
    if (!matches.length) return;
    const cards=new Map(Array.from(container.querySelectorAll(".session-card[data-session-id]"),el=>[el.dataset.sessionId,el]));
    for (const match of matches) {
      const hevyCard=cards.get(String(match.hevy.id)),garminCard=cards.get(String(match.garmin.id));
      if (!hevyCard||!garminCard)continue;
      hevyCard.classList.add("v231-fused");
      const badge=hevyCard.querySelector(".source-badge");
      if(badge)badge.textContent="Hevy + Garmin";
      const main=hevyCard.querySelector(".session-main");
      if(main&&!main.querySelector(".v231-fusion-line")) {
        const detail=document.createElement("p");detail.className="v231-fusion-line";
        const parts=["⌁ Même séance : Hevy + Garmin"];
        const hr=n(match.garmin.averageHeartRate),load=n(match.garmin.trainingLoad);
        if(hr!=null)parts.push("FC "+Math.round(hr)+" bpm");
        if(load!=null)parts.push("charge "+Math.round(load));
        detail.textContent=parts.join(" · ");
        main.appendChild(detail);
      }
      garminCard.remove();
    }
    // Réparer les intertitres des jours après disparition des cartes en doublon.
    container.querySelectorAll(":scope > .date-label").forEach(el=>el.remove());
    const byId=new Map(state.sessions.map(s=>[String(s.id),s]));
    let lastDay="";
    for (const card of container.querySelectorAll(":scope > .session-card[data-session-id]")) {
      const session=byId.get(card.dataset.sessionId);
      if(!session)continue;
      const d=new Date(session.startedAt);
      if(!Number.isFinite(d.getTime()))continue;
      const day=d.toDateString();
      if(day!==lastDay) {
        const label=document.createElement("p");label.className="date-label";
        label.textContent=d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
        card.insertAdjacentElement("beforebegin",label);
        lastDay=day;
      }
    }
  }

  function setVersionAndCount() {
    const version=document.querySelector("#versionLabel");
    if(version)version.textContent="TrainSync 2.3.1 · charges + RPE · fusion Hevy/Garmin";
    document.documentElement.dataset.trainsyncVersion="2.3.1";
    window.TRAINSYNC_RELEASE="2.3.1";
    const total=document.querySelector("#sessionSummaryBar strong");
    if(total&&Array.isArray(state?.sessions)){
      const real=state.sessions.filter(s=>!String(s.id||"").startsWith("demo-"));
      const pairCount=pairs().filter(p=>!String(p.hevy.id).startsWith("demo-")).length;
      total.textContent=(real.length-pairCount).toLocaleString("fr-FR");
    }
  }

  if(originalRenderSessions) {
    renderSessions=function(...args) {
      const result=originalRenderSessions.apply(this,args);
      renderFusedCards();
      return result;
    };
  }

  // L'Analyse existante conserve ses tableaux. Une paire a une durée unique,
  // le volume vient de Hevy et les métriques physiologiques viennent de Garmin.
  if(originalRenderAnalysis) {
    renderAnalysis=function(...args) {
      const original=state.sessions,matches=pairs();
      if(!matches.length)return originalRenderAnalysis.apply(this,args);
      try {
        state.sessions=fusion.compositeSessions(original,matches);
        return originalRenderAnalysis.apply(this,args);
      } finally {
        state.sessions=original;
      }
    };
  }

  if(originalRenderAll) {
    renderAll=function(...args) {
      const result=originalRenderAll.apply(this,args);
      setTimeout(setVersionAndCount,0);
      return result;
    };
  }

  if(originalOpenDetail) {
    openSessionDetail=async function(id) {
      const match=pairs().find(p=>String(p.hevy.id)===String(id));
      const result=await originalOpenDetail(id);
      if(!match)return result;
      const content=document.querySelector("#sessionDetailContent");
      const dialog=document.querySelector("#sessionDetailDialog");
      if(!content||!dialog?.open)return result;
      content.querySelector("#v231GarminVitals")?.remove();
      const g=match.garmin;
      const panel=document.createElement("section");
      panel.className="v231-vitals";panel.id="v231GarminVitals";
      const metrics=[
        ["Durée mesurée",n(g.durationMinutes)!=null?Math.round(n(g.durationMinutes))+" min":null],
        ["FC moyenne",n(g.averageHeartRate)!=null?Math.round(n(g.averageHeartRate))+" bpm":null],
        ["FC maximale",n(g.maxHeartRate)!=null?Math.round(n(g.maxHeartRate))+" bpm":null],
        ["Charge Garmin",n(g.trainingLoad)!=null?Math.round(n(g.trainingLoad)):null],
        ["Effet aérobie",n(g.aerobicEffect)],
        ["Effet anaérobie",n(g.anaerobicEffect)],
        ["Calories",n(g.calories)!=null?Math.round(n(g.calories))+" kcal":null]
      ].filter(pair=>pair[1]!=null);
      const head=document.createElement("div");head.className="v231-vitals-head";
      const eyebrow=document.createElement("span");eyebrow.textContent="⌁ HEVY + GARMIN";
      const title=document.createElement("strong");title.textContent="Une séance, deux suivis";
      const lead=document.createElement("small");
      lead.textContent="Hevy : exercices, charges et RPE. Garmin : fréquence cardiaque et charge physiologique.";
      head.append(eyebrow,title,lead);panel.appendChild(head);
      if(metrics.length) {
        const grid=document.createElement("div");grid.className="v231-vitals-grid";
        for(const [label,value] of metrics) {
          const el=document.createElement("div");
          el.innerHTML="<span>"+html(label)+"</span><strong>"+html(value)+"</strong>";
          grid.appendChild(el);
        }
        panel.appendChild(grid);
      }
      const note=document.createElement("p");
      note.textContent="Association automatique : départs espacés de "+match.deltaMinutes+
        " min"+(match.overlap!=null?" · chevauchement "+match.overlap+" %":"")+
        ". Les deux enregistrements d'origine sont conservés.";
      panel.appendChild(note);
      const link=document.createElement("button");
      link.id="v231OpenGarmin";link.type="button";
      link.className="secondary-button full";link.textContent="Voir la fiche Garmin complète";
      link.addEventListener("click",()=>{
        dialog.close();
        setTimeout(()=>originalOpenDetail(g.id),0);
      });
      panel.appendChild(link);
      const hero=content.querySelector(".detail-hero");
      if(hero)hero.insertAdjacentElement("afterend",panel);
      else content.prepend(panel);
      return result;
    };
  }

  function injectStyle() {
    if(document.querySelector("#v231FusionStyles"))return;
    const style=document.createElement("style");style.id="v231FusionStyles";
    style.textContent=[
      ".v231-fused{border-color:rgba(255,180,94,.36)!important}",
      ".v231-fused .source-badge{white-space:nowrap;font-size:9px;background:rgba(255,180,94,.13);color:#ffca91}",
      ".v231-fusion-line{font-size:10px;line-height:1.45;color:#ffca91;margin:5px 0 0}",
      ".v231-vitals{margin:12px 0 16px;padding:15px;border:1px solid rgba(255,180,94,.3);border-radius:20px;background:linear-gradient(135deg,rgba(255,180,94,.13),rgba(255,255,255,.025))}",
      ".v231-vitals-head span{display:block;font-size:10px;color:#ffb45e;letter-spacing:.1em;font-weight:800}",
      ".v231-vitals-head strong{display:block;font-size:17px;margin:5px 0}",
      ".v231-vitals-head small,.v231-vitals>p{font-size:11px;line-height:1.5;color:var(--muted,#a7aaa5)}",
      ".v231-vitals-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}",
      ".v231-vitals-grid>div{padding:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.12);border-radius:12px;min-width:0}",
      ".v231-vitals-grid span{display:block;font-size:10px;color:#aaa;margin-bottom:3px}",
      ".v231-vitals-grid strong{font-size:16px}",
      ".v231-load-context{padding:10px 12px;margin:8px 0;border:1px solid rgba(255,180,94,.18);border-radius:12px;background:rgba(255,180,94,.065)}",
      ".v231-load-context strong{display:block;font-size:12px;color:#ffca91}",
      ".v231-load-context span{display:block;font-size:11px;line-height:1.45;margin-top:4px}",
      ".v231-load-context details{font-size:10px;margin-top:8px;color:#c8c8c6}",
      ".v231-load-context summary{cursor:pointer;color:#ffb45e}"
    ].join("\n");
    document.head.appendChild(style);
  }

  document.addEventListener("click",event=>{
    if(event.target?.closest?.(".segmented,.bottom-nav,#syncButton,#syncNowButton"))
      setTimeout(setVersionAndCount,0);
  });
  document.addEventListener("DOMContentLoaded",()=>{
    injectStyle();renderFusedCards();setVersionAndCount();
  });
})();