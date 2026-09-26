// Hevy et Garmin restent deux sources indépendantes.
// Ce rapprochement est uniquement local et n'altère jamais les données synchronisées.
(() => {
  const cache=new WeakMap();
  const STRENGTH=/(musculation|weight.?training|strength|gym|muscle|workout strength|renforcement)/i;
  const date = value => new Date(value||0).getTime();
  const duration = s => {
    const n=Number(s?.durationMinutes);
    return Number.isFinite(n)&&n>=15&&n<=300?n:0;
  };
  function isGarminStrength(s) {
    return s?.source==="Garmin" &&
      STRENGTH.test([s.category,s.activityType,s.title].filter(Boolean).join(" "));
  }
  function overlapRatio(a,b) {
    const da=duration(a),db=duration(b);
    if (!da || !db) return null;
    const as=date(a.startedAt),bs=date(b.startedAt);
    const overlap=Math.max(0,Math.min(as+da*60000,bs+db*60000)-Math.max(as,bs));
    return overlap/(Math.min(da,db)*60000);
  }
  function findPairs(sessions) {
    if (!Array.isArray(sessions)) return [];
    const cached=cache.get(sessions);
    if (cached&&cached.length===sessions.length) return cached.pairs;
    const hevy=sessions.filter(s=>s?.source==="Hevy"&&date(s.startedAt)>0);
    const garmin=sessions.filter(s=>isGarminStrength(s)&&date(s.startedAt)>0)
      .sort((a,b)=>date(a.startedAt)-date(b.startedAt));
    const options=[];
    for (const h of hevy) {
      const time=date(h.startedAt);
      let lo=0,hi=garmin.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(date(garmin[mid].startedAt)<time-45*60000)lo=mid+1;else hi=mid;}
      for(let j=lo;j<garmin.length;j++){
        const g=garmin[j],delta=Math.abs(date(g.startedAt)-time)/60000;
        if(date(g.startedAt)>time+45*60000)break;
        const overlap=overlapRatio(h,g);
        const valid=overlap==null ? delta<=15 : (delta<=20&&overlap>=.50)||(delta<=45&&overlap>=.75);
        if (!valid)continue;
        const durationPenalty=duration(h)&&duration(g)?Math.abs(duration(h)-duration(g))*0.08:0;
        options.push({hevy:h,garmin:g,deltaMinutes:Math.round(delta),
          overlap:overlap==null?null:Math.round(overlap*100),score:delta+durationPenalty+(overlap==null?7:(1-overlap)*15)});
      }
    }
    options.sort((a,b)=>a.score-b.score);
    const usedH=new Set(),usedG=new Set(),pairs=[];
    for (const option of options) {
      if(usedH.has(String(option.hevy.id))||usedG.has(String(option.garmin.id)))continue;
      // Refuser une correspondance ambiguë plutôt que fusionner deux séances distinctes.
      const ambiguous=options.some(other=>other!==option &&
        (String(other.hevy.id)===String(option.hevy.id)||String(other.garmin.id)===String(option.garmin.id)) &&
        Math.abs(other.score-option.score)<4);
      if(ambiguous)continue;
      usedH.add(String(option.hevy.id));
      usedG.add(String(option.garmin.id));
      pairs.push(option);
    }
    cache.set(sessions,{length:sessions.length,pairs});
    return pairs;
  }
  function compositeSessions(sessions,pairs=findPairs(sessions)) {
    if(!pairs.length)return sessions;
    const byHevy=new Map(pairs.map(pair=>[String(pair.hevy.id),pair]));
    const garminIds=new Set(pairs.map(pair=>String(pair.garmin.id)));
    return sessions.filter(s=>!garminIds.has(String(s.id))).map(s=>{
      const pair=byHevy.get(String(s.id));
      if(!pair)return s;
      const g=pair.garmin;
      return {...s,
        // La durée réelle mesurée par la montre évite d'additionner deux chronomètres.
        durationMinutes:duration(g)||duration(s),
        calories:g.calories??s.calories,
        averageHeartRate:g.averageHeartRate??s.averageHeartRate,
        maxHeartRate:g.maxHeartRate??s.maxHeartRate,
        trainingLoad:g.trainingLoad??s.trainingLoad,
        aerobicEffect:g.aerobicEffect??s.aerobicEffect,
        anaerobicEffect:g.anaerobicEffect??s.anaerobicEffect,
        loadProfile:g.loadProfile??s.loadProfile,
        loadFocus:g.loadFocus??s.loadFocus,
        loadFocusWeight:g.loadFocusWeight??s.loadFocusWeight,
        garminPairId:g.id,
        pairedSources:["Hevy","Garmin"]
      };
    });
  }
  window.TrainSyncSessionFusion={findPairs,compositeSessions,isGarminStrength,overlapRatio};
})();