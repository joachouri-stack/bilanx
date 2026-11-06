// Scénario de bout en bout « accessibilite » — lancé par apps/web/e2e/run.mjs (voir apps/web/e2e/LISEZ-MOI.md).
const {chromium}=require('playwright');const fs=require('fs');const crypto=require('crypto');
const B=process.env.E2E_BASE_URL||'http://localhost:3123';const LOG=process.env.E2E_SERVER_LOG||process.argv[2];const T=Date.now();
const AXE=fs.readFileSync(process.env.E2E_REPO+'/node_modules/axe-core/axe.min.js','utf8');
const b32=s=>{const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,v=0,o=[];for(const c of s.replace(/\s/g,'')){v=(v<<5)|A.indexOf(c);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)};
const totp=(sec)=>{const m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',sec).update(m).digest();const o=h[19]&15;return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0')};
const lastLink=(path)=>{const all=[...fs.readFileSync(LOG,'utf8').matchAll(new RegExp(`${B}${path}\\?jeton=[\\w%-]+`,'g'))];return all.at(-1)?.[0]};
const pw='cheval-agrafe-batterie-violette';
async function audit(p,label,results){await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))).catch(()=>{});await p.waitForFunction(()=>document.title.length>0,null,{timeout:5000}).catch(()=>{});await p.addScriptTag({content:AXE});const r=await p.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},resultTypes:['violations']}));
 for(const v of r.violations)for(const n of v.nodes){const k=v.id;(results[k]??={impact:v.impact,help:v.help,pages:new Set(),nodes:[]});results[k].pages.add(label);if(results[k].nodes.length<6)results[k].nodes.push(`${label} :: ${n.target.join(' ')} :: ${(n.failureSummary||'').split('\n').slice(1,2).join(' ').slice(0,160)}`)}}
(async()=>{const b=await chromium.launch();const results={};
for(const [vw,tag,scheme] of [[{width:1280,height:900},'bureau','light'],[{width:390,height:844},'mobile','light'],[{width:1280,height:900},'sombre','dark'],[{width:390,height:844},'sombre-mobile','dark']]){
 const ctx=await b.newContext({viewport:vw,colorScheme:scheme});const p=await ctx.newPage();
 for(const u of ['/connexion','/inscription','/mot-de-passe-oublie']){await p.goto(B+u);await audit(p,`${tag} ${u}`,results)}
 const email=`a11y-${tag}+${T}@exemple.fr`;
 await p.goto(B+'/inscription');await p.fill('input[name=displayName]','Jo');await p.fill('input[name=email]',email);await p.fill('input[name=password]',pw);await p.check('input[name=consentHealth]');await p.click('button[type=submit]');await p.getByText('un e-mail de confirmation').waitFor();await new Promise(r=>setTimeout(r,300));await p.goto(lastLink('/verifier-email'));await p.click('button[type=submit]');await p.getByText('Adresse confirmée').waitFor();
 await p.goto(B+'/connexion');await p.fill('input[name=email]',email);await p.fill('input[name=password]',pw);await p.click('button[type=submit]');await p.waitForURL('**/mfa/configuration');await audit(p,`${tag} /mfa/configuration`,results);const sec=b32(await p.locator('code').textContent());await p.fill('input[name=code]',totp(sec));await p.click('button[type=submit]');await p.getByText('Vos codes de secours').waitFor();await audit(p,`${tag} codes de secours`,results);await p.click('text=continuer');await p.waitForURL('**/tableau-de-bord');
 // Clavier : lien d'évitement en premier, puis focus sur le contenu.
 if(!tag.includes('mobile')){await p.goto(B+'/tableau-de-bord');await p.keyboard.press('Tab');const first=await p.evaluate(()=>document.activeElement?.textContent?.trim());const vis=await p.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return r.width>20&&r.height>10});await p.keyboard.press('Enter');await p.waitForTimeout(200);const after=await p.evaluate(()=>document.activeElement?.id);console.log(`clavier (${tag}) : 1re tabulation « ${first} » ${vis?'visible':'INVISIBLE'}, puis focus sur #${after}`);if(first!=='Aller au contenu'||!vis||after!=='contenu')results['clavier-evitement']={impact:'serious',help:'Lien d’évitement',pages:new Set([tag]),nodes:[first+' / '+after]}}
 // Profil réel (formulaires)
 await p.goto(B+'/parametres');await p.evaluate(()=>document.querySelectorAll('main#contenu details').forEach(d=>d.open=true));await audit(p,`${tag} réel /parametres (rubriques ouvertes)`,results);
 for(const u of ['/tableau-de-bord','/analyses/ajouter','/traitements','/medicaments','/journal','/documents','/rendez-vous','/rapports','/famille','/parametres','/activite'])
  {await p.goto(B+u);await p.waitForLoadState('networkidle');await audit(p,`${tag} réel ${u}`,results)}
 // Profil de démonstration (données)
 if(tag.includes('mobile')){
  // Feuilles du bas (ajout rapide, menu) auditées ouvertes.
  await p.goto(B+'/tableau-de-bord');await p.getByRole('button',{name:/^Ajouter :/}).click();await p.getByRole('dialog',{name:'Ajouter'}).waitFor();await audit(p,`${tag} feuille Ajouter`,results);await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Menu'}).click();await p.getByRole('dialog',{name:'Menu'}).waitFor();await audit(p,`${tag} feuille Menu`,results);await p.keyboard.press('Escape');
  await p.getByRole('button',{name:/^Changer de profil/}).click();await p.getByRole('dialog',{name:'Changer de profil'}).waitFor();await audit(p,`${tag} feuille Changer de profil`,results)}else{await p.locator('aside summary').click()}
 await p.getByRole('button',{name:/Claire/}).first().click();await p.getByText('Profil de démonstration —').waitFor();
 for(const u of ['/tableau-de-bord','/glycemie','/glycemie?periode=14','/glycemie?periode=90','/analyses','/analyses/hba1c','/analyses/ferritin','/traitements','/medicaments','/activite','/journal','/rendez-vous','/rapports'])
  {await p.goto(B+u);await p.waitForLoadState('networkidle');await audit(p,`${tag} démo ${u}`,results)}
 await ctx.close()}
const out=Object.entries(results).sort((a,b)=>({critical:0,serious:1,moderate:2,minor:3}[a[1].impact]-({critical:0,serious:1,moderate:2,minor:3}[b[1].impact])));
for(const [k,v] of out){console.log(`\n[${v.impact}] ${k} — ${v.help} — ${v.pages.size} page(s)`);for(const n of v.nodes)console.log('   ',n)}
console.log(`\n${out.length} règle(s) en échec`);await b.close()})().catch(e=>{console.error('ERREUR',e.message);process.exit(2)});
