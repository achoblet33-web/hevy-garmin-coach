import test from "node:test";
import assert from "node:assert/strict";
import {normalizeStreams,normalizeDetail} from "../preview/kintra-activity.mjs";
import {mapGeometry,renderRouteMap} from "../web/runna-next/kintra-map.mjs";
import {strengthStats,renderHevyWorkouts,renderHevyWorkoutDetail} from "../web/runna-next/kintra-hevy.mjs";
test("Intervals.icu latlng stream uses data latitude and data2 longitude with privacy-safe point cap",()=>{
 const points=Array.from({length:1000},(_,i)=>45.75+i*.00001);
 const result=normalizeStreams([{type:"latlng",data:points,data2:points.map((_,i)=>4.82+i*.00001)},
 {type:"altitude",data:[105,110,95]},{type:"heartrate",data:[151,158,164]},
 {type:"velocity_smooth",data:[3,4]}]);
 assert.equal(result.hasGps,true);assert.ok(result.points.length<=422);
 assert.deepEqual(result.points[0],[45.75,4.82]);assert.equal(result.points.at(-1)[1],4.82+.00999);
 assert.equal(result.heartRate.max,164);assert.equal(result.speed.max,14.4);
});
test("malformed, missing and null GPS points are rejected, never substituted by origin 0,0",()=>{
 const data=normalizeStreams([{type:"latlng",data:[45.75,null,95],data2:[4.82,null,11]}]);
 assert.equal(data.hasGps,false);assert.deepEqual(data.points,[[45.75,4.82]]);
 assert.equal(mapGeometry([[null,null],[45.75,4.82]]),null);
});
test("run metadata remains missing when unavailable and converts m/s correctly",()=>{
 const x=normalizeDetail({total_elevation_gain:111,max_speed:4.5,moving_time:1200,average_cadence:175});
 assert.equal(x.elevationGain,111);assert.equal(x.maxSpeedKmh,16.2);assert.equal(x.movingMinutes,20);
 assert.equal(x.elevationLoss,null);assert.equal(x.power,null);
});
test("GPS map remains local until optional OSM tiles are enabled and always has proper attribution",()=>{
 const pts=[[45.75,4.82],[45.751,4.821],[45.753,4.823]];
 const geometry=mapGeometry(pts);
 assert.ok(geometry.tiles.length>0&&geometry.tiles.length<=12);
 const offline=renderRouteMap(pts,false);
 assert.match(offline,/kintra-map-scene/);
 assert.ok(!offline.includes("tile.openstreetmap.org/"));
 const enabled=renderRouteMap(pts,true);
 assert.match(enabled,/tile.openstreetmap.org/);
 assert.match(enabled,/OpenStreetMap contributors/);
 assert.match(renderRouteMap([],false),/Aucune trace GPS/);
});
test("Hevy detail shows actual exercises and weights, never null converted to zero",()=>{
 const workout={id:"hevy:abc",title:"Jambes",startedAt:"2026-10-28T10:00:00Z",endedAt:"2026-10-28T11:03:00Z",exercises:[
 {title:"Back Squat",sets:[{reps:8,weightKg:80,rpe:8,type:"normal"},{reps:null,weightKg:null,rpe:null,type:"warmup"}]},
 {title:"Leg Curl",sets:[{reps:12,weightKg:20,rpe:7}]}]};
 const summary=strengthStats([workout]);assert.equal(summary.workouts,1);assert.equal(summary.sets,3);assert.equal(summary.reps,20);
 const html=renderHevyWorkoutDetail(workout);
 assert.match(html,/Back Squat/);assert.match(html,/80 kg/);assert.match(html,/1:|63 min/);assert.match(html,/—/);
 assert.match(renderHevyWorkouts([workout],true),/hevyWorkout:0/);
 assert.match(renderHevyWorkouts([],false),/Connecter Hevy Pro/);
});
test("malicious workout and exercise descriptions are escaped",()=>{
 const html=renderHevyWorkoutDetail({title:"<img src=x onerror=alert(1)>",exercises:[{title:"<svg onload=1>",sets:[]} ]});
 assert.ok(!html.includes("<img"));assert.ok(!html.includes("<svg"));assert.match(html,/&lt;img/);
});
