/**
 * Au démarrage : vérification de l'envoi des e-mails.
 * Tâches de fond du serveur : effacement différé (comptes dont le délai de grâce est écoulé,
 * profils supprimés depuis plus de 30 jours). Exécuté au démarrage puis toutes les 6 heures.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL || !process.env.BILANX_SECRET_KEY) return;
  const { privacy, mailer } = await import('./lib/server/auth');
  const { SmtpMailer } = await import('@bilanx/auth');
  if (mailer instanceof SmtpMailer) {
    void mailer.verify().then((ok) => ok && console.info('E-mails : serveur SMTP joignable, envoi réel activé.'));
  } else {
    console.warn(
      'E-mails : aucun BILANX_SMTP_URL — les e-mails (avec leurs liens) sont seulement écrits dans ce journal. ' +
        'Acceptable pour une démonstration, pas pour de vrais utilisateurs.',
    );
  }
  const run = async () => {
    try {
      const r = await privacy().purge();
      if (r.accounts || r.profiles) console.info(`Effacement différé : ${r.accounts} compte(s), ${r.profiles} profil(s).`);
    } catch (e) {
      console.error('Effacement différé en échec :', (e as Error).message);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3_600_000).unref();
}
