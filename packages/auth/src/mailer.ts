import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Sans prestataire configuré (développement, démonstration) : affiche l'e-mail dans le journal
 * du serveur, liens compris. À ne pas utiliser avec de vrais comptes : voir `SmtpMailer`.
 * Règle pour tous les envois : un e-mail ne contient JAMAIS de donnée de santé.
 */
export class ConsoleMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    console.info(`\n──── E-mail (non envoyé, mode développement) ────\nÀ : ${m.to}\nObjet : ${m.subject}\n\n${m.text}\n─────────────────────────────────────────────────\n`);
  }
}

/** Pour les tests : conserve les messages en mémoire. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(m: MailMessage): Promise<void> {
    this.sent.push(m);
  }
  last(to?: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => !to || m.to === to);
  }
}

export interface SmtpMailerOptions {
  /** smtp://utilisateur:motdepasse@hote:587 (STARTTLS exigé) ou smtps://…:465 (TLS direct). */
  url: string;
  /** Expéditeur, ex. « BILANX <no-reply@bilanx.fr> ». */
  from: string;
  logger?: Pick<Console, 'error' | 'info'>;
  /** Délai avant la seconde tentative (ms). */
  retryDelayMs?: number;
}

/** « jo@exemple.fr » → « j…@exemple.fr » : jamais d'adresse complète dans les journaux. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? `${email[0]}…${email.slice(at)}` : '…';
}

/**
 * Envoi réel par SMTP (prestataire d'e-mails transactionnels). N'échoue JAMAIS vers l'appelant :
 * une erreur ne doit ni bloquer un parcours (le lien peut être redemandé), ni révéler qu'un compte
 * existe (l'inscription répond pareil dans les deux cas). Deux tentatives, puis l'échec est
 * journalisé sans le contenu (qui contient des liens à usage unique) et avec l'adresse masquée.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly log: Pick<Console, 'error' | 'info'>;

  constructor(private readonly opts: SmtpMailerOptions) {
    const u = new URL(opts.url);
    if (u.protocol !== 'smtp:' && u.protocol !== 'smtps:') throw new Error('BILANX_SMTP_URL doit commencer par smtp:// ou smtps://');
    const secure = u.protocol === 'smtps:';
    const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
    this.transport = createTransport({
      host: u.hostname,
      port: Number(u.port) || (secure ? 465 : 587),
      secure,
      // Hors poste local, chiffrement obligatoire : STARTTLS exigé sur le port de soumission.
      requireTLS: !secure && !local,
      auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.log = opts.logger ?? console;
  }

  async send(m: MailMessage): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.transport.sendMail({
          from: this.opts.from,
          to: m.to,
          subject: m.subject,
          text: m.text,
          headers: { 'Auto-Submitted': 'auto-generated' },
        });
        return;
      } catch (e) {
        if (attempt === 2) {
          const code = (e as { code?: string; responseCode?: number }).responseCode ?? (e as { code?: string }).code ?? 'inconnu';
          this.log.error(`[e-mail] échec d'envoi à ${maskEmail(m.to)} (« ${m.subject} ») : ${code}`);
          return;
        }
        await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? 1000));
      }
    }
  }

  /** Vérifie la connexion et l'authentification auprès du serveur SMTP (au démarrage). */
  async verify(): Promise<boolean> {
    try {
      await this.transport.verify();
      return true;
    } catch (e) {
      this.log.error(`[e-mail] serveur SMTP injoignable ou identifiants refusés : ${(e as { code?: string }).code ?? (e as Error).message}`);
      return false;
    }
  }
}

/**
 * SMTP si `BILANX_SMTP_URL` est défini, sinon affichage dans le journal du serveur
 * (développement, site de démonstration sans prestataire d'e-mails).
 */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const url = env.BILANX_SMTP_URL?.trim();
  if (!url) return new ConsoleMailer();
  return new SmtpMailer({ url, from: env.BILANX_MAIL_FROM?.trim() || 'BILANX <no-reply@bilanx.fr>' });
}
