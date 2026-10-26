// Überlappendes Einlesen: doppelt „Neu einlesen“ oder Projektwechsel während eines langsamen Ladens.
// Echte ladeAlles() in einer V8-Sitzung, synthetischer Projektordner auf der Platte, Verzögerung beim Lesen künstlich.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const missing=()=>Object.assign(Error('missing'),{name:'NotFoundError'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Dir{
 constructor(dir,io={}){this.dir=dir;this.io=io;this.name=path.basename(dir);this.kind='directory';}
 async getDirectoryHandle(n,o={}){const p=path.join(this.dir,n);if(o.create)await fs.mkdir(p,{recursive:true});try{if(!(await fs.stat(p)).isDirectory())throw Error('not directory');}catch(e){if(e.code==='ENOENT')throw missing();throw e;}return new Dir(p,this.io);}
 async getFileHandle(n,o={}){const p=path.join(this.dir,n),io=this.io;if(o.create)await fs.appendFile(p,'');try{await fs.access(p);}catch(e){if(e.code==='ENOENT')throw missing();throw e;}
  return{name:n,kind:'file',getFile:async()=>{if(io.read)await io.read(n,p);const b=await fs.readFile(p);return{name:n,lastModified:1,size:b.length,arrayBuffer:async()=>Uint8Array.from(b).buffer,text:async()=>b.toString()};}};}
 async *values(){for(const e of await fs.readdir(this.dir,{withFileTypes:true}))yield e.isDirectory()?new Dir(path.join(this.dir,e.name),this.io):await this.getFileHandle(e.name);}
}
const pdf=n=>`%PDF-1.7\n1 0 obj<</Type /Pages /Count ${n}>>endobj\ntrailer<</Root 2 0 R>>\n2 0 obj<</Type /Catalog /Pages 1 0 R>>endobj`;
async function projekt(archiv,name,nr,stunden,berichte){
 const P=path.join(archiv,name);
 await fs.mkdir(path.join(P,'Abrechnung'),{recursive:true});await fs.mkdir(path.join(P,'Mitteilungen'));
 await fs.writeFile(path.join(P,'Abrechnung','Aufwand_SK.json'),JSON.stringify({format:'aufwandkit-zeiten',version:1,projekt:nr,kuerzel:'SK',eintraege:[{id:'a',datum:'2026-10-01',art:'ort',rolle:'Sachverständiger',stunden}]}));
 const ab={};for(let i=1;i<=berichte;i++){await fs.writeFile(path.join(P,'Mitteilungen',`${i}__Bericht.pdf`),pdf(10));ab[`${i}__Bericht`]={abrechnen:true,seiten:'10'};}
 await fs.writeFile(path.join(P,'Abrechnung','_Abrechnung.json'),JSON.stringify({berichte:ab}));
 return P;
}
async function sitzung(archiv,P,nr,io){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8'),c=vm.createContext({crypto:webcrypto,Uint8Array,TextEncoder,TextDecoder,console,navigator:{},setTimeout,clearTimeout,window:{}});
 vm.runInContext(await fs.readFile(path.join(root,'time-store.js'),'utf8'),c);
 vm.runInContext(html.slice(html.indexOf('/* AUFWAND-LOGIK-START */'),html.indexOf('/* AUFWAND-LOGIK-ENDE */'))+'\nglobalThis.AW=AW;',c);
 c.APP_NAME='BelegKit';c.APP_VERSION='test';c.A={archiv:new Dir(archiv,io),proj:{name:path.basename(P),nr,dir:new Dir(P,io)},kz:'SK',alle:[],meine:[],schreib:Promise.resolve(),laden:0,tab:'zeiten',einst:null,pdatei:{berichte:{}}};
 c.ORDNER={abr:'Abrechnung',lab:'Laboraufträge',fotos:'Fotos',mitteil:'Mitteilungen'};c.EINST_DATEI='_AufwandKit-Einstellungen.json';c.PROJ_DATEI='_Abrechnung.json';c.norm=s=>s.toLowerCase();c.esc=s=>s;
 const el={innerHTML:'',textContent:''};c.$=()=>el;c.gezeichnet=0;c.zeichne=()=>{c.gezeichnet++;};c.meldung=()=>{};c.versteckeMeldung=()=>{};c.status=()=>{};
 vm.runInContext(html.slice(html.indexOf('async function unter('),html.indexOf('/** Einen Eintrag einer ZIP-Datei')),c);
 vm.runInContext(html.slice(html.indexOf('async function ladeAlles(){'),html.indexOf('/* ---------- Speichern ---------- */')),c);
 vm.runInContext(html.slice(html.indexOf('function uebernehmeMeineDatei(){'),html.indexOf('/** Projektdatei:')),c);
 vm.runInContext(html.slice(html.indexOf('function abrechnungJetzt(){'),html.indexOf('function zeichneAbrechnung(){')),c);
 {const i=html.indexOf('async function speichereBericht(');vm.runInContext(html.slice(i,html.indexOf('\n}\n',i)+3),c);}
 return c;
}
const stand=c=>({berichte:c.A.berichte.map(b=>b.stamm).join(','),seiten:c.abrechnungJetzt().seiten,sv1:c.abrechnungJetzt().sum.sv1,alle:c.A.alle.length,mehrdeutig:c.A.meineMehrdeutig,projekt:c.A.proj.nr});
(async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'belegkit-einlesen-'));
 try{
  const X=await projekt(tmp,'26.0101 Fiktiv X','26.0101','5',4), Y=await projekt(tmp,'26.0102 Fiktiv Y','26.0102','3',1);
  const erwartet={berichte:'1__Bericht,2__Bericht,3__Bericht,4__Bericht',seiten:40,sv1:5,alle:1,mehrdeutig:false,projekt:'26.0101'};
  // langsam beim Lesen der Berichte bzw. der Zeitdateien: der zweite Lauf startet, während der erste noch liest
  for(const [fall,langsam,abstand] of [['Berichte',n=>n.endsWith('.pdf'),60],['Zeitdateien',n=>n.startsWith('Aufwand_'),5]]){
   const io={read:async n=>{if(langsam(n))await sleep(40);}};
   const c=await sitzung(tmp,X,'26.0101',io);
   await c.ladeAlles();
   assert.deepEqual({...stand(c)},erwartet,fall+': einfaches Einlesen');
   const l1=c.ladeAlles();await sleep(abstand);const l2=c.ladeAlles();await Promise.all([l1,l2]);
   assert.deepEqual({...stand(c)},erwartet,fall+': doppeltes Einlesen zählt nichts doppelt');
   assert.equal(c.gezeichnet,2,fall+': nur der neueste Lauf zeichnet');
  }
  // Projektwechsel während eines langsamen Ladens: das alte Projekt darf nichts mehr übernehmen
  const io={read:async n=>{if(n.endsWith('.pdf'))await sleep(40);}};
  const c=await sitzung(tmp,X,'26.0101',io);
  const alt=c.ladeAlles();await sleep(20);
  c.A.proj={name:path.basename(Y),nr:'26.0102',dir:new Dir(Y,io)};
  const neu=c.ladeAlles();
  // solange das neue Projekt gelesen wird: keine Berichte des alten zeigen, nichts ins neue Projekt speichern
  assert.equal(c.A.berichte.length,0,'Berichte des vorigen Projekts nicht sichtbar');
  {let meldung='';c.status=m=>{meldung=m;};await c.speichereBericht('1__Bericht',{abrechnen:false});c.status=()=>{};assert.match(meldung,/noch gelesen/,'Speichern während des Lesens abgelehnt');}
  await Promise.all([alt,neu]);
  assert.deepEqual({...stand(c)},{berichte:'1__Bericht',seiten:10,sv1:3,alle:1,mehrdeutig:false,projekt:'26.0102'},'nach Projektwechsel nur Daten des neuen Projekts');
  assert.equal(c.gezeichnet,1);
  console.log('OK Einlesen: doppelt „Neu einlesen“ und Projektwechsel während des Ladens ohne doppelte Stunden/Berichte');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
