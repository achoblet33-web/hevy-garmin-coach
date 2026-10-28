// KINTRA tiny GPS map: renders recorded route; OSM tiles load only after user asks.
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const valid=x=>Array.isArray(x)&&x.length===2&&num(x[0])!==null&&num(x[1])!==null&&Math.abs(num(x[0]))<=90&&Math.abs(num(x[1]))<=180;
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const merc=(lat,lon,z)=>{const scale=256*2**z,phi=Math.min(85,Math.max(-85,lat))*Math.PI/180;
 return [((lon+180)/360)*scale,(1-Math.log(Math.tan(phi)+1/Math.cos(phi))/Math.PI)/2*scale]};
export function mapGeometry(points=[],width=360,height=236){
 const list=points.filter(valid).map(x=>[Number(x[0]),Number(x[1])]);
 if(list.length<2)return null;
 for(let z=15;z>=2;z--){
  const projected=list.map(([lat,lon])=>merc(lat,lon,z));
  const xs=projected.map(x=>x[0]),ys=projected.map(x=>x[1]);
  const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  if(z!==2&&((bounds[2]-bounds[0])>width*.76||(bounds[3]-bounds[1])>height*.68))continue;
  const cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2;
  const svg=projected.map(([x,y])=>[(x-cx+width/2),(y-cy+height/2)]);
  const start=svg[0],end=svg.at(-1);
  const path=svg.map(([x,y],i)=>(i?"L":"M")+x.toFixed(1)+","+y.toFixed(1)).join(" ");
  const tiles=[],minX=Math.floor((cx-width/2)/256),maxX=Math.floor((cx+width/2)/256);
  const minY=Math.floor((cy-height/2)/256),maxY=Math.floor((cy+height/2)/256);
  const max=2**z;
  for(let y=Math.max(0,minY);y<=Math.min(max-1,maxY);y++)for(let x=minX;x<=maxX;x++){
   const tileX=((x%max)+max)%max;
   tiles.push({x:tileX,y,z,left:(x*256-cx+width/2),top:(y*256-cy+height/2)});
  }
  return {path,start,end,tiles,width,height,zoom:z,center:[(list[0][0]+list.at(-1)[0])/2,(list[0][1]+list.at(-1)[1])/2]};
 }
 return null;
}
export function renderRouteMap(points,enabled=false){
 const data=mapGeometry(points);
 if(!data)return `<div class="card kintra-map-empty" data-testid="route-map-empty">
 <strong>Aucune trace GPS disponible</strong><p class="sub">Selon la source de l'activité ou ses autorisations, Intervals.icu peut ne pas fournir les coordonnées GPS.</p></div>`;
 const tileNodes=data.tiles.map(t=>`<img alt="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
  src="https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png"
  style="left:${t.left/3.6}%;top:${t.top/2.36}%;width:71.111%;height:108.475%" />`).join("");
 return `<section class="kintra-map-card" data-testid="route-map">
 <div class="between"><div><span class="eyebrow">TRACÉ DE TA COURSE</span><h3 class="heading">Parcours GPS</h3></div>
 <span class="pill muted">${points.length} points tracés</span></div>
 <div class="kintra-map-scene" role="img" aria-label="Tracé GPS de ta course, début en vert et fin en bordeaux">
  ${enabled?`<div class="kintra-map-tiles">${tileNodes}</div>`:""}
  <svg viewBox="0 0 360 236" preserveAspectRatio="none" aria-hidden="true">
  <path d="${data.path}" class="kintra-gps-shadow" />
  <path d="${data.path}" class="kintra-gps-route" />
  <circle cx="${data.start[0]}" cy="${data.start[1]}" r="7" fill="#1c9b69" stroke="#fff" stroke-width="3"/>
  <circle cx="${data.end[0]}" cy="${data.end[1]}" r="7" fill="#9b0f36" stroke="#fff" stroke-width="3"/></svg>
  ${enabled?`<span class="kintra-map-attribution">© OpenStreetMap contributors</span>`:""}
 </div>
 <div class="kintra-map-actions">
 <p class="sub">${enabled?"Fond de carte OSM · parcours réellement enregistré.":"Le tracé GPS est local. Le fond cartographique OSM n’est chargé qu’avec ton accord."}</p>
 <button class="btn secondary" data-action="mapTiles">${enabled?"Masquer le fond de carte":"Afficher le fond de carte"}</button></div>
 </section>`;
}