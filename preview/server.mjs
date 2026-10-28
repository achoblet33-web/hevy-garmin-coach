// Standalone Railway PREPRODUCTION preview: synthetic data only, no Cloudflare API secrets.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import demoWorker from "./worker.js";
import liveWorker from "./live-worker.mjs";
import {hevyFetch} from "./hevy-relay.mjs";
const root=resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",
 ".webmanifest":"application/manifest+json; charset=utf-8",".json":"application/json; charset=utf-8"};
const port=Number(process.env.PORT || 8080);
const app=createServer(async(req,res)=>{
  const u=new URL(req.url || "/", "http://localhost");
  res.setHeader("X-Robots-Tag","noindex, nofollow");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Permissions-Policy","geolocation=(), microphone=(), camera=()");
  res.setHeader("Content-Security-Policy","default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","no-store");
  if(u.pathname==="/health"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({ok:true,mode:"active-capable",keyStoredOnServer:false}));}
  if(u.pathname==="/") {res.writeHead(302,{Location:"/runna-next/index.html"+(u.searchParams.get("demo")==="1"?"?demo=1":"")});return res.end();}
  if(u.pathname==="/v3/hevy/workouts"){
    if(req.method!=="GET"){res.writeHead(405);return res.end();}
    const upstream=await hevyFetch(new Request("https://kintra.local/v3/hevy/workouts",{
      headers:{"x-hevy-api-key":req.headers["x-hevy-api-key"]||""}}));
    res.writeHead(upstream.status,Object.fromEntries(upstream.headers));
    return res.end(Buffer.from(await upstream.arrayBuffer()));
  }
  if(u.pathname==="/v3/weather"){
    if(req.method!=="GET"){res.writeHead(405);return res.end();}
    const lat=Number(u.searchParams.get("lat")),lon=Number(u.searchParams.get("lon"));
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
      res.writeHead(400,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Coordonnées invalides."}));}
    try {
      const roundedLat=Math.round(lat*100)/100,roundedLon=Math.round(lon*100)/100;
      const url=new URL("https://api.open-meteo.com/v1/forecast");
      for(const [k,v] of [["latitude",roundedLat],["longitude",roundedLon],
        ["current","temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"],
        ["timezone","auto"],["forecast_days","1"]])url.searchParams.set(k,String(v));
      const resp=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:"application/json"}});
      if(!resp.ok)throw Error("Weather API unavailable");
      const raw=await resp.json(),w=raw.current||{};
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
      return res.end(JSON.stringify({ok:true,source:"Open-Meteo",temperature:w.temperature_2m??null,
        apparent:w.apparent_temperature??null,humidity:w.relative_humidity_2m??null,
        wind:w.wind_speed_10m??null,weatherCode:w.weather_code??null,at:w.time??null}));
    }catch{res.writeHead(503,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Météo momentanément indisponible."}));}
  }
  if(u.pathname.startsWith("/v3/")) {
    try {
      const pieces=[];let size=0;for await(const part of req){size+=part.length;if(size>18000){res.writeHead(413);return res.end("Requête trop volumineuse");}pieces.push(part);}
      const isDemo=u.searchParams.get("demo")==="1";
      const handler=isDemo?demoWorker:liveWorker;
      const upstream=await handler.fetch(new Request("http://preview.local"+u.pathname+u.search,{
        method:req.method || "GET",...(pieces.length?{body:Buffer.concat(pieces)}:{}),
        headers:{...(req.headers["content-type"]?{"Content-Type":req.headers["content-type"]}:{}),
           ...(req.headers["x-intervals-api-key"]?{"x-intervals-api-key":req.headers["x-intervals-api-key"]}:{})}
      }),{});
      res.writeHead(upstream.status,Object.fromEntries(upstream.headers));
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }catch(error){res.writeHead(500,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Simulation temporairement indisponible."}));}
  }
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);return res.end();}
  const relative=decodeURIComponent(u.pathname==="/"?"/index.html":u.pathname);
  const target=resolve(join(root,"."+relative));
  if(target!==root && !target.startsWith(root+sep)){res.writeHead(403);return res.end();}
  try {
    const info=await stat(target);
    if(!info.isFile()){res.writeHead(404);return res.end();}
    const body=await readFile(target);
    res.writeHead(200,{"Content-Type":mime[extname(target)] || "application/octet-stream",
      "Content-Length":String(body.length)});
    if(req.method==="HEAD")return res.end();
    return res.end(body);
  }catch{res.writeHead(404);return res.end("Not found");}
});
app.listen(port,"0.0.0.0",()=>{console.log("TrainSync Coach live-ready service listening "+port);});
