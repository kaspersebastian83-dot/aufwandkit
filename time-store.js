/* F4: full retained snapshots, not a distributed filesystem transaction.
   Inspired by PlanKit F2, shared-project F3 and SpesenKit. No automatic pruning. */
(function(root){
  'use strict';
  const ARCHIVE='_Aufwand_Sicherungen', enc=new TextEncoder();
  const error=(code,message)=>Object.assign(Error(message),{code});
  const conflict=()=>error('conflict','Die Zeitdatei wurde inzwischen geändert oder gelöscht. Nicht überschrieben. Eigene Eingaben bleiben geöffnet. Bitte „Zeitfassungen prüfen“ und bewusst entscheiden.');
  const clone=o=>JSON.parse(JSON.stringify(o));
  const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const canonical=o=>JSON.stringify(o,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  function entries(list){
    if(!Array.isArray(list))throw error('invalid','Ungültige Struktur der Einträge.');
    const ids=new Set();
    for(const e of list){
      if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.id!=='string'||!e.id.trim()||ids.has(e.id))throw error('invalid','Einträge sind nicht eindeutig anhand ihrer IDs zuzuordnen.');
      ids.add(e.id);
      if(!['ort','buero'].includes(e.art)||typeof e.datum!=='string'||(e.rolle!==undefined&&!['Sachverständiger','Probenehmer'].includes(e.rolle)))throw error('invalid','Ungültige Struktur der Einträge (Datum, Tätigkeit oder Rolle).');
      for(const k of ['stunden','km','spesen','hotelAnzahl','hotelBetrag'])if(e[k]!==undefined&&!(typeof e[k]==='string'||typeof e[k]==='number'&&Number.isFinite(e[k])))throw error('invalid','Ungültige Struktur der Einträge: '+k+'.');
      for(const k of ['notiz','route','routeStart','routeZiel'])if(e[k]!==undefined&&typeof e[k]!=='string')throw error('invalid','Ungültige Struktur der Einträge: '+k+'.');
      if(e.routeRund!==undefined&&typeof e.routeRund!=='boolean')throw error('invalid','Ungültige Struktur der Einträge: Route.');
    }
    return list;
  }
  function validate(o,identity){
    if(!o||typeof o!=='object'||Array.isArray(o))throw error('invalid','Ungültige Struktur der Zeitdatei.');
    if(o.format!=='aufwandkit-zeiten'||o.version!==1)throw error('incompatible','Unbekanntes oder neueres Format der Zeitdatei. Nicht überschrieben.');
    if(o.projekt!==identity.projekt||o.kuerzel!==identity.kuerzel)throw error('identity','Falsche Projektnummer oder falsches Mitarbeiterkürzel. Nicht überschrieben.');
    entries(o.eintraege);return o;
  }
  function parse(s,identity){
    if(!s.exists)return null;
    let o;try{o=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(s.bytes).replace(/^\uFEFF/,''));}
    catch(e){throw error('invalid','Zeitdatei ist nicht lesbar: '+e.message+'. Nicht überschrieben.');}
    return validate(o,identity);
  }
  async function raw(dir,name){
    if(!dir)return{exists:false,bytes:new Uint8Array(),revision:'missing'};
    let h;try{h=await dir.getFileHandle(name);}catch(e){if(e.name==='NotFoundError')return{exists:false,bytes:new Uint8Array(),revision:'missing'};throw error('read','„'+name+'“ ist nicht lesbar: '+e.message);}
    try{
      const f=await h.getFile(),bytes=new Uint8Array(await f.arrayBuffer());
      const revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      return{exists:true,bytes,revision,modified:f.lastModified};
    }catch(e){throw error('read','„'+name+'“ ist nicht lesbar: '+e.message);}
  }
  async function read(dir,name,identity){const s=await raw(dir,name);return{...s,data:parse(s,identity)};}
  async function put(h,bytes){
    let w;try{
      w=await h.createWritable();let value=bytes;
      try{const t=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);if(equal(enc.encode(t),bytes))value=t;}catch(_){}
      await w.write(value);await w.close();w=null;
    }finally{if(w)try{await w.abort();}catch(_){}}
  }
  async function retain(dir,name,kind,bytes){
    const archive=await dir.getDirectoryHandle(ARCHIVE,{create:true});
    const n=name.slice(0,-5)+'_'+kind+'_'+new Date().toISOString().replace(/[-:.]/g,'')+'_'+crypto.randomUUID()+'.json';
    try{await archive.getFileHandle(n);throw error('write','Sicherungsname bereits belegt. Bitte erneut versuchen.');}catch(e){if(e.name!=='NotFoundError')throw e;}
    await put(await archive.getFileHandle(n,{create:true}),bytes);
    if(!equal((await raw(archive,n)).bytes,bytes))throw error('verify','Sicherung konnte nicht bestätigt werden. Hauptdatei nicht ersetzt.');
    return n;
  }
  async function draft(dir,name,data,identity){validate(data,identity);return retain(dir,name,'kandidat',enc.encode(JSON.stringify(data,null,2)+'\n'));}
  function locked(identity,fn){return root.navigator?.locks?root.navigator.locks.request('belegkit:zeiten:'+identity.projekt+':'+identity.kuerzel,fn):fn();}
  async function save(dir,name,data,identity,expected,{restore=false,ownedEmpty=null}={}){
    // Freeze before awaiting: later edits must not change the confirmed candidate.
    const frozen=clone(data);validate(frozen,identity);const bytes=enc.encode(JSON.stringify(frozen,null,2)+'\n');
    if(name.toUpperCase()!==('Aufwand_'+identity.kuerzel+'.json').toUpperCase())throw error('identity','Dateiname passt nicht zum Mitarbeiterkürzel.');
    return locked(identity,async()=>{
      const base=await raw(dir,name);
      const ownPlaceholder=expected==='missing'&&ownedEmpty===base.revision&&base.exists&&!base.bytes.length;
      // Never replace malformed/foreign/newer files automatically, even with a matching hash.
      try{parse(base,identity);}catch(e){if(!ownPlaceholder&&(!restore||e.code!=='invalid'))throw e;}
      if(expected===null||(base.revision!==expected&&!ownPlaceholder))throw conflict();
      if(base.exists)await retain(dir,name,'vorher',base.bytes);
      const candidate=await retain(dir,name,'kandidat',bytes);
      if((await raw(dir,name)).revision!==base.revision)throw conflict();
      const h=await dir.getFileHandle(name,{create:true});let w;
      try{
        w=await h.createWritable();const last=await raw(dir,name);
        // A missing file can become the empty placeholder made by create:true.
        if(last.revision!==base.revision&&!(base.revision==='missing'&&last.exists&&!last.bytes.length))throw conflict();
        await w.write(new TextDecoder().decode(bytes));await w.close();w=null;
      }catch(e){
        // In this live session, retry the empty placeholder created by our own
        // failed initial write only. Never authorize this exception after reload.
        if(expected==='missing')try{const failed=await raw(dir,name);if(failed.exists&&!failed.bytes.length)e.ownedEmpty=failed.revision;}catch(_){}
        throw e;
      }finally{if(w)try{await w.abort();}catch(_){}}
      const after=await raw(dir,name);if(!after.exists||!equal(after.bytes,bytes))throw conflict();
      return{data:frozen,revision:after.revision,candidate};
    });
  }
  function merge(local,remote){
    entries(local);entries(remote);const map=new Map();
    for(const e of [...local,...remote]){
      if(map.has(e.id)&&canonical(map.get(e.id))!==canonical(e))throw error('conflict','Widersprüchliche Einträge mit derselben ID. Bitte den Konflikt klären; Datei und Eingaben bleiben erhalten.');
      if(!map.has(e.id))map.set(e.id,clone(e));
    }
    return[...map.values()];
  }
  function isCopy(n,name){return n.startsWith(name.slice(0,-5)+'_')&&/_(kandidat|vorher)_\d{8}T\d{9}Z_[0-9a-f-]{36}\.json$/.test(n);}
  async function versions(dir,name,identity){
    const current=await raw(dir,name),items=[],invalid=[],seen=new Set([current.revision]);let archive;
    try{archive=await dir?.getDirectoryHandle(ARCHIVE);}catch(e){if(e.name!=='NotFoundError')throw e;}
    if(archive)for await(const h of archive.values()){
      if(h.kind!=='file'||!isCopy(h.name,name))continue;
      try{const s=await read(archive,h.name,identity);if(!s.exists)throw error('read','Sicherung fehlt');if(!seen.has(s.revision)){seen.add(s.revision);items.push({name:h.name,revision:s.revision,data:s.data});}}
      catch(e){invalid.push(h.name+': '+e.message);}
    }
    items.sort((a,b)=>b.name.localeCompare(a.name));return{current,items,invalid};
  }
  async function selected(dir,name,choice,identity){
    if(!isCopy(choice.name,name))throw error('invalid','Ungültiger Sicherungsname.');
    const s=await read(await dir.getDirectoryHandle(ARCHIVE),choice.name,identity);
    if(s.revision!==choice.revision)throw error('conflict','Die ausgewählte Sicherung wurde geändert. Bitte erneut prüfen.');return s.data;
  }
  root.TimeStore=Object.freeze({read,raw,parse,validate,entries,save,draft,merge,versions,selected,ARCHIVE});
  if(typeof module!=='undefined')module.exports=root.TimeStore;
})(globalThis);
