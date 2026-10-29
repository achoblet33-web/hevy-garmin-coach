// Browser-only: encrypt the athlete's API key with a user-held passphrase.
// PBKDF2/AES-GCM, random salt & IV. No passphrase or cleartext key is saved.
const enc=new TextEncoder();
const dec=new TextDecoder();
const base64=u=>btoa(String.fromCharCode(...u));
const bytes=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function derive(password,salt){
 const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:240000,hash:"SHA-256"},key,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function encryptApiKey(secret,password){
 if(typeof secret!=="string"||secret.length<12)throw Error("Clé API invalide.");
 if(typeof password!=="string"||password.length<10)throw Error("La phrase de déverrouillage doit contenir au moins 10 caractères.");
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt);
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(secret));
 return JSON.stringify({v:1,kdf:"PBKDF2-SHA256",iterations:240000,salt:base64(salt),iv:base64(iv),cipher:base64(new Uint8Array(cipher))});
}
export async function decryptApiKey(packed,password){
 let item;try{item=JSON.parse(packed);}catch{throw Error("Sauvegarde de clé invalide.");}
 if(item?.v!==1||item?.iterations!==240000||typeof item.salt!=="string"||typeof item.iv!=="string"||typeof item.cipher!=="string")
   throw Error("Format de sauvegarde de clé non reconnu.");
 if(item.cipher.length>1000)throw Error("Sauvegarde de clé invalide.");
 try{
  const salt=bytes(item.salt),iv=bytes(item.iv);
  if(salt.length!==16||iv.length!==12)throw Error("Format invalide.");
  const key=await derive(password,salt);
  const output=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,bytes(item.cipher));
  const secret=dec.decode(output);
  if(secret.length<12||secret.length>300)throw Error("Format invalide.");
  return secret;
 }catch{throw Error("Mot de passe incorrect ou clé sauvegardée illisible.");}
}
