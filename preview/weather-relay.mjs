// Open-Meteo, read-only. User explicitly selects a city or grants location permission.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const n=v=>v===null||v===undefined||v===""?NaN:Number(v);
const jsonGet=async url=>{
 const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(11000)});
 if(!r.ok)throw Error("Service météo indisponible.");
 return r.json();
};
export async function handleWeather(request){
 const u=new URL(request.url);
 if(request.method!=="GET")return json({error:"Méthode non autorisée."},405);
 if(u.pathname==="/v3/places"){
  const name=(u.searchParams.get("name")||"").trim();
  if(name.length<2||name.length>80)return json({error:"Saisis au moins deux caractères pour rechercher une ville."},400);
  try{
   const url=new URL("https://geocoding-api.open-meteo.com/v1/search");
   url.searchParams.set("name",name);url.searchParams.set("count","6");url.searchParams.set("language","fr");
   const found=await jsonGet(url);
   return json({ok:true,results:(Array.isArray(found.results)?found.results:[]).slice(0,6).map(x=>({
    id:Number(x.id)||null,label:[x.name,x.admin1,x.country].filter(Boolean).join(", "),
    latitude:Math.round(Number(x.latitude)*100)/100,
    longitude:Math.round(Number(x.longitude)*100)/100
   })).filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude))});
  }catch{return json({error:"Recherche de lieu indisponible."},503);}
 }
 if(u.pathname!=="/v3/weather")return json({error:"Route inconnue."},404);
 const lat=n(u.searchParams.get("lat")),lon=n(u.searchParams.get("lon"));
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
   return json({error:"Coordonnées invalides."},400);
 try{
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  for(const [k,v] of [["latitude",Math.round(lat*100)/100],["longitude",Math.round(lon*100)/100],
   ["current","temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"],
   ["hourly","temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code,uv_index"],
   ["timezone","auto"],["timeformat","unixtime"],["forecast_days","2"]])url.searchParams.set(k,String(v));
  const raw=await jsonGet(url);
  const current=raw.current||{};
  return json({ok:true,source:"Open-Meteo",timezone:String(raw.timezone||"UTC"),
   asOf:Date.now(),temperature:current.temperature_2m??null,apparent:current.apparent_temperature??null,
   humidity:current.relative_humidity_2m??null,wind:current.wind_speed_10m??null,
   weatherCode:current.weather_code??null,hourly:raw.hourly||{}});
 }catch{return json({error:"Prévisions météo momentanément indisponibles."},503);}
}
