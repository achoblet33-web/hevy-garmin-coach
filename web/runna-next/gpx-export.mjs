// Offline, user-initiated export of the recorded (possibly sampled) GPS points.
// Does not contact a map server or upload personal location data.
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
export function routeToGpx(points=[],title="Sortie KINTRA"){
 if(!Array.isArray(points)||points.length<2||points.length>5000)throw Error("Trace GPS absente ou trop longue.");
 const coordinates=points.map(x=>{
  if(!Array.isArray(x)||x.length<2||x[0]===null||x[1]===null||
     !Number.isFinite(Number(x[0]))||!Number.isFinite(Number(x[1]))||
     Math.abs(Number(x[0]))>90||Math.abs(Number(x[1]))>180)
    throw Error("Coordonnées GPS invalides.");
  return [Number(x[0]),Number(x[1])];
 });
 const tracks=coordinates.map(([lat,lon])=>'<trkpt lat="'+lat.toFixed(7)+'" lon="'+lon.toFixed(7)+'"></trkpt>').join("\n");
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<gpx version="1.1" creator="KINTRA" xmlns="http://www.topografix.com/GPX/1/1">'+
  '<metadata><name>'+escape(title.slice(0,140))+'</name></metadata>'+
  '<trk><name>'+escape(title.slice(0,140))+'</name><trkseg>'+tracks+'</trkseg></trk></gpx>';
}
