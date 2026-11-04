export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Développement uniquement : affiche l'e-mail dans la console du serveur.
 * Aucun prestataire d'envoi n'est encore branché. Règle : un e-mail ne contient
 * JAMAIS de donnée de santé.
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
