// Standalone Railway PREPRODUCTION preview: synthetic data only, no Cloudflare API secrets.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import demoWorker from "./worker.js";
const root=resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",
 ".webmanifest":"application/manifest+json; charset=utf-8",".json":"application/json; charset=utf-8"};
const port=Number(process.env.PORT || 8080);
const app=createServer(async(req,res)=>{
  const u=new URL(req.url || "/", "http://localhost");
  res.setHeader("X-Robots-Tag","noindex, nofollow");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","no-store");
  if(u.pathname==="/health"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({ok:true,mode:"synthetic-staging"}));}
  if(u.pathname==="/") {res.writeHead(302,{Location:"/runna-next/index.html?demo=1"});return res.end();}
  if(u.pathname.startsWith("/v3/")) {
    try {
      const pieces=[];for await(const part of req)pieces.push(part);
      const upstream=await demoWorker.fetch(new Request("http://preview.local"+u.pathname+u.search,{
        method:req.method || "GET",...(pieces.length?{body:Buffer.concat(pieces)}:{}),
        ...(req.headers["content-type"]?{headers:{"Content-Type":req.headers["content-type"]}}:{})
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
app.listen(port,"0.0.0.0",()=>{console.log("TrainSync v3 DEMO stage listening "+port);});
