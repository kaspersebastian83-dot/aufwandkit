// Independent Chromium/WebKit storage partitions, real UI, shared synthetic disk.
// Deterministic barriers at file creation and AFTER the last compare, before write.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),pw=require('playwright');
const root=path.resolve(__dirname,'..'),engine=process.argv[2]||'chromium',PROJECT='26.0101 Fiktives Projekt',FILE='Aufwand_SK.json';
const entry=(id,h='1')=>({id,datum:'2026-10-21',art:'ort',rolle:'Sachverständiger',stunden:h,km:'4',spesen:'1',hotelAnzahl:'',hotelBetrag:'',notiz:'synthetisch'});
const initial={format:'aufwandkit-zeiten',version:1,projekt:'26.0101',kuerzel:'SK',eintraege:[entry('old-1'),entry('old-2')],unknown:{preserve:true}};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
(async()=>{
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'f4-ui-')),project=path.join(tmp,PROJECT),abr=path.join(project,'Abrechnung'),contexts=[],errors=[];
await fs.mkdir(abr,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const f=path.resolve(root,decodeURIComponent(new URL(req.url,'http://x').pathname).slice(1)||'index.html');if(!f.startsWith(root+path.sep))throw Error('path');res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await pw[engine].launch();
try{
async function reset(first=false){await fs.rm(abr,{recursive:true,force:true});await fs.mkdir(abr);if(!first)await fs.writeFile(path.join(abr,FILE),JSON.stringify(initial));}
async function session(createGate){
 const context=await browser.newContext({viewport:{width:1500,height:1000},serviceWorkers:'block'});contexts.push(context);const control={hold:false,arrived:defer(),release:defer(),failMain:false};
 await context.exposeBinding('__f4io',async(_,a)=>{
  const f=path.resolve(tmp,a.rel||'.');if(f!==tmp&&!f.startsWith(tmp+path.sep))throw Error('outside synthetic archive');
  try{switch(a.op){
   case'dir':if(a.create)await fs.mkdir(f,{recursive:true});if(!(await fs.stat(f)).isDirectory())throw Error('not dir');return true;
   case'file':if(a.create){if(a.rel.endsWith('/'+FILE)&&createGate)await createGate();await fs.appendFile(f,'');}if(!(await fs.stat(f)).isFile())throw Error('not file');return true;
   case'list':return(await fs.readdir(f,{withFileTypes:true})).map(e=>({name:e.name,kind:e.isDirectory()?'directory':'file'}));
   case'read':return Array.from(await fs.readFile(f));
   case'before':if(control.hold&&a.rel.endsWith('/'+FILE)){control.arrived.resolve();await control.release.promise;}return true;
   case'write':if(control.failMain&&a.rel.endsWith('/'+FILE))throw Error('SYNTHETIC interrupted main close');await fs.writeFile(f,Buffer.from(a.bytes));return true;
  }}catch(e){if(e.code==='ENOENT')return{missing:true};throw e;}
 });
 await context.addInitScript(()=>{
  localStorage.setItem('mosaik-kuerzel','SK');const io=async a=>{const r=await window.__f4io(a);if(r?.missing)throw new DOMException('Missing','NotFoundError');return r;};
  class H{constructor(rel,kind){this.rel=rel;this.kind=kind;this.name=rel.split('/').at(-1)||'Synthetisches F4-Archiv';}async queryPermission(){return'granted';}async requestPermission(){return'granted';}async isSameEntry(h){return h.rel===this.rel;}}
  class F extends H{constructor(rel){super(rel,'file');}async getFile(){return new File([Uint8Array.from(await io({op:'read',rel:this.rel}))],this.name,{lastModified:1});}async createWritable(){let bytes;return{write:async v=>{await io({op:'before',rel:this.rel});bytes=typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);},close:async()=>io({op:'write',rel:this.rel,bytes:Array.from(bytes)}),abort:async()=>{}};}}
  class D extends H{constructor(rel){super(rel,'directory');}child(n){return(this.rel?this.rel+'/':'')+n;}async getDirectoryHandle(n,o={}){const rel=this.child(n);await io({op:'dir',rel,create:o.create});return new D(rel);}async getFileHandle(n,o={}){const rel=this.child(n);await io({op:'file',rel,create:o.create});return new F(rel);}async *values(){for(const e of await io({op:'list',rel:this.rel}))yield e.kind==='directory'?new D(this.child(e.name)):new F(this.child(e.name));}}
  window.showDirectoryPicker=async()=>new D('');
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/index.html#projekt='+encodeURIComponent(PROJECT));await page.locator('#bArchiv').click();await page.locator('.pz[data-n="'+PROJECT+'"]').click();await page.locator('#zNeu').waitFor();return{page,context,control};
}
const field=(s,i,k)=>s.page.locator('#zRows tr').nth(i).locator('[data-f="'+k+'"]');
const success=s=>s.page.locator('#status.ok').filter({hasText:/✓ gespeichert in/}).waitFor();
const failed=s=>s.page.locator('#status.err').filter({hasText:/Nicht gespeichert:/}).waitFor();
const disk=async()=>JSON.parse(await fs.readFile(path.join(abr,FILE),'utf8'));
async function close(...sessions){await Promise.all(sessions.map(s=>s.context.close()));}
await reset();{
 const A=await session(),B=await session();await B.page.locator('#zNeuB').click();await field(B,2,'stunden').fill('7');await success(B);const saved=await fs.readFile(path.join(abr,FILE));
 await field(A,0,'stunden').fill('2');await failed(A);assert.deepEqual(await fs.readFile(path.join(abr,FILE)),saved);assert.equal(await field(A,0,'stunden').inputValue(),'2');assert.ok((await disk()).eintraege.some(e=>e.stunden==='7'));
 await A.page.locator('#bNeu').click();await failed(A);assert.equal(await field(A,0,'stunden').inputValue(),'2');
 await A.page.locator('#zFassungen').click();const dlg=A.page.locator('[data-zeit-fassungen]');await dlg.getByRole('button',{name:'Aktuelle Datei prüfen',exact:true}).waitFor();
 await dlg.getByRole('button',{name:'Konfliktfreie Einträge zur Prüfung zusammenführen',exact:true}).click();await dlg.locator('[data-info]').filter({hasText:'Widersprüchliche'}).waitFor();assert.deepEqual(await fs.readFile(path.join(abr,FILE)),saved);
 await dlg.getByRole('button',{name:'Aktuelle Datei prüfen',exact:true}).click();assert.ok(JSON.parse(await dlg.locator('textarea').inputValue()).eintraege.some(e=>e.stunden==='7'));await dlg.locator('[data-zeit-uebernehmen]').click();await dlg.waitFor({state:'detached'});
 assert.equal(await A.page.locator('#zRows tr').count(),3);const copies=await fs.readdir(path.join(abr,'_BelegKit_Sicherungen'));assert.ok((await Promise.all(copies.map(n=>fs.readFile(path.join(abr,'_BelegKit_Sicherungen',n),'utf8')))).some(s=>JSON.parse(s).eintraege[0].stunden==='2'),'own discarded inputs verified and retained');
 await field(A,0,'stunden').fill('2');await success(A);assert.ok((await disk()).eintraege.some(e=>e.stunden==='7'));await close(A,B);console.log('OK',engine,'A: 7 hours preserved, stale UI blocked, own inputs retained, explicit resolution');
}
for(const first of [false,true]){
 await reset(first);const gate=defer();let creates=0;const createGate=async()=>{if(first){if(++creates===2)gate.resolve();await gate.promise;}};
 const A=await session(createGate),B=await session(createGate);A.control.hold=B.control.hold=true;
 if(first){await A.page.locator('#zNeu').click();await B.page.locator('#zNeu').click();}
 await field(A,0,'stunden').fill('3');await field(B,first?0:1,'stunden').fill('4');await Promise.all([A.control.arrived.promise,B.control.arrived.promise]);
 A.control.release.resolve();await success(A);B.control.release.resolve();await success(B);await close(A,B);
 const C=await session();await C.page.locator('#zFassungen').click();const dlg=C.page.locator('[data-zeit-fassungen]'),choices=dlg.getByRole('button').filter({hasText:/^Sicherung prüfen:/});await choices.first().waitFor();let found=false;
 for(let i=0;i<await choices.count();i++){await choices.nth(i).click();const data=JSON.parse(await dlg.locator('textarea').inputValue());if(data.eintraege[0]?.stunden==='3'){if(!first)assert.equal(data.eintraege[1].stunden,'1','complete A, no semantic merge');await dlg.locator('[data-zeit-uebernehmen]').click();found=true;break;}}
 assert.ok(found,'A candidate found after restart');await dlg.waitFor({state:'detached'});assert.equal((await disk()).eintraege[0].stunden,'3');
 const versions=await C.page.evaluate(async()=>{const d=await(await A.proj.dir.getDirectoryHandle('Abrechnung')).getDirectoryHandle('_BelegKit_Sicherungen'),out=[];for await(const h of d.values())out.push(JSON.parse(await(await h.getFile()).text()));return out;});assert.ok(versions.some(v=>v.eintraege.some(e=>e.stunden==='4')),'B survives restore');await close(C);console.log('OK',engine,'B:',first?'initial-create':'existing','last-check barrier, A then B confirmed, both recoverable after restart');
}
await reset();{
 const A=await session();await fs.writeFile(path.join(abr,FILE),'{broken');await field(A,0,'stunden').fill('9');await failed(A);assert.equal((await fs.readFile(path.join(abr,FILE))).toString(),'{broken');assert.equal(await field(A,0,'stunden').inputValue(),'9');
 await A.page.locator('#zFassungen').click();const dlg=A.page.locator('[data-zeit-fassungen]');await dlg.getByRole('button',{name:'Eigene ungespeicherte Eingaben prüfen',exact:true}).click();await dlg.locator('[data-zeit-uebernehmen]').click();await dlg.waitFor({state:'detached'});assert.equal((await disk()).eintraege[0].stunden,'9');const files=await fs.readdir(path.join(abr,'_BelegKit_Sicherungen'));assert.ok((await Promise.all(files.map(n=>fs.readFile(path.join(abr,'_BelegKit_Sicherungen',n),'utf8')))).includes('{broken'),'explicit restore retains corrupt original');await close(A);console.log('OK',engine,'C: corrupt source blocked; explicit recovery retains original bytes');
}
await reset();{
 const A=await session(),before=await fs.readFile(path.join(abr,FILE));A.control.failMain=true;await field(A,0,'km').fill('42');await failed(A);assert.deepEqual(await fs.readFile(path.join(abr,FILE)),before);assert.equal(await field(A,0,'km').inputValue(),'42');A.control.failMain=false;await A.page.locator('#zRetry').click();await success(A);assert.equal((await disk()).eintraege[0].km,'42');await close(A);console.log('OK',engine,'write failure and Retry preserve pending input');
}
assert.deepEqual(errors,[]);
}finally{await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
