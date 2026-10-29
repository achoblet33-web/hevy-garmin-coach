/**
 * KINTRA device-only persistence. Uses a non-extractable AES-GCM CryptoKey
 * persisted in IndexedDB; credentials and health snapshots are encrypted.
 * Requires opt-in on a personal/trusted browser. No passwords are sent to server.
 * Threat model: protects from plaintext localStorage/IDB inspection, NOT from
 * malicious same-origin JavaScript or someone using an unlocked device.
 */
const DB_NAME="kintra-device-session-v1",STORE="records";
const MAX_SNAPSHOT_BYTES=750_000,MAX_AGE_MS=14*24*60*60*1000;
const enc=new TextEncoder(),dec=new TextDecoder();
let dbPromise=null;
function db(){
 if(!globalThis.indexedDB||!globalThis.crypto?.subtle)throw Error("Stockage sécurisé indisponible sur ce navigateur.");
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error("Stockage local sécurisé inaccessible."));
  request.onblocked=()=>reject(Error("Stockage local occupé : ferme les autres fenêtres KINTRA."));
 }).catch(error=>{dbPromise=null;throw error});
 return dbPromise;
}
async function operation(mode,fn){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction(STORE,mode);
  const request=fn(tx.objectStore(STORE));
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error("Échec d'accès aux données locales."));
  tx.onerror=()=>reject(Error("Stockage local inaccessible."));
 });
}
const get=k=>operation("readonly",s=>s.get(k));
const put=(k,v)=>operation("readwrite",s=>s.put(v,k));
const del=k=>operation("readwrite",s=>s.delete(k));
async function getKey(create=false){
 let key=await get("deviceKey");
 if(!key&&create){
  key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  await put("deviceKey",key);
 }
 return key;
}
async function seal(value){
 const key=await getKey(true),iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=enc.encode(JSON.stringify(value));
 if(bytes.length>MAX_SNAPSHOT_BYTES)throw Error("Données locales trop volumineuses pour la sauvegarde.");
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,bytes);
 return {v:1,iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher)),savedAt:Date.now()};
}
async function unseal(value){
 if(!value)return null;
 if(value.v!==1||!Array.isArray(value.iv)||value.iv.length!==12||
  !Array.isArray(value.cipher)||value.cipher.length<17||value.cipher.length>MAX_SNAPSHOT_BYTES+32)
  throw Error("Sauvegarde locale chiffrée invalide.");
 const key=await getKey();
 if(!key)throw Error("Clé locale de déchiffrement indisponible.");
 try{
  const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(value.iv)},key,new Uint8Array(value.cipher));
  return JSON.parse(dec.decode(bytes));
 }catch{throw Error("Données locales illisibles sur cet appareil.");}
}
const names={intervals:"api:intervals",hevy:"api:hevy"};
export async function saveDeviceCredential(provider,secret){
 if(!names[provider]||typeof secret!=="string"||secret.length<12||secret.length>300)
  throw Error("Connexion à sauvegarder invalide.");
 await put(names[provider],await seal({secret}));
}
export async function readDeviceCredential(provider){
 if(!names[provider])throw Error("Source inconnue.");
 const result=await unseal(await get(names[provider]));
 return typeof result?.secret==="string"?result.secret:null;
}
export async function hasDeviceCredential(provider){
 if(!names[provider])return false;
 return !!await get(names[provider]);
}
export async function clearDeviceCredential(provider){
 if(!names[provider])throw Error("Source inconnue.");
 await del(names[provider]);
 if(provider==="intervals")await del("dashboard");
}
export async function saveDeviceDashboard(data){
 if(!data||!Array.isArray(data.activities)||!Array.isArray(data.wellness))return false;
 const safe={
  activities:data.activities.slice(0,160),wellness:data.wellness.slice(0,100),
  strength:(Array.isArray(data.strength)?data.strength:[]).slice(0,100),
  planned:(Array.isArray(data.planned)?data.planned:[]).slice(0,120),
  syncedAt:data.syncedAt||new Date().toISOString(),
 };
 await put("dashboard",await seal(safe));return true;
}
export async function readDeviceDashboard(){
 const record=await get("dashboard");
 if(!record||Date.now()-record.savedAt>MAX_AGE_MS||record.savedAt>Date.now()+300000)return null;
 const result=await unseal(record);
 return result&&Array.isArray(result.activities)&&Array.isArray(result.wellness)?result:null;
}
export async function clearDeviceDashboard(){await del("dashboard");}
