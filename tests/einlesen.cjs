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
  // B1 (1.17.1): ResultKit-Übernahme lesen – nicht lesbar → Hinweis nur, wenn es stornierte Proben gibt; lesbar → stornierte Probe mit Wert vorne
  {const Z=await projekt(tmp,'26.0103 Fiktiv Z','26.0103','2',0);await fs.mkdir(path.join(Z,'Laboraufträge'));await fs.mkdir(path.join(Z,'Laborergebnisse'));
   const lk=sto=>JSON.stringify({proben:[{_nr:1,matrix:'Wischprobe',z2:'A'},{_nr:2,matrix:'Wischprobe',z2:'B',...(sto?{storniert:{am:'2026-11-18',kuerzel:'SK',grund:'x'}}:{})}]});
   await fs.writeFile(path.join(Z,'Laboraufträge','26.0103_Daten.json'),lk(true));await fs.writeFile(path.join(Z,'Laborergebnisse','_Ergebnisse.json'),'{kaputt');
   const z=await sitzung(tmp,Z,'26.0103',{});await z.ladeAlles();
   assert.ok(z.A.ladeHinweise.some(h=>/^ResultKit-Übernahme \(_Ergebnisse\.json\) nicht lesbar – ob eine stornierte Probe ein Laborergebnis hat, ist unbekannt/.test(h)),'kaputte Übernahme gemeldet');
   assert.equal(z.A.ergebnisse,null);
   await fs.writeFile(path.join(Z,'Laboraufträge','26.0103_Daten.json'),lk(false));const z2=await sitzung(tmp,Z,'26.0103',{});await z2.ladeAlles();
   assert.ok(!z2.A.ladeHinweise.some(h=>/ResultKit-Übernahme/.test(h)),'ohne stornierte Probe kein Hinweis');
   await fs.writeFile(path.join(Z,'Laboraufträge','26.0103_Daten.json'),lk(true));
   await fs.writeFile(path.join(Z,'Laborergebnisse','_Ergebnisse.json'),JSON.stringify({format:'spektron-ergebnisse',version:1,projekt:'26.0103',uebernommen:'2026-11-19T08:00:00Z',berichte:[],storniertMitWert:['P2']}));
   const z3=await sitzung(tmp,Z,'26.0103',{});await z3.ladeAlles();
   assert.match(z3.abrechnungJetzt().hinweise.find(h=>/^LabelKit\/ResultKit/.test(h))||'',/^LabelKit\/ResultKit: P2 PAK ist in LabelKit storniert, hat aber laut ResultKit \(übernommen am 19\.11\.2026\) ein Laborergebnis/);
   assert.ok(!z3.A.quellDateien.some(q=>/_Ergebnisse/.test(q.pfad)),'nicht unter den Quellen des Stands');}
  // Audit Lauf 3, C7 (1.17.2): Anschreiben aus BüroKit sind keine Berichte – außer eines ist schon zur Abrechnung angekreuzt
  {const A3=await projekt(tmp,'26.0104 Fiktiv A','26.0104','1',1);
   for(const n of ['Anschreiben 1. Mitteilung.docx','Anschreiben_1. Mitteilung_VN.docx'])await fs.writeFile(path.join(A3,'Mitteilungen',n),'x');
   await fs.writeFile(path.join(A3,'Mitteilungen','Anschreiben_1. Mitteilung_Auftraggeber.pdf'),pdf(1));
   const a=await sitzung(tmp,A3,'26.0104',{});await a.ladeAlles();
   assert.equal(a.A.berichte.map(b=>b.stamm).join(','),'1__Bericht','Anschreiben nicht unter „Berichte“');
   assert.ok(!a.A.quellDateien.some(q=>/Anschreiben/.test(q.pfad)),'Anschreiben nicht unter den gelesenen Quellen');
   await fs.writeFile(path.join(A3,'Abrechnung','_Abrechnung.json'),JSON.stringify({berichte:{'1__Bericht':{abrechnen:true,seiten:'10'},'Anschreiben_1. Mitteilung_Auftraggeber':{abrechnen:true,seiten:'1'}}}));
   const b=await sitzung(tmp,A3,'26.0104',{});await b.ladeAlles();
   assert.equal(b.A.berichte.map(x=>x.stamm).join(','),'1__Bericht,Anschreiben_1. Mitteilung_Auftraggeber','angekreuztes Anschreiben bleibt sichtbar');
   assert.equal(b.abrechnungJetzt().seiten,11);}
  // 1.18.0 (FotoKit 2.7.0): Fotos in Unterordnern von „Fotos“ zählen mit – eine Ebene, ohne „_…“/„.…“-Ordner, ohne FotoKit-„Weg“
  // (Schlüssel „Ordner/Datei“); tiefer liegende Bilder zählen nicht (Hinweis); ein nicht lesbarer Unterordner wird genannt
  {const F=await projekt(tmp,'26.0105 Fiktiv F','26.0105','1',0),fo=path.join(F,'Fotos');
   const datei=async(rel,x='x')=>{await fs.mkdir(path.dirname(path.join(fo,rel)),{recursive:true});await fs.writeFile(path.join(fo,rel),x);};
   for(const n of ['26.0105_001.jpg','26.0105_002.jpg','IMG_9.HEIC','notiz.txt','._26.0105_001.jpg','umb-tmp_heic_1.jpg'])await datei(n);
   for(const n of ['fotos ka 20.08/IMG_0001.jpg','fotos ka 20.08/IMG_0002.jpg','fotos ka 20.08/IMG_0003.heic','Bilder Stefan/DSC_1.JPG','Bilder Stefan/liesmich.txt',
     '_aussortiert/alt.jpg','_Originale/IMG_8.HEIC','fotos ka 20.08/_Originale/IMG_7.HEIC','.versteckt/x.jpg','Bilder Stefan/Tiefer/DSC_9.jpg'])await datei(n);
   await datei('_Bildumbenenner.json',JSON.stringify({app:'Bildumbenenner',format:1,version:'2.7.0',bilder:{'26.0105_002.jpg':{aussortiert:true},'fotos ka 20.08/IMG_0002.jpg':{aussortiert:true},'Bilder Stefan/DSC_1.JPG':{beschreibung:'Keller'}}}));
   const f=await sitzung(tmp,F,'26.0105',{});await f.ladeAlles();
   assert.equal(f.A.fotos.anzahl,5,'direkt 3 (eins Weg) + „fotos ka 20.08“ 3 (eins Weg) + „Bilder Stefan“ 1 = 7 Bilder, 2 Weg → 5');
   assert.equal(f.A.fotos.quelle,'7 Bilder im Ordner „Fotos“ (4 davon in Unterordnern: Bilder Stefan (1), fotos ka 20.08 (3)), davon 2 in FotoKit aussortiert');
   assert.ok(f.A.fotos.hinweise.some(h=>h==='In Unterordnern von „Fotos“ liegen Bilder eine Ebene tiefer (Bilder Stefan/Tiefer (1)) – FotoKit zeigt sie nicht, sie sind nicht gezählt.'),f.A.fotos.hinweise.join('\n'));
   assert.ok(!f.A.fotos.hinweise.some(h=>/gezählt werden nur die Fotos direkt/.test(h)),'kein Hinweis „nur direkt“ mehr');
   assert.equal(f.abrechnungJetzt().fotos,5,'Abrechnung nimmt die Zahl');
   // ohne Unterordner: Text wie bis 1.17.2
   const G=await projekt(tmp,'26.0106 Fiktiv G','26.0106','1',0);await fs.mkdir(path.join(G,'Fotos'));for(const n of ['a.jpg','b.jpg'])await fs.writeFile(path.join(G,'Fotos',n),'x');
   const g=await sitzung(tmp,G,'26.0106',{});await g.ladeAlles();
   assert.deepEqual([g.A.fotos.anzahl,g.A.fotos.quelle,g.A.fotos.hinweise.length],[2,'2 Bilder im Ordner „Fotos“',0]);
   // nicht lesbarer Unterordner: genannt, seine Bilder nicht still gezählt
   const io={read:()=>{}};const fr=await sitzung(tmp,F,'26.0105',io);
   const orig=fr.A.proj.dir.getDirectoryHandle.bind(fr.A.proj.dir);
   // bricht mitten im Ordner ab (erst ein Foto gelesen, dann Fehler) – auch das schon gelesene zählt nicht (Codex aufwandkit#47)
   fr.A.proj.dir.getDirectoryHandle=async(n,o)=>{const d=await orig(n,o);if(n!=='Fotos')return d;const v=d.values.bind(d);d.values=async function*(){for await(const h of v()){if(h.kind==='directory'&&h.name==='fotos ka 20.08'){const hv=h.values.bind(h);h.values=async function*(){let k=0;for await(const x of hv()){if(x.kind==='file'&&k++>=1)throw Object.assign(Error('gesperrt'),{name:'NotReadableError'});yield x;}};}yield h;}};return d;};
   await fr.ladeAlles();
   assert.equal(fr.A.fotos.anzahl,3,'ohne „fotos ka 20.08“ – auch nicht das vor dem Fehler gelesene Foto: direkt 2 + „Bilder Stefan“ 1');
   assert.ok(!/fotos ka 20\.08/.test(fr.A.fotos.quelle),fr.A.fotos.quelle);
   assert.ok(fr.A.fotos.hinweise.some(h=>/^Der Ordner „Fotos\/fotos ka 20\.08“ ist nicht lesbar – seine Bilder sind nicht gezählt/.test(h)),fr.A.fotos.hinweise.join('\n'));}
  console.log('OK Einlesen: doppelt „Neu einlesen“ und Projektwechsel während des Ladens ohne doppelte Stunden/Berichte; Fotos in Unterordnern (1.18.0)');
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
