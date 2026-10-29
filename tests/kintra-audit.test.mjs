import test from "node:test";
import assert from "node:assert/strict";
import {evaluateReadiness,generateMaintenancePlan} from "../web/runna-next/kintra-coach.mjs";
import {forecastSlots,formatLocalHour} from "../web/runna-next/kintra-weather.mjs";
import {weekTrend,analyzeRun} from "../web/runna-next/kintra-insights.mjs";
import {handleWeather} from "../preview/weather-relay.mjs";
const date="2026-10-28";
test("no synthetic readiness number for empty or stale wellness",()=>{
 const empty=evaluateReadiness({date});
 assert.equal(empty.state,"insufficient");assert.deepEqual(empty.signals,[]);
 const stale=evaluateReadiness({date,wellness:[{date:"2026-10-21",hrv:100,restingHR:45,sleepSecs:28800}]});
 assert.equal(stale.state,"insufficient");
});
test("readiness uses individual HRV and resting HR baselines and flags deteriorations",()=>{
 const wellness=[{date,hrv:24,restingHR:65,sleepSecs:17000},
 {date:"2026-10-27",hrv:57,restingHR:50},
 {date:"2026-10-26",hrv:54,restingHR:51},
 {date:"2026-10-25",hrv:59,restingHR:52},
 {date:"2026-10-24",hrv:60,restingHR:49}];
 const v=evaluateReadiness({date,wellness});
 assert.equal(v.state,"caution");
 assert.ok(v.signals.filter(x=>x.status==="attention").length>=3);
 assert.equal(v.freshness,date);assert.equal(v.referenceDays,4);
 const favorable=evaluateReadiness({date,wellness:[{date,hrv:62,restingHR:50,sleepSecs:27600},...wellness.slice(1)]});
 assert.equal(favorable.state,"favorable");
 assert.ok(!Object.hasOwn(favorable,"score"));
});
test("maintenance focus actually changes training prescription, without modifying profile",()=>{
 const input={weeklyKm:28,frequency:4,longDay:6,availableDays:[0,2,4,6]};
 const endurance=generateMaintenancePlan({...input,maintenanceFocus:"endurance"},date);
 const speed=generateMaintenancePlan({...input,maintenanceFocus:"speed"},date);
 assert.equal(endurance.sessions.filter(x=>["tempo","interval"].includes(x.kind)).length,0);
 assert.ok(speed.sessions.some(x=>x.kind==="interval"));
 assert.equal(endurance.profile.raceDate,null);
});
test("forecast compares upcoming day hours in requested timezone and warns heat",()=>{
 const now=Date.UTC(2026,9,28,11,15);
 const base=Math.floor(now/3600000)*3600;
 const hours=Array.from({length:19},(_,i)=>base+i*3600);
 const hot=forecastSlots({timezone:"America/Martinique",hourly:{
  time:hours,apparent_temperature:hours.map((_,i)=>i===4?27:35),
  temperature_2m:hours.map(()=>29),relative_humidity_2m:hours.map(()=>83),
  precipitation_probability:hours.map(()=>15),wind_speed_10m:hours.map(()=>9),
  uv_index:hours.map(()=>4)}},now);
 assert.ok(hot.hours.length>=10);
 assert.ok(hot.hours.every(x=>x.epoch>=now-3600000&&x.epoch<=now+12*3600000));
 assert.ok(hot.hours.some(x=>x.caution));
 assert.equal(hot.best?.feels,27);
 assert.match(formatLocalHour(hot.best.epoch,"America/Martinique"),/^\d{2}:\d{2}$/);
});
test("empty weather data has no invented best running time",()=>{
 const r=forecastSlots({timezone:"Europe/Paris",hourly:{time:[]}},Date.now());
 assert.equal(r.best,null);assert.equal(r.available,false);
});
test("weather relay rejects missing coordinates and too-short city before any external call",async()=>{
 const invalid=await handleWeather(new Request("https://kintra.local/v3/weather"));
 assert.equal(invalid.status,400);
 const bad=await handleWeather(new Request("https://kintra.local/v3/places?name=A"));
 assert.equal(bad.status,400);
});
test("geocoding and hourly weather relay pass through bounded normalized data",async()=>{
 const original=globalThis.fetch;
 try{
  const calls=[];
  globalThis.fetch=async u=>{
   const url=String(u);calls.push(url);
   if(url.includes("geocoding-api"))return Response.json({results:[{id:12,name:"Le Lamentin",admin1:"Martinique",country:"France",latitude:14.61,longitude:-60.99}]});
   if(url.includes("api.open-meteo"))return Response.json({timezone:"America/Martinique",current:{temperature_2m:30,apparent_temperature:34,relative_humidity_2m:70,wind_speed_10m:11},hourly:{time:[1900000000],apparent_temperature:[34]}});
   throw Error("Unknown URL");
  };
  const c=await handleWeather(new Request("https://kintra.local/v3/places?name=Le%20Lamentin"));
  const places=await c.json();assert.equal(places.results.length,1);
  const weather=await handleWeather(new Request("https://kintra.local/v3/weather?lat=14.61&lon=-60.99"));
  const data=await weather.json();
  assert.equal(data.apparent,34);assert.deepEqual(data.hourly.time,[1900000000]);
  assert.ok(calls[1].includes("timeformat=unixtime"));
 }finally{globalThis.fetch=original;}
});
test("progress compares recorded weekly distances without inferring fitness",()=>{
 const runs=[{category:"Course",startedAt:"2026-10-28T07:00",distanceKm:8},{category:"Course",startedAt:"2026-10-24T07:00",distanceKm:6},{category:"Course",startedAt:"2026-10-19T07:00",distanceKm:10}];
 const v=weekTrend(runs,date);assert.equal(v.currentKm,14);assert.equal(v.previousKm,10);assert.equal(v.changePct,40);
});
test("post-run advice uses actual interval variability and RPE, not fabricated race pace",()=>{
 const a={id:"run1",category:"Course",startedAt:date+"T08:00",distanceKm:10,durationMinutes:50};
 const analysis=analyzeRun({activity:a,segments:[{distanceMeters:800,averagePaceMinKm:4.3},
 {distanceMeters:800,averagePaceMinKm:5.3},{distanceMeters:800,averagePaceMinKm:4.5}],feedback:{rpe:9}});
 assert.ok(analysis.recommendations.some(x=>/régulière/.test(x)));
 assert.ok(analysis.recommendations.some(x=>/RPE 9/.test(x)));
 assert.match(analysis.observations[0],/Pas assez/);
});
