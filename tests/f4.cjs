// F4: real app load/save functions in independent V8 sessions, shared temporary disk.
// File System Access semantics/faults are synthetic, not Windows/SMB proof.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),PROJECT='26.0101 Fiktives Projekt',identity={projekt:'26.0101',kuerzel:'SK'},FILE='Aufwand_SK.json';
const entry=(id,h='1')=>({id,datum:'2026-10-21',art:'ort',rolle:'Sachverständiger',stunden:h,km:'4',spesen:'1',hotelAnzahl:'',hotelBetrag:'',notiz:'synthetisch'});
const initial={format:'aufwandkit-zeiten',version:1,projekt:identity.projekt,kuerzel:'SK',eintraege:[entry('alt-1'),entry('alt-2')],unbekannt:{tief:[1,'bleibt']}};
const clone=o=>JSON.parse(JSON.stringify(o));
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
const missing=()=>Object.assign(Error('missing'),{name:'NotFoundError'});
class Dir{
 constructor(dir,io={}){this.dir=dir;this.io=io;this.name=path.basename(dir);this.kind='directory';}
 async getDirectoryHandle(n,o={}){const p=path.join(this.dir,n);if(o.create)await fs.mkdir(p,{recursive:true});try{if(!(await fs.stat(p)).isDirectory())throw Error('not directory');}catch(e){if(e.code==='ENOENT')throw missing();throw e;}return new Dir(p,this.io);}
 async getFileHandle(n,o={}){const p=path.join(this.dir,n),io=this.io;if(o.create&&io.create)await io.create(n);if(o.create)await fs.appendFile(p,'');try{await fs.access(p);}catch(e){if(e.code==='ENOENT')throw missing();throw e;}
  return{name:n,kind:'file',getFile:async()=>{if(io.read)await io.read(n,p);const b=await fs.readFile(p);return{lastModified:1,size:b.length,arrayBuffer:async()=>Uint8Array.from(b).buffer,text:async()=>b.toString()};},createWritable:async()=>{if(io.open)await io.open(n,p);let bytes;return{write:async v=>{if(io.write)await io.write(n,p);bytes=v;},close:async()=>{if(io.close)await io.close(n,p);await fs.writeFile(p,bytes);if(io.after)await io.after(n,p);},abort:async()=>{io.aborted=(io.aborted||0)+1;}};}};
 }
 async *values(){for(const e of await fs.readdir(this.dir,{withFileTypes:true}))yield e.isDirectory()?new Dir(path.join(this.dir,e.name),this.io):await this.getFileHandle(e.name);}
}
async function session(dir,io={}){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8'),c=vm.createContext({crypto:webcrypto,Uint8Array,TextEncoder,TextDecoder,console,navigator:{},setTimeout,clearTimeout});
 vm.runInContext(await fs.readFile(path.join(root,'time-store.js'),'utf8'),c);
 vm.runInContext(html.slice(html.indexOf('/* AUFWAND-LOGIK-START */'),html.indexOf('/* AUFWAND-LOGIK-ENDE */'))+'\nglobalThis.AW=AW;',c);
 c.APP_NAME='BelegKit';c.APP_VERSION='test';c.A={archiv:new Dir(path.dirname(dir),io),proj:{name:PROJECT,nr:'26.0101',dir:new Dir(dir,io)},kz:'SK',alle:[],meine:[],schreib:Promise.resolve(),laden:0,tab:'zeiten'};
 c.ORDNER={abr:'Abrechnung',lab:'Laboraufträge',fotos:'Fotos',mitteil:'Mitteilungen'};c.EINST_DATEI='_AufwandKit-Einstellungen.json';c.PROJ_DATEI='_Abrechnung.json';c.norm=s=>s.toLowerCase();c.esc=s=>s;
 const element={innerHTML:'',textContent:''};c.$=id=>id==='zFassungen'?null:element;c.zeichne=()=>{};c.zeichneZeiten=()=>{};c.zeichneKollegen=()=>{};c.meldung=()=>{};c.versteckeMeldung=()=>{};c.status=(text,kind)=>{c.lastStatus={text,kind};};
 vm.runInContext(html.slice(html.indexOf('async function unter('),html.indexOf('/** Einen Eintrag einer ZIP-Datei')),c);
 vm.runInContext(html.slice(html.indexOf('async function ladeAlles(){'),html.indexOf('/* ---------- Speichern ---------- */')),c);
 vm.runInContext(html.slice(html.indexOf('function uebernehmeMeineDatei(){'),html.indexOf('/** Projektdatei:')),c);
 c.edit=(fn)=>{fn(c.A.meine);vm.runInContext('meineAenderung++;',c);};
 c.saved=()=>vm.runInContext('meineAenderung===meineGespeichert',c);
 await c.ladeAlles();return c;
}
let count=0;
async function fixture(fn){const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'belegkit-f4-'));try{const p=path.join(tmp,PROJECT),abr=path.join(p,'Abrechnung');await fs.mkdir(abr,{recursive:true});await fs.writeFile(path.join(abr,FILE),JSON.stringify(initial));await fn(p,abr);count++;}finally{await fs.rm(tmp,{recursive:true,force:true});}}
async function tree(dir){const o={};for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);o[e.name]=e.isDirectory()?await tree(p):(await fs.readFile(p)).toString('base64');}return o;}
(async()=>{
 await fixture(async(p,abr)=>{
  const A=await session(p),B=await session(p);B.edit(e=>e.push(entry('sieben','7')));await B.speichereMeine();const before=await tree(abr);
  A.edit(e=>e[0].stunden='2');await assert.rejects(()=>A.speichereMeine(),/inzwischen geändert/);
  assert.equal(JSON.parse(await fs.readFile(path.join(abr,FILE))).eintraege.find(e=>e.id==='sieben').stunden,'7');assert.equal(A.A.meine[0].stunden,'2');assert.equal(A.saved(),false);assert.deepEqual(await tree(abr),before);
  console.log('OK A: stale session blocked, 7 hours and own inputs retained');
 });
 for(const first of [false,true])await fixture(async(p,abr)=>{
  if(first)await fs.unlink(path.join(abr,FILE));const a=defer(),b=defer(),ga=defer(),gb=defer(),created=defer();let creates=0;const create=async n=>{if(first&&n===FILE){if(++creates===2)created.resolve();await created.promise;}};
  const A=await session(p,{create,write:async n=>{if(n===FILE){a.resolve();await ga.promise;}}}),B=await session(p,{create,write:async n=>{if(n===FILE){b.resolve();await gb.promise;}}});
  A.edit(e=>first?e.push(entry('A','3')):e[0].stunden='3');B.edit(e=>first?e.push(entry('B','4')):e[1].stunden='4');
  const pa=A.speichereMeine(),pb=B.speichereMeine();await Promise.all([a.promise,b.promise]);ga.resolve();await pa;assert.equal(A.saved(),true);gb.resolve();await pb;assert.equal(B.saved(),true);
  const C=await session(p),v=await C.TimeStore.versions(new Dir(abr),FILE,identity);assert.ok(v.items.some(x=>x.data.eintraege.some(e=>first?e.id==='A':e.id==='alt-1'&&e.stunden==='3')));
  const choice=v.items.find(x=>x.data.eintraege.some(e=>first?e.id==='A':e.id==='alt-1'&&e.stunden==='3'));const data=await C.TimeStore.selected(new Dir(abr),FILE,choice,identity);
  await C.TimeStore.save(new Dir(abr),FILE,data,identity,v.current.revision,{restore:true});
  const later=await C.TimeStore.versions(new Dir(abr),FILE,identity);assert.ok(later.items.some(x=>x.data.eintraege.some(e=>first?e.id==='B':e.id==='alt-2'&&e.stunden==='4')));
  console.log('OK B:',first?'two initial creates':'two existing sessions','pass LAST comparison, A confirms before B; both complete candidates survive restart/restore');
 });
 await fixture(async(p,abr)=>{
  const A=await session(p);A.edit(e=>e[0].stunden='2');await fs.writeFile(path.join(abr,FILE),'{broken');const before=await tree(abr);
  await assert.rejects(()=>A.speichereMeine(),/nicht lesbar/);assert.deepEqual(await tree(abr),before);assert.equal(A.A.meine[0].stunden,'2');assert.equal(A.saved(),false);console.log('OK C: corrupt source never overwritten, inputs retained');
 });
 const invalid=[{...initial,projekt:'26.0999'},{...initial,kuerzel:'AB'},{...initial,version:2},{...initial,format:'foreign'},{...initial,eintraege:{}},{...initial,eintraege:[entry('x'),entry('x')]},{...initial,eintraege:[{...entry('x'),id:''}]},{...initial,eintraege:[{...entry('x'),stunden:{x:1}}]},{...initial,eintraege:[{...entry('x'),art:'unknown'}]},null,[],''];
 for(const obj of invalid)await fixture(async(p,abr)=>{
  await fs.writeFile(path.join(abr,FILE),obj===''?'':JSON.stringify(obj));const before=await tree(abr),A=await session(p);assert.equal(A.A.meineDefekt,true);assert.equal(A.A.meine.length,0);A.edit(e=>e.push(entry('own')));await assert.rejects(()=>A.speichereMeine());assert.deepEqual(await tree(abr),before);assert.equal(A.A.meine.length,1);
 });
 await fixture(async(p,abr)=>{const A=await session(p);A.edit(e=>e[0].km='42');await fs.unlink(path.join(abr,FILE));await assert.rejects(()=>A.speichereMeine(),/gelöscht/);assert.equal(await fs.stat(path.join(abr,FILE)).catch(()=>null),null);});
 await fixture(async(p,abr)=>{
  const A=await session(p);A.edit(e=>{e[0].km='42';e[0].spesen='2';});await A.speichereMeine();const data=JSON.parse(await fs.readFile(path.join(abr,FILE)));assert.deepEqual(data.unbekannt,initial.unbekannt);assert.equal(data.eintraege[0].km,'42');assert.equal(A.saved(),true);
 });
 await fixture(async(p,abr)=>{
  const legacy={...initial,geaendertMit:'AufwandKit 1.0.0'};legacy.eintraege=[entry('legacy')];delete legacy.eintraege[0].hotelAnzahl;delete legacy.eintraege[0].hotelBetrag;
  await fs.writeFile(path.join(abr,FILE),'\uFEFF'+JSON.stringify(legacy));const A=await session(p);assert.equal(A.A.meineDefekt,false);A.edit(e=>e[0].stunden='5');await A.speichereMeine();assert.equal(JSON.parse(await fs.readFile(path.join(abr,FILE))).eintraege[0].stunden,'5');
 });
 await fixture(async(p,abr)=>{
  const A=await session(p),B=await session(p);B.A.kz='AB';B.uebernehmeMeineDatei();A.edit(e=>e[0].stunden='2');B.edit(e=>e.push(entry('ab','6')));await Promise.all([A.speichereMeine(),B.speichereMeine()]);assert.equal(JSON.parse(await fs.readFile(path.join(abr,'Aufwand_AB.json'))).kuerzel,'AB');assert.equal(JSON.parse(await fs.readFile(path.join(abr,FILE))).eintraege[0].stunden,'2');
 });
 await fixture(async(p,abr)=>{
  const io={read:async n=>{if(n===FILE)throw Error('SYNTHETIC permission');}},A=await session(p,io);assert.equal(A.A.meineDefekt,true);A.edit(e=>e.push(entry('own')));await assert.rejects(()=>A.speichereMeine(),/nicht lesbar/);delete io.read;await A.speichereMeine();assert.equal(A.A.meine.length,3);assert.equal(A.A.meineDefekt,false);assert.equal(A.saved(),true);
 });
 for(const fail of ['_vorher_','_kandidat_',FILE])await fixture(async(p,abr)=>{
  const io={close:async n=>{if(n.includes(fail))throw Error('SYNTHETIC interrupted close');}},A=await session(p,io),before=await fs.readFile(path.join(abr,FILE));A.edit(e=>e[0].stunden='9');await assert.rejects(()=>A.speichereMeine(),/interrupted/);assert.deepEqual(await fs.readFile(path.join(abr,FILE)),before);assert.equal(A.saved(),false);delete io.close;await A.speichereMeine();assert.equal(A.saved(),true);assert.ok(io.aborted);
 });
 await fixture(async(p,abr)=>{
  const A=await session(p,{after:async(n,f)=>{if(n.includes('_kandidat_'))await fs.writeFile(f,'{}');}}),before=await fs.readFile(path.join(abr,FILE));A.edit(e=>e[0].stunden='8');await assert.rejects(()=>A.speichereMeine(),/Sicherung/);assert.deepEqual(await fs.readFile(path.join(abr,FILE)),before);
 });
 for(const phase of ['open','write','close'])await fixture(async(p,abr)=>{
  await fs.unlink(path.join(abr,FILE));const io={[phase]:async n=>{if(n===FILE)throw Error('SYNTHETIC first-write interruption');}},A=await session(p,io);A.edit(e=>e.push(entry('first')));await assert.rejects(()=>A.speichereMeine(),/interruption/);
  const reopened=await session(p);assert.equal(reopened.A.meineDefekt,true,'empty placeholder not silently accepted after restart');assert.ok((await reopened.TimeStore.versions(new Dir(abr),FILE,identity)).items.some(x=>x.data.eintraege[0].id==='first'));
  delete io[phase];await A.speichereMeine();assert.equal(A.saved(),true,'known own empty first-write placeholder is retryable');
 });
 await fixture(async(p,abr)=>{
  const A=await session(p,{after:async(n,f)=>{if(n===FILE)await fs.writeFile(f,JSON.stringify({...initial,geaendert:'external'}));}});A.edit(e=>e[0].stunden='8');await assert.rejects(()=>A.speichereMeine(),/inzwischen geändert/);assert.equal(A.saved(),false);const v=await A.TimeStore.versions(new Dir(abr),FILE,identity);assert.ok(v.items.some(x=>x.data.eintraege[0].stunden==='8'));
 });
 await fixture(async(p,abr)=>{
  const a=defer(),go=defer(),A=await session(p,{write:async n=>{if(n===FILE){a.resolve();await go.promise;}}});A.edit(e=>e[0].stunden='2');const saving=A.speichereMeine();await a.promise;A.edit(e=>e[0].stunden='3');go.resolve();await saving;assert.equal(A.A.meine[0].stunden,'3');assert.equal(A.saved(),false);assert.equal(JSON.parse(await fs.readFile(path.join(abr,FILE))).eintraege[0].stunden,'2');
 });
 await fixture(async(p,abr)=>{
  const A=await session(p);for(let i=0;i<42;i++){A.edit(e=>e[0].notiz='Version '+i);await A.speichereMeine();}const v=await A.TimeStore.versions(new Dir(abr),FILE,identity);assert.equal(v.items.length,42);const choice=v.items[0];await fs.writeFile(path.join(abr,A.TimeStore.ARCHIVE,choice.name),JSON.stringify({...initial,geaendert:'tampered'}));await assert.rejects(()=>A.TimeStore.selected(new Dir(abr),FILE,choice,identity),/geändert/);
 });
 assert.deepEqual(initial.eintraege.map(e=>e.stunden),['1','1']);console.log('OK',count,'F4 deterministic synthetic cases; A/B/C/D covered');
})().catch(e=>{console.error(e);process.exitCode=1;});
