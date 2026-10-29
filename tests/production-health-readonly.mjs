// READ-ONLY configuration diagnostic; never transmits secrets or mutates production.
const url="https://hevy-garmin-coach.planetpizza.workers.dev/health";
try {
 const r=await fetch(url,{method:"GET",signal:AbortSignal.timeout(12000),cache:"no-store"});
 console.log("Worker production public health HTTP:",r.status);
 if(!r.ok)process.exit(0);
 const data=await r.json();
 const configured=data.configured || {};
 console.log(JSON.stringify({
   version:String(data.version ?? "unknown"),
   workerReachable:!!data.ok,
   hevyConfigured:configured.hevy === true,
   intervalsBackendConfigured:configured.garmin === true,
   coachConfigured:configured.coach === true
 },null,2));
} catch(error) {console.log("Public /health unavailable:",String(error?.message || error).slice(0,150));}
