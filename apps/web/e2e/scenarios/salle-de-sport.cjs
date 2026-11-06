// Scénario de bout en bout « salle-de-sport » — lancé par apps/web/e2e/run.mjs (voir apps/web/e2e/LISEZ-MOI.md).
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
const iso=(days)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date(Date.now()+days*86400000));
const longDay=(d)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00Z'));
const weekday=(d)=>(new Date(d+'T12:00:00Z').getUTCDay()+6)%7; // lundi = 0
const card=(p)=>p.locator('section.card',{has:p.getByRole('heading',{name:'Salle de sport',exact:true})});
const dayBtn=(p,d)=>p.getByRole('button',{name:longDay(d),exact:false});

(async()=>{const b=await chromium.launch();let A;const email=`gym+${T}@exemple.fr`;let pid='';
const today=iso(0);const past=[];for(let i=1;i<=weekday(today);i++)past.push(iso(-i));
await step('compte créé ; carte vide : 0 / 3, pastille rouge « Encore 3 séances »',async()=>{A=await account(b,'Jo',email);pid=psql(`select pa.profile_id from profile_access pa join account a on a.id=pa.account_id where a.email='${email}'`);
 const c=card(A);await c.waitFor();await c.getByText(/^Encore 3\s+séances$/).waitFor();await c.getByText(/0\s*\/\s*3/).first().waitFor();
 const cls=await c.getByText(/^Encore 3\s+séances$/).getAttribute('class');if(!/text-red/.test(cls))throw Error('pastille non rouge : '+cls);
 // juste en dessous de la carte Pas
 const order=await A.evaluate(()=>[...document.querySelectorAll('main h2')].map(h=>h.textContent.trim()));const i=order.indexOf('Pas'),j=order.indexOf('Salle de sport');if(i<0||j!==i+1)throw Error(order.join(' | '))});
await step('« J’y suis allé aujourd’hui » → « Séance notée aujourd’hui »',async()=>{const c=card(A);await c.getByRole('button',{name:'J’y suis allé aujourd’hui'}).click();await c.getByText('Séance notée aujourd’hui').waitFor();await c.getByText(/^Encore 2\s+séances$/).waitFor();
 if(psql(`select count(*) from gym_visit where profile_id='${pid}' and day='${today}'`)!=='1')throw Error('séance non enregistrée')});
await step('clic sur la carte (hors bouton) → /salle-de-sport',async()=>{await A.goto(B+'/tableau-de-bord');const h=await card(A).getByRole('heading',{name:'Salle de sport',exact:true}).boundingBox();await A.mouse.click(h.x+h.width/2,h.y+h.height/2);await A.waitForURL(/\/salle-de-sport/);await A.getByRole('heading',{name:'Salle de sport',level:1}).waitFor();
 // pas de lien imbriqué dans un lien
 await A.goto(B+'/tableau-de-bord');if(await A.locator('a a, a button, a form').count())throw Error('élément interactif dans un lien')});
await step(past.length>=2?'historique : 2 jours passés de la semaine cochés':'historique : début de semaine, compteur seulement',async()=>{
 if(past.length<2){await A.goto(B+'/salle-de-sport');const t=dayBtn(A,today);if(await t.getAttribute('aria-pressed')!=='true')throw Error('aujourd’hui non coché');return}
 for(const d of past.slice(0,2)){await A.goto(B+'/salle-de-sport?vue=mois&mois='+d.slice(0,7));const btn=dayBtn(A,d);await btn.click();await A.waitForFunction(n=>[...document.querySelectorAll('button[aria-pressed]')].some(x=>x.getAttribute('aria-label')?.startsWith(n)&&x.getAttribute('aria-pressed')==='true'),longDay(d))}
 if(psql(`select count(*) from gym_visit where profile_id='${pid}'`)!=='3')throw Error('3 séances attendues')});
await step('tableau de bord : 3 / 3, pastille verte « Objectif atteint »',async()=>{if(past.length<2)return;await A.goto(B+'/tableau-de-bord');const c=card(A);await c.getByText('Objectif atteint',{exact:true}).waitFor();const cls=await c.getByText('Objectif atteint',{exact:true}).getAttribute('class');if(!/text-sage/.test(cls))throw Error('pastille non verte');await c.getByText(/3\s*\/\s*3/).first().waitFor();await c.getByText(/1\s+semaine d’affilée/).waitFor()});
await step('jour futur : aucun bouton ; date future refusée',async()=>{const tomorrow=iso(1);await A.goto(B+'/salle-de-sport?vue=mois&mois='+tomorrow.slice(0,7));if(await dayBtn(A,tomorrow).count())throw Error('bouton sur un jour futur')});
await step('décocher un jour dans l’historique',async()=>{const d=past.length>=2?past[0]:today;await A.goto(B+'/salle-de-sport?vue=mois&mois='+d.slice(0,7));const btn=dayBtn(A,d);if(await btn.getAttribute('aria-pressed')!=='true')throw Error('jour non coché');await btn.click();await A.waitForFunction(n=>[...document.querySelectorAll('button[aria-pressed]')].some(x=>x.getAttribute('aria-label')?.startsWith(n)&&x.getAttribute('aria-pressed')==='false'),longDay(d));
 await A.goto(B+'/tableau-de-bord');await card(A).getByText(/^Encore 1\s+séance$|^Encore 3\s+séances$/).waitFor()});
await step('« Annuler » la séance d’aujourd’hui depuis la carte',async()=>{await A.goto(B+'/tableau-de-bord');const c=card(A);if(!(await c.getByText('Séance notée aujourd’hui').count())){await c.getByRole('button',{name:'J’y suis allé aujourd’hui'}).click();await c.getByText('Séance notée aujourd’hui').waitFor()}
 await c.getByRole('button',{name:'Annuler la séance d’aujourd’hui'}).click();await c.getByRole('button',{name:'J’y suis allé aujourd’hui'}).waitFor();if(psql(`select count(*) from gym_visit where profile_id='${pid}' and day='${today}'`)!=='0')throw Error('séance non retirée')});
await step('vue Année : 12 mois, total, mois cliquable vers la vue Mois',async()=>{await A.goto(B+'/salle-de-sport');await A.getByRole('navigation',{name:'Vue'}).getByRole('link',{name:'Année'}).click();await A.waitForURL(/vue=annee/);await A.getByText('Semaines réussies').waitFor();
 const months=await A.locator('main ul > li').count();if(months!==12)throw Error(months+' mois');const cur=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',month:'long'}).format(new Date());await A.locator('main ul a',{hasText:new RegExp(cur,'i')}).click();await A.waitForURL(/vue=mois&mois=/);await A.getByText('Meilleure série').waitFor()});
await step('mobile 390 px : pas de défilement horizontal, cases ≥ 44 px',async()=>{const m=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();await m.context().addCookies(await A.context().cookies());
 for(const u of ['/tableau-de-bord','/salle-de-sport','/salle-de-sport?vue=annee']){await m.goto(B+u);const w=await m.evaluate(()=>document.documentElement.scrollWidth);if(w>390)throw Error(u+' : '+w+' px')}
 await m.goto(B+'/salle-de-sport');const box=await dayBtn(m,today).boundingBox();if(box.width<44||box.height<44)throw Error(`case ${box.width}×${box.height}`);
 await m.goto(B+'/tableau-de-bord');const bb=await card(m).getByRole('button',{name:'J’y suis allé aujourd’hui'}).boundingBox();if(bb.height<48||bb.width<300)throw Error(`bouton ${bb.width}×${bb.height}`);await m.screenshot({path:'salle-mobile.png',fullPage:true});await m.close()});
await step('démonstration : carte avec données fictives, sans bouton',async()=>{await A.locator('aside summary').click();await A.locator('aside').getByRole('button',{name:/Claire/}).click();await A.getByText('Profil de démonstration —').waitFor();await A.goto(B+'/tableau-de-bord');const c=card(A);await c.getByText('Démonstration : données fictives.').waitFor();if(await c.getByRole('button').count())throw Error('bouton présent en démonstration');
 await A.goto(B+'/salle-de-sport');await A.getByText('Démonstration : données fictives, en lecture seule.').waitFor();if(await A.locator('main button[aria-pressed]').count())throw Error('jours modifiables en démonstration');const n=await A.locator('main [role=group]').count();if(n<4)throw Error(n+' semaines')});
await b.close()})();
