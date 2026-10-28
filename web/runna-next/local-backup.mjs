/**
 * KINTRA portable, local-only backup.
 * Explicit allowlist: no health streams, GPS traces, API keys, vaults, tokens or weather location.
 * Export is plaintext; never auto-upload a backup to a server.
 */
export const BACKUP_SCHEMA="kintra-local-backup-v1";
export const MAX_BACKUP_BYTES=1_000_000;
const record=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const finite=x=>Number.isFinite(x);
const id=x=>typeof x==="string"&&x.length>0&&x.length<=180;
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T12:00:00Z"));
const forbidden=/^(?:__proto__|prototype|constructor)$|(?:token|api.?key|secret|password|passphrase|credential|authorization|vault|bearer|hevySessions|wellness|gps|coordinates)/i;
function sanitize(value,depth=0){
 if(depth>10)throw Error("Sauvegarde trop complexe.");
 if(value===null||typeof value==="boolean")return value;
 if(typeof value==="string"){if(value.length>8000)throw Error("Texte trop long dans la sauvegarde.");return value;}
 if(typeof value==="number"){if(!finite(value))throw Error("Nombre non valide.");return value;}
 if(Array.isArray(value)){
  if(value.length>2500)throw Error("Trop de données dans la sauvegarde.");
  return value.map(v=>sanitize(v,depth+1));
 }
 if(record(value)){
  const keys=Object.keys(value);
  if(keys.length>140)throw Error("Objet de sauvegarde trop volumineux.");
  const result={};
  for(const key of keys){
   if(forbidden.test(key))continue;
   if(key.length>100)throw Error("Champ de sauvegarde non valide.");
   const x=value[key];
   if(x===undefined||typeof x==="function")continue;
   Object.defineProperty(result,key,{value:sanitize(x,depth+1),enumerable:true,writable:true,configurable:true});
  }
  return result;
 }
 throw Error("Format de sauvegarde non reconnu.");
}
function validatePlan(raw){
 if(raw===null)return null;
 if(!record(raw)||!Array.isArray(raw.sessions)||!record(raw.profile)||!Array.isArray(raw.summary))
  throw Error("Le programme sauvegardé n'est pas conforme.");
 if(raw.sessions.length>1500||raw.summary.length>100)throw Error("Programme trop volumineux.");
 const seen=new Set();
 for(const workout of raw.sessions){
  if(!record(workout)||!id(workout.id)||!date(workout.date)||typeof workout.kind!=="string"||workout.kind.length>40||seen.has(workout.id))
   throw Error("Séance invalide ou identifiant dupliqué.");
  seen.add(workout.id);
  if(workout.distanceKm!==undefined&&workout.distanceKm!==null&&(!finite(workout.distanceKm)||workout.distanceKm<0||workout.distanceKm>300))
   throw Error("Distance de séance incohérente.");
 }
 if(!Number.isInteger(raw.totalWeeks)||raw.totalWeeks<1||raw.totalWeeks>100)throw Error("Durée de programme invalide.");
 return sanitize(raw);
}
function validateFeedback(raw){
 if(!record(raw))throw Error("Ressentis enregistrés non valides.");
 const result={};const keys=Object.keys(raw);
 if(keys.length>1500)throw Error("Trop de ressentis.");
 for(const key of keys){
  if(forbidden.test(key)||!id(key))continue;
  const row=raw[key];
  if(!record(row))throw Error("Ressenti non conforme.");
  if(row.rpe!==undefined&&row.rpe!==null&&(!Number.isInteger(row.rpe)||row.rpe<1||row.rpe>10))
   throw Error("RPE non conforme.");
  const comment=row.comment??"";
  if(typeof comment!=="string"||comment.length>220)throw Error("Commentaire trop long.");
  result[key]={...(row.rpe==null?{}:{rpe:row.rpe}),comment,
   ...(typeof row.at==="string"&&row.at.length<=60?{at:row.at}:{})};
 }
 return result;
}
function portable(data,createdAt){
 return {schema:BACKUP_SCHEMA,createdAt,
  payload:{plan:validatePlan(data.plan??null),
   history:(Array.isArray(data.history)?data.history:[]).slice(-5).map(validatePlan),
   feedback:validateFeedback(data.feedback||{}),
   adaptiveSuggestions:data.adaptiveSuggestions!==false}};
}
export function createPortableBackup(localData,createdAt=new Date().toISOString()){
 if(!record(localData)||!Number.isFinite(Date.parse(createdAt)))throw Error("Impossible de sauvegarder ces données.");
 const result=portable(localData,createdAt);
 const json=JSON.stringify(result,null,2);
 if(new TextEncoder().encode(json).length>MAX_BACKUP_BYTES)throw Error("Sauvegarde trop volumineuse.");
 return json;
}
export function parsePortableBackup(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)
  throw Error("Le fichier dépasse la taille maximale de sauvegarde.");
 let parsed;try{parsed=JSON.parse(text)}catch{throw Error("Ce fichier n'est pas un JSON de sauvegarde KINTRA.");}
 if(!record(parsed)||parsed.schema!==BACKUP_SCHEMA||!record(parsed.payload)||!Number.isFinite(Date.parse(parsed.createdAt)))
  throw Error("Format ou version de sauvegarde non pris en charge.");
 const data=portable(parsed.payload,parsed.createdAt);
 return {createdAt:data.createdAt,plan:data.payload.plan,history:data.payload.history,
  feedback:data.payload.feedback,adaptiveSuggestions:data.payload.adaptiveSuggestions,
  count:{sessions:data.payload.plan?.sessions?.length||0,versions:data.payload.history.length,
   feedback:Object.keys(data.payload.feedback).length}};
}
