import { createECDH, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfilesService, ForbiddenError, type Actor } from '@bilanx/profiles';
import { setupAuth, TEST_DB, tokenFrom } from '../../auth/test/helpers';
import { createMedicationsService, createRemindersService, vapidKeysFrom } from '../src';

const ece = createRequire(import.meta.url)('http_ece') as { decrypt: (b: Buffer, p: Record<string, unknown>) => Buffer };

/** Service de notification simulé : reçoit, vérifie l'en-tête VAPID et DÉCHIFFRE comme le ferait le téléphone. */
class FakePushService {
  server!: Server;
  port = 0;
  received: { device: string; payload: Record<string, string>; vapidKey: string; ttl: string; urgency: string }[] = [];
  status = 201;
  private devices = new Map<string, { ecdh: ReturnType<typeof createECDH>; auth: Buffer }>();
  async start() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const name = req.url!.slice(1);
        const d = this.devices.get(name);
        if (d && this.status < 300) {
          const plain = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth.toString('base64url') });
          const auth = String(req.headers.authorization ?? '');
          this.received.push({ device: name, payload: JSON.parse(plain.toString('utf8')), vapidKey: /k=([\w-]+)/.exec(auth)?.[1] ?? '', ttl: String(req.headers.ttl), urgency: String(req.headers.urgency) });
        }
        res.writeHead(this.status).end();
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as { port: number }).port;
  }
  /** Un « téléphone » : ses clés de chiffrement et son point d'envoi. */
  device(name: string) {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = randomBytes(16);
    this.devices.set(name, { ecdh, auth });
    return { endpoint: `http://127.0.0.1:${this.port}/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  }
  stop() {
    return new Promise<void>((r) => this.server.close(() => r()));
  }
}

describe.skipIf(!TEST_DB)('rappels de prise par notification (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let profiles: ReturnType<typeof createProfilesService>;
  let meds: ReturnType<typeof createMedicationsService>;
  let rem: ReturnType<typeof createRemindersService>;
  const push = new FakePushService();
  let jo: Actor, marc: Actor;
  let pid = '', metId = '';
  const at = (iso: string) => (ctx.clock.t = new Date(iso));

  async function createUser(email: string, name: string): Promise<Actor> {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: name, acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    const [a] = await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`;
    return { accountId: a!.id, email, displayName: name };
  }

  beforeAll(async () => {
    ctx = await setupAuth(); // 2026-11-04 10:00 UTC
    await push.start();
    const now = () => new Date(ctx.clock.t);
    profiles = createProfilesService({ sql: ctx.sql, mailer: ctx.mailer, appUrl: 'https://bilanx.test', now });
    meds = createMedicationsService({ profiles, now });
    rem = createRemindersService({ sql: ctx.sql, profiles, secretKey: Buffer.alloc(32, 7), appUrl: 'https://bilanx.test', now, allowInsecureEndpoints: true });
    jo = await createUser('jo@exemple.fr', 'Jo');
    marc = await createUser('marc@exemple.fr', 'Marc');
    pid = (await profiles.listProfiles(jo.accountId))[0]!.profileId;
    const m = await meds.save(jo, pid, { name: 'Metformine', strength: '1000 mg', posology: '1 comprimé matin et soir', times: ['08:00', '20:00'], qty: ['1 cp', '1 cp'], startDate: '2026-11-01' });
    if (!m.ok) throw new Error();
    metId = m.id;
  });
  afterAll(async () => {
    await push.stop();
    await ctx?.sql.end();
  });

  it('clés VAPID stables, dérivées de la clé maîtresse', () => {
    expect(vapidKeysFrom(Buffer.alloc(32, 7))).toEqual(vapidKeysFrom(Buffer.alloc(32, 7)));
    expect(vapidKeysFrom(Buffer.alloc(32, 8)).publicKey).not.toBe(rem.vapidPublicKey());
    expect(Buffer.from(rem.vapidPublicKey(), 'base64url')).toHaveLength(65);
  });

  it('abonnement : points d’envoi et clés invalides refusés', async () => {
    const ok = push.device('telephone-jo');
    expect(await rem.subscribe(jo, { ...ok, endpoint: 'http://exemple.fr/x' })).toMatchObject({ ok: false });
    expect(await rem.subscribe(jo, { ...ok, keys: { p256dh: '<script>', auth: 'x' } })).toMatchObject({ ok: false });
    expect(await rem.subscribe(jo, ok, 'iPhone')).toEqual({ ok: true });
    expect((await rem.devices(jo.accountId)).map((d) => d.user_agent)).toEqual(['iPhone']);
    // Sans compte autorisé sur le profil : activation refusée.
    await expect(rem.setPrefs(marc, pid, true, false)).rejects.toBeInstanceOf(ForbiddenError);
    await rem.setPrefs(jo, pid, true, false);
    expect(await rem.prefs(jo, pid)).toEqual({ enabled: true, showNames: false });
  });

  it('rappel à l’heure : notification chiffrée, signée, SANS le nom du médicament par défaut ; jamais deux fois', async () => {
    at('2026-11-04T07:03:00Z'); // 08:03 à Paris
    expect(await rem.runDue()).toBe(1);
    const n = push.received.at(-1)!;
    expect(n.vapidKey).toBe(rem.vapidPublicKey());
    expect(n).toMatchObject({ device: 'telephone-jo', ttl: '1800', urgency: 'high' });
    expect(n.payload).toMatchObject({ title: 'Prise de traitement', body: 'Prise prévue à 08 h 00. Ouvrez BILANX pour la noter.', url: '/medicaments' });
    expect(JSON.stringify(n.payload)).not.toMatch(/Metformine|1000/);
    at('2026-11-04T07:06:00Z');
    expect(await rem.runDue()).toBe(0); // déjà rappelée
    at('2026-11-04T07:30:00Z');
    expect(await rem.runDue()).toBe(0); // hors fenêtre
  });

  it('prise déjà renseignée : pas de rappel ; nom affiché si demandé', async () => {
    at('2026-11-04T18:55:00Z'); // 19:55 à Paris
    await meds.record(jo, pid, metId, new Date('2026-11-04T19:00:00Z'), 'taken');
    at('2026-11-04T19:02:00Z');
    expect(await rem.runDue()).toBe(0);
    await rem.setPrefs(jo, pid, true, true);
    at('2026-11-05T07:01:00Z');
    const before = push.received.length;
    expect(await rem.runDue()).toBe(1);
    expect(push.received.slice(before).map((r) => r.payload.title + ' | ' + r.payload.body)).toEqual(['Metformine 1000 mg | Prise de 08 h 00 : 1 cp']);
  });

  it('proche : rappels au nom du compte aidant tant qu’il a l’accès, arrêt dès qu’il le perd', async () => {
    await profiles.invite(jo, pid, { email: 'marc@exemple.fr', role: 'caregiver', permissions: { medications: 'read' } });
    await profiles.respondToInvitation(marc, tokenFrom(ctx.mailer.last('marc@exemple.fr')?.text), true);
    await rem.subscribe(marc, push.device('telephone-marc'));
    await rem.setPrefs(marc, pid, true, false);
    await rem.setPrefs(jo, pid, false, false);
    at('2026-11-05T19:01:00Z');
    const before = push.received.length;
    expect(await rem.runDue()).toBe(1);
    expect(push.received.slice(before).map((r) => [r.device, r.payload.title])).toEqual([['telephone-marc', 'Prise de traitement (Jo)']]);
    const access = (await profiles.listAccesses(jo, pid)).accesses.find((a) => a.email === 'marc@exemple.fr')!;
    await profiles.revokeAccess(jo, pid, access.id);
    at('2026-11-06T07:01:00Z');
    expect(await rem.runDue()).toBe(0);
    expect(await rem.prefs(marc, pid)).toEqual({ enabled: false, showNames: false }); // préférence retirée
  });

  it('appareil désabonné côté navigateur (410) : supprimé ; test d’envoi', async () => {
    expect(await rem.sendTest(jo)).toEqual({ sent: 1, devices: 1 });
    push.status = 410;
    expect(await rem.sendTest(jo)).toEqual({ sent: 0, devices: 1 });
    expect(await rem.devices(jo.accountId)).toEqual([]);
    push.status = 201;
  });
});
