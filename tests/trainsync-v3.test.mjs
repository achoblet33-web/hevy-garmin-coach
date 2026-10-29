import test from "node:test";
import assert from "node:assert/strict";
import { buildRunningWorkout } from "../Backend/running-workouts.mjs";
const DATE="2026-11-03",NOW="2026-10-28";
test("endurance fondamentale: total and heart-rate zones",()=>{
  const w=buildRunningWorkout({kind:"easy",date:DATE,durationMinutes:45},NOW);
  assert.equal(w.type,"Run");assert.equal(w.category,"WORKOUT");
  assert.match(w.description,/- 30m Z2 HR/);
  assert.equal(w.moving_time,2700);
});
test("tempo: duration and HR steps",()=>{
  const w=buildRunningWorkout({kind:"tempo",date:DATE,durationMinutes:50},NOW);
  assert.match(w.description,/- 30m Z3 HR/);
  assert.equal(w.moving_time,3000);
});
test("fractionné: repeats and intervals with pace zones",()=>{
  const w=buildRunningWorkout({kind:"interval",date:DATE,repeats:6,intervalMeters:800},NOW);
  assert.match(w.description,/\n\n6x\n- 800mtr Z4 Pace\n- 2m Z2 Pace\n\n/);
  assert.equal(w.moving_time,undefined);
  assert.equal(w.external_id,"trainsync3-2026-11-03-interval-6x800");
});
test("stable external ID prevents ordinary repeat duplicates",()=>{
  const x={kind:"long",date:DATE,durationMinutes:90};
  assert.equal(buildRunningWorkout(x,NOW).external_id,buildRunningWorkout(x,NOW).external_id);
});
test("invalid dates and type rejected",()=>{
  assert.throws(()=>buildRunningWorkout({kind:"easy",date:"2026-02-31"},NOW),/Date/);
  assert.throws(()=>buildRunningWorkout({kind:"easy",date:"2026-01-01"},NOW),/Date/);
  assert.throws(()=>buildRunningWorkout({kind:"easy",date:"2030-01-01"},NOW),/Date/);
  assert.throws(()=>buildRunningWorkout({kind:"fake",date:DATE},NOW),/Type/);
});
test("unknown duration clamps conservatively",()=>{
  const w=buildRunningWorkout({kind:"easy",date:DATE,durationMinutes:1},NOW);
  assert.equal(w.moving_time,1200);
});
