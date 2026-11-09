#!/usr/bin/env node
/**
 * Tests de bout en bout de BILANX : vrai navigateur (Chromium), vraie base PostgreSQL, serveur de production.
 *
 *   npm run build -w @bilanx/web          # une fois, après chaque modification
 *   npm run e2e                            # tous les scénarios
 *   npm run e2e -- medicaments partage     # quelques scénarios
 *
 * Variables : DATABASE_URL et BILANX_SECRET_KEY (lues aussi dans apps/web/.env.local).
 * La base doit être une base de DÉVELOPPEMENT : les scénarios y créent des comptes de test.
 * Résultats, captures d'écran des échecs et journal du serveur : apps/web/e2e/.resultats/
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const REPO = resolve(WEB, '../..');
const OUT = join(HERE, '.resultats');
const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE = `http://localhost:${PORT}`;

// Ordre d'exécution ; « application-installable » tourne sur un second serveur protégé par mot de passe.
const ALL = [
  'comptes', 'famille', 'analyses', 'documents', 'insuline', 'journal', 'rendez-vous', 'contacts', 'rapports', 'rgpd', 'activite',
  'medicaments', 'compte-securite', 'telephone-2fa', 'cles-acces', 'partage', 'ordonnances', 'rappels', 'unites', 'glycemie',
  'salle-de-sport', 'accessibilite', 'application-installable',
];
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const unknown = wanted.filter((w) => !ALL.includes(w));
if (unknown.length) {
  console.error(`Scénario(s) inconnu(s) : ${unknown.join(', ')}\nDisponibles : ${ALL.join(', ')}`);
  process.exit(2);
}
const run = wanted.length ? ALL.filter((s) => wanted.includes(s)) : ALL;

// ── Environnement ──
function envLocal() {
  const f = join(WEB, '.env.local');
  if (!existsSync(f)) return {};
  return Object.fromEntries(
    readFileSync(f, 'utf8')
      .split('\n')
      .map((l) => /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  );
}
const local = envLocal();
const DATABASE_URL = process.env.DATABASE_URL ?? local.DATABASE_URL;
const SECRET = process.env.BILANX_SECRET_KEY ?? local.BILANX_SECRET_KEY;
if (!DATABASE_URL || !SECRET) {
  console.error('DATABASE_URL et BILANX_SECRET_KEY sont nécessaires (environnement ou apps/web/.env.local).');
  process.exit(2);
}
if (!existsSync(join(WEB, '.next', 'BUILD_ID'))) {
  console.error('Application non construite : lancez d’abord « npm run build -w @bilanx/web ».');
  process.exit(2);
}

// ── Préparation : migrations, dossier de résultats, fichiers de test ──
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(process.execPath, [join(REPO, 'packages/db/src/migrate-cli.ts')], { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' });
// Export Apple Santé fictif, daté par rapport à aujourd'hui.
execFileSync(process.execPath, [join(HERE, 'fixtures/gen-apple-health.mjs')], { cwd: OUT, stdio: 'inherit' });
// Certificat de test du service de notification simulé (scénario « rappels »).
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', 'push-key.pem', '-out', 'push-cert.pem',
  '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-days', '2'], { cwd: OUT, stdio: 'ignore' });
// Les compteurs de tentatives (limitations) ne doivent pas déborder d'une exécution à l'autre.
execFileSync('psql', [DATABASE_URL, '-qc', 'DELETE FROM auth_throttle'], { stdio: 'ignore' });

// ── Serveur ──
async function startServer(log, extraEnv = {}) {
  const child = spawn(process.execPath, [join(REPO, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)], {
    cwd: WEB,
    env: { ...process.env, DATABASE_URL, BILANX_SECRET_KEY: SECRET, BILANX_APP_URL: BASE, BILANX_DEMO: '1', NEXT_TELEMETRY_DISABLED: '1', NODE_EXTRA_CA_CERTS: join(OUT, 'push-cert.pem'), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  const write = () => writeFileSync(log, Buffer.concat(chunks));
  child.stdout.on('data', (c) => (chunks.push(c), write()));
  child.stderr.on('data', (c) => (chunks.push(c), write()));
  writeFileSync(log, '');
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/sw.js`);
      if (r.ok) return child;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`Le serveur n'a pas démarré (voir ${log}).`);
}
const stop = (child) => new Promise((r) => (child.exitCode !== null ? r() : (child.once('exit', r), child.kill())));

function scenario(name, log) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, 'scenarios', `${name}.cjs`), log], {
      cwd: OUT,
      env: { ...process.env, E2E_BASE_URL: BASE, E2E_SERVER_LOG: log, E2E_REPO: REPO, E2E_DATABASE_URL: DATABASE_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill(), 10 * 60_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      writeFileSync(join(OUT, `${name}.txt`), out);
      const ok = out.split('\n').filter((l) => l.startsWith('✓')).length;
      const ko = out.split('\n').filter((l) => l.startsWith('✗'));
      // Audit d'accessibilité : succès s'il se termine sans règle en échec.
      const a11y = name === 'accessibilite' ? /^0 règle\(s\) en échec/m.test(out) : true;
      const passed = code === 0 && !ko.length && a11y && (ok > 0 || name === 'accessibilite');
      resolveRun({ name, ok, ko, passed, seconds: Math.round((Date.now() - started) / 1000), out });
    });
  });
}

// ── Exécution ──
const results = [];
const main = run.filter((s) => s !== 'application-installable');
if (main.length) {
  const log = join(OUT, 'serveur.log');
  const server = await startServer(log);
  try {
    for (const name of main) {
      const r = await scenario(name, log);
      results.push(r);
      console.log(`${r.passed ? '✓' : '✗'} ${name.padEnd(24)} ${String(r.ok).padStart(3)} étape(s)${r.ko.length ? `, ${r.ko.length} en échec` : ''} — ${r.seconds} s`);
      for (const l of r.ko) console.log(`    ${l}`);
      if (!r.passed && !r.ko.length) console.log(r.out.split('\n').slice(-8).map((l) => `    ${l}`).join('\n'));
    }
  } finally {
    await stop(server);
  }
}
if (run.includes('application-installable')) {
  // Site de démonstration protégé : les fichiers de l'application installable doivent rester publics.
  const log = join(OUT, 'serveur-protege.log');
  const server = await startServer(log, { BILANX_BASIC_AUTH: 'demo:mot-de-passe-demo' });
  try {
    const r = await scenario('application-installable', log);
    results.push(r);
    console.log(`${r.passed ? '✓' : '✗'} ${'application-installable'.padEnd(24)} ${String(r.ok).padStart(3)} étape(s)${r.ko.length ? `, ${r.ko.length} en échec` : ''} — ${r.seconds} s`);
    for (const l of r.ko) console.log(`    ${l}`);
  } finally {
    await stop(server);
  }
}

const failed = results.filter((r) => !r.passed);
const steps = results.reduce((n, r) => n + r.ok, 0);
console.log(`\n${failed.length ? '✗' : '✓'} ${results.length - failed.length}/${results.length} scénario(s), ${steps} étape(s) réussie(s).`);
if (failed.length) console.log(`Détails et captures : ${OUT}`);
const shots = readdirSync(OUT).filter((f) => f.endsWith('.png') && f.includes('fail'));
if (failed.length && shots.length) console.log(`Captures d'échec : ${shots.join(', ')}`);
process.exit(failed.length ? 1 : 0);
