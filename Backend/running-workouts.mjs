// Pure, testable Intervals.icu Run workout builder. Never selects uncalibrated absolute paces.
const isoDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z")) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0,10) === s;
const dayShift = (day,n) => { const d=new Date(day+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const bounded = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Math.floor(Number(value)))) : fallback;
export function buildRunningWorkout(input, nowDay) {
  if(!input || typeof input!=="object")throw new Error("Paramètres de séance absents.");
  const kind=String(input.kind||"");
  if(!["easy","long","interval","tempo"].includes(kind))throw new Error("Type de séance invalide.");
  const date=String(input.date||"");
  if(!isoDay(date)||date<nowDay||date>dayShift(nowDay,365))throw new Error("Date de séance invalide ou passée.");
  const duration=bounded(input.durationMinutes,20,kind==="long"?180:120,45);
  const repeats=bounded(input.repeats,3,12,6);
  const meters=bounded(input.intervalMeters,200,2000,800);
  const names={easy:"Endurance fondamentale",long:"Sortie longue",interval:"Fractionné",tempo:"Tempo / seuil"};
  let description;
  if(kind==="interval") {
    description=`Échauffement\n- 12m Z2 Pace\n\n${repeats}x\n- ${meters}mtr Z4 Pace\n- 2m Z2 Pace\n\nRetour au calme\n- 8m Z2 Pace`;
  } else if(kind==="tempo") {
    description=`Échauffement\n- 12m Z2 HR\n\nTempo\n- ${Math.max(8,duration-20)}m Z3 HR\n\nRetour au calme\n- 8m Z1 HR`;
  } else {
    description=`Départ facile\n- 10m Z1 HR\n\nEndurance\n- ${duration-15}m Z2 HR\n\nRetour au calme\n- 5m Z1 HR`;
  }
  const suffix=kind==="interval"?`${repeats}x${meters}`:String(duration);
  return {category:"WORKOUT",type:"Run",start_date_local:date+"T00:00:00",
    name:"TrainSync · "+names[kind],description,external_id:`trainsync3-${date}-${kind}-${suffix}`,
    ...(kind==="interval"?{}:{moving_time:duration*60})};
}
