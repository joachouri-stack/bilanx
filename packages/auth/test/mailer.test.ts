import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { ConsoleMailer, mailerFromEnv, maskEmail, SmtpMailer } from '../src/mailer';

/** Décodage quoted-printable minimal (corps des messages reçus). */
const qp = (s: string) =>
  Buffer.from(
    s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1',
  ).toString('utf8');

describe('envoi des e-mails par SMTP', () => {
  const received: { from: string; to: string[]; raw: string; user?: string }[] = [];
  let server: SMTPServer;
  let port = 0;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true, // serveur de test local, sans TLS
      disabledCommands: ['STARTTLS'],
      onAuth(auth, _s, cb) {
        if (auth.username === 'bilanx' && auth.password === 'p@ss:word') cb(null, { user: auth.username });
        else cb(new Error('Identifiants refusés'));
      },
      onData(stream, session, cb) {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
            to: session.envelope.rcptTo.map((r) => r.address),
            raw: Buffer.concat(chunks).toString('latin1'),
            user: session.user as string | undefined,
          });
          cb();
        });
      },
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('envoie un message authentifié, en UTF-8, marqué comme automatique', async () => {
    const m = new SmtpMailer({ url: `smtp://bilanx:${encodeURIComponent('p@ss:word')}@127.0.0.1:${port}`, from: 'BILANX <no-reply@bilanx.fr>' });
    expect(await m.verify()).toBe(true);
    await m.send({ to: 'jo@exemple.fr', subject: 'Confirmez votre adresse e-mail BILANX', text: 'Bienvenue sur BILANX.\nLien : https://bilanx.fr/verifier-email?jeton=abc — à usage unique.' });
    const r = received.at(-1)!;
    expect(r).toMatchObject({ from: 'no-reply@bilanx.fr', to: ['jo@exemple.fr'], user: 'bilanx' });
    expect(r.raw).toMatch(/^Subject: Confirmez votre adresse e-mail BILANX/m);
    expect(r.raw).toMatch(/^Auto-Submitted: auto-generated/m);
    expect(qp(r.raw)).toContain('https://bilanx.fr/verifier-email?jeton=abc — à usage unique.');
  });

  it('identifiants refusés ou serveur absent : aucune exception, journal sans contenu ni adresse complète', async () => {
    const logs: string[] = [];
    const logger = { error: (s: string) => logs.push(s), info: () => {} };
    const bad = new SmtpMailer({ url: `smtp://bilanx:faux@127.0.0.1:${port}`, from: 'no-reply@bilanx.fr', logger, retryDelayMs: 10 });
    await expect(bad.send({ to: 'jo@exemple.fr', subject: 'Réinitialisation', text: 'jeton=SECRET123' })).resolves.toBeUndefined();
    const down = new SmtpMailer({ url: 'smtp://127.0.0.1:1', from: 'no-reply@bilanx.fr', logger, retryDelayMs: 10 });
    await expect(down.send({ to: 'marc@exemple.fr', subject: 'Invitation', text: 'jeton=SECRET456' })).resolves.toBeUndefined();
    expect(await down.verify()).toBe(false);
    expect(logs.slice(0, 2)).toEqual([
      expect.stringContaining('échec d’envoi'.replace('’', "'") + ' à j…@exemple.fr'),
      expect.stringContaining('à m…@exemple.fr'),
    ]);
    expect(logs.join('\n')).not.toMatch(/SECRET|jo@|marc@/);
  });

  it('configuration par variables d’environnement', () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
    expect(mailerFromEnv({ BILANX_SMTP_URL: 'smtps://u:p@smtp.exemple.fr' })).toBeInstanceOf(SmtpMailer);
    expect(() => mailerFromEnv({ BILANX_SMTP_URL: 'http://smtp.exemple.fr' })).toThrow(/smtp:\/\//);
    expect(maskEmail('claire.martin@exemple.fr')).toBe('c…@exemple.fr');
  });
});
