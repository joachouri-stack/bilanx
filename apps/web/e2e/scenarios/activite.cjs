// Scénario de bout en bout « activite » — lancé par apps/web/e2e/run.mjs (voir apps/web/e2e/LISEZ-MOI.md).
const {chromium}=require('playwright');const fs=require('fs');const crypto=require('crypto');
const B=process.env.E2E_BASE_URL||'http://localhost:3123';const LOG=process.env.E2E_SERVER_LOG||process.argv[2];const T=Date.now();
const b32=s=>{const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,v=0,o=[];for(const c of s.replace(/\s/g,'')){v=(v<<5)|A.indexOf(c);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)};
const totp=(sec)=>{const m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',sec).update(m).digest();const o=h[19]&15;return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0')};
const lastLink=(path)=>{const all=[...fs.readFileSync(LOG,'utf8').matchAll(new RegExp(`${B}${path}\\?jeton=[\\w%-]+`,'g'))];return all.at(-1)?.[0]};
const step=async(name,fn)=>{try{await fn();console.log('✓',name)}catch(e){console.log('✗',name,'—',e.message.split('\n')[0]);process.exitCode=1}};
const pw='cheval-agrafe-batterie-violette';
async function account(b,name,email){const p=await (await b.newContext()).newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>console.log('pageerror',e.message));
 await p.goto(B+'/inscription');await p.fill('input[name=displayName]',name);await p.fill('input[name=email]',email);await p.fill('input[name=password]',pw);await p.check('input[name=consentHealth]');await p.click('button[type=submit]');await p.getByText('un e-mail de confirmation').waitFor();
 await new Promise(r=>setTimeout(r,200));await p.goto(lastLink('/verifier-email'));await p.click('button[type=submit]');await p.getByText('Adresse confirmée').waitFor();
 await p.goto(B+'/connexion');await p.fill('input[name=email]',email);await p.fill('input[name=password]',pw);await p.click('button[type=submit]');await p.waitForURL('**/mfa/configuration');
 const sec=b32(await p.locator('code').textContent());await p.fill('input[name=code]',totp(sec));await p.click('button[type=submit]');await p.getByText('Vos codes de secours').waitFor();await p.click('text=continuer');await p.waitForURL('**/tableau-de-bord');return p}

const {execSync}=require('child_process');
const psql=q=>execSync(`psql ${process.env.E2E_DATABASE_URL} -tAc "${q}"`).toString().trim();
const nowParis=()=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date());

const iso=(days)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(Date.now()+days*86400000));

const pdfText=async(buf)=>{const pdfjs=await import(process.env.E2E_REPO+'/node_modules/pdfjs-dist/legacy/build/pdf.mjs');const t=pdfjs.getDocument({data:new Uint8Array(buf),disableFontFace:true});const d=await t.promise;let s='';for(let p=1;p<=d.numPages;p++){s+=(await (await d.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ')+' '}const n=d.numPages;await t.destroy();return {n,s:s.replace(/\s+/g,' ').replace(/μ/g,'µ')}};

(async()=>{const b=await chromium.launch();let A;const email=`jo+${T}@exemple.fr`;
await step('compte créé ; tableau de bord : pas de source',async()=>{A=await account(b,'Jo',email);await A.getByText('Aucune source de données.').waitFor()});
await step('import refusé sans session',async()=>{const r=await fetch(B+'/api/activite/import',{method:'POST',body:'x'});if(r.status!==401)throw Error(r.status)});
await step('page Activité vide, honnête',async()=>{await A.goto(B+'/activite');await A.getByText('Aucune donnée d’activité pour ce profil.').waitFor()});
await step('fichier invalide refusé avec explication',async()=>{require('fs').writeFileSync('pasunexport.zip','bonjour');await A.locator('input[type=file]').setInputFiles('pasunexport.zip');await A.getByText(/Aucun nombre de pas|n’a pas pu être lu/).waitFor()});
await step('import de l’export Apple Santé (ZIP, nom français)',async()=>{await A.locator('input[type=file]').setInputFiles('export.zip');await A.getByText(/jour\(s\) importé\(s\)/).waitFor({timeout:60000});await A.getByText(/Sources : Apple Watch de Jo, iPhone de Jo|Sources : iPhone de Jo, Apple Watch de Jo/).waitFor()});
await step('vue semaine : barres avec valeurs, source et période affichées',async()=>{await A.goto(B+'/activite?vue=semaine&date='+iso(-7));const t=await A.locator('svg[aria-label="Nombre de pas"] text').allTextContents();if(t.filter(x=>/^\d[\d   ]*\d$/.test(x)&&Number(x.replace(/\D/g,''))>1000).length<7)throw Error(JSON.stringify(t));await A.getByText('import de fichier').waitFor();await A.getByText('Aucune synchronisation automatique').waitFor();await A.screenshot({path:'a-week.png',fullPage:true})});
await step('dédoublonnage : la montre seule est comptée',async()=>{const pid=psql(`select pa.profile_id from profile_access pa join account a on a.id=pa.account_id where a.email='${email}'`);const day=iso(-10);const v=psql(`select steps from activity_daily where profile_id='${pid}' and day='${day}'`);let exp=0;const d=10;for(let h=7;h<=20;h++)exp+=300+((d*7+h*13)%9)*60;if(Number(v)!==exp)throw Error(v+' ≠ '+exp)});
await step('vues jour, mois (défilement mobile), année',async()=>{await A.goto(B+'/activite?vue=jour&date='+iso(-3));await A.getByText('Pas ce jour').waitFor();await A.goto(B+'/activite?vue=mois&date='+iso(-3));await A.getByText('Faites défiler horizontalement').waitFor();await A.goto(B+'/activite?vue=annee&date='+iso(-3));await A.getByText('moyenne quotidienne par mois').waitFor()});
await step('jour sans donnée (aujourd’hui) : vide, pas zéro',async()=>{await A.goto(B+'/activite?vue=jour');const t=await A.locator('.tabular.text-3xl').first().innerText();if(t!=='—')throw Error(t)});
await step('objectif modifié',async()=>{await A.goto(B+'/activite');await A.fill('input[name=goal]','10000');await A.getByRole('button',{name:'Enregistrer'}).click();await A.getByText('Objectif enregistré').waitFor();await A.goto(B+'/activite');await A.getByText('objectif 10 000').first().waitFor()});
await step('nouvel import du même fichier : pas de doublement',async()=>{const pid=psql(`select pa.profile_id from profile_access pa join account a on a.id=pa.account_id where a.email='${email}'`);const before=psql(`select sum(steps) from activity_daily where profile_id='${pid}'`);await A.goto(B+'/activite');await A.locator('input[type=file]').setInputFiles('export.zip');await A.getByText(/jour\(s\) importé\(s\)/).waitFor({timeout:60000});const after=psql(`select sum(steps) from activity_daily where profile_id='${pid}'`);if(before!==after)throw Error(before+' → '+after)});
await step('rapport PDF : rubrique activité',async()=>{const r=await A.request.get(B+'/api/rapports?jours=30&s=activity');const {s}=await pdfText(await r.body());if(!s.includes('Activité physique (pas)')||!s.includes('Appareils : '))throw Error('rubrique incomplète')});
await step('effacement des données importées',async()=>{await A.goto(B+'/activite');await A.locator('summary',{hasText:'Effacer les données'}).click();await A.click('text=Confirmer l’effacement');await A.waitForURL(/efface=1/);await A.getByText('Aucune donnée d’activité pour ce profil.').waitFor()});
await step('démonstration : pas fictifs',async()=>{await A.locator('aside summary').click();await A.locator('aside').getByRole('button',{name:/Claire/}).click();await A.getByText('Profil de démonstration —').waitFor();await A.goto(B+'/activite');await A.getByText('Démonstration (données fictives)').waitFor()});
const m=await b.newPage({viewport:{width:390,height:844},isMobile:true});await m.context().addCookies(await A.context().cookies());await m.goto(B+'/activite?vue=mois');console.log('mobile scrollWidth',await m.evaluate(()=>document.documentElement.scrollWidth));
await b.close()})();
