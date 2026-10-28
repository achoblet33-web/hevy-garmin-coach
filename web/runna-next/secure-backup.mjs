/**
 * KINTRA portable encrypted backup.
 * PBKDF2(SHA-256) -> AES-256-GCM. Encryption and decryption are local in WebCrypto.
 * Never send password, backup plaintext or cipher to an endpoint.
 */
import {createPortableBackup,parsePortableBackup,MAX_BACKUP_BYTES} from "./local-backup.mjs";
export const SECURE_SCHEMA="kintra-encrypted-backup-v1";
export const MAX_ENCRYPTED_BYTES=1_650_000;
const ITERATIONS=360000;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const b64=bytes=>{
 let result="";for(let i=0;i<bytes.length;i+=8192)
  result+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(result);
};
function unb64(text){
 if(typeof text!=="string"||text.length>MAX_ENCRYPTED_BYTES||!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||text.length%4)
  throw Error("Sauvegarde chiffrée invalide.");
 try{return Uint8Array.from(atob(text),c=>c.charCodeAt(0))}
 catch{throw Error("Sauvegarde chiffrée invalide.")}
}
function checkPassword(password){
 if(typeof password!=="string"||password.length<12||password.length>256)
  throw Error("Utilise une phrase secrète d'au moins 12 caractères (maximum 256).");
}
async function derive(password,salt){
 const master=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},
  master,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function encryptPortableBackup(localData,password,createdAt=new Date().toISOString()){
 checkPassword(password);
 const plain=encoder.encode(createPortableBackup(localData,createdAt));
 if(plain.length>MAX_BACKUP_BYTES)throw Error("Sauvegarde trop volumineuse.");
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(password,salt);
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(SECURE_SCHEMA)},key,plain);
 return JSON.stringify({schema:SECURE_SCHEMA,kdf:"PBKDF2-SHA256",iterations:ITERATIONS,algorithm:"AES-256-GCM",
  salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))});
}
export function isEncryptedBackup(text){
 if(typeof text!=="string"||encoder.encode(text).length>MAX_ENCRYPTED_BYTES)return false;
 try{return JSON.parse(text)?.schema===SECURE_SCHEMA}catch{return false}
}
export async function decryptPortableBackup(text,password){
 checkPassword(password);
 if(typeof text!=="string"||encoder.encode(text).length>MAX_ENCRYPTED_BYTES)
  throw Error("Fichier de sauvegarde trop volumineux.");
 let item;try{item=JSON.parse(text)}catch{throw Error("Fichier chiffré invalide.")}
 if(!item||item.schema!==SECURE_SCHEMA||item.kdf!=="PBKDF2-SHA256"||
  item.iterations!==ITERATIONS||item.algorithm!=="AES-256-GCM")
  throw Error("Version ou paramètres de chiffrement non reconnus.");
 const salt=unb64(item.salt),iv=unb64(item.iv),cipher=unb64(item.ciphertext);
 if(salt.length!==16||iv.length!==12||cipher.length<17||cipher.length>MAX_BACKUP_BYTES+32)
  throw Error("Fichier de sauvegarde chiffré invalide.");
 try{
  const key=await derive(password,salt);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:encoder.encode(SECURE_SCHEMA)},key,cipher);
  return parsePortableBackup(decoder.decode(plain));
 }catch(error){
  // Do not leak whether the password or ciphertext was incorrect.
  throw Error("Phrase secrète incorrecte ou sauvegarde chiffrée endommagée.");
 }
}
