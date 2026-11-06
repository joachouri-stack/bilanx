/**
 * Au démarrage : vérification de l'envoi des e-mails. Chaque minute : rappels de prise (notifications) et capteur
 * FreeStyle Libre (LibreLinkUp, toutes les 5 min par profil).
 * Tâches de fond du serveur : effacement différé (comptes dont le délai de grâce est écoulé,
 * profils supprimés depuis plus de 30 jours, rapports partagés expirés). Exécuté au démarrage puis toutes
 * les 6 heures.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL || !process.env.BILANX_SECRET_KEY) return;
  const { privacy, mailer, sharing, reminders, libreLink } = await import('./lib/server/auth');
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
      const shared = await sharing().purgeExpired();
      if (shared) console.info(`Partages expirés : ${shared} rapport(s) effacé(s).`);
    } catch (e) {
      console.error('Effacement différé en échec :', (e as Error).message);
    }
  };
  // Rappels de prise : chaque minute.
  let busy = false;
  const remind = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = await reminders().runDue();
      if (n) console.info(`Rappels de prise : ${n} notification(s) envoyée(s).`);
    } catch (e) {
      console.error('Rappels de prise en échec :', (e as Error).message);
    } finally {
      busy = false;
    }
  };
  // Capteur FreeStyle Libre (LibreLinkUp) : chaque minute, les profils dont la dernière synchronisation a plus de 5 min.
  let libreBusy = false;
  const libre = async () => {
    if (libreBusy) return;
    libreBusy = true;
    try {
      const r = await libreLink().syncDue();
      if (r.failed) console.warn(`Capteur Libre : ${r.failed} synchronisation(s) en échec.`);
    } catch (e) {
      console.error('Capteur Libre en échec :', (e as Error).message);
    } finally {
      libreBusy = false;
    }
  };
  setTimeout(libre, 30_000).unref();
  setInterval(libre, 60_000).unref();
  setTimeout(remind, 15_000).unref();
  setInterval(remind, 60_000).unref();
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3_600_000).unref();
}
