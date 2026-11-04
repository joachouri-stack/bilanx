/**
 * Tâches de fond du serveur : effacement différé (comptes dont le délai de grâce est écoulé,
 * profils supprimés depuis plus de 30 jours). Exécuté au démarrage puis toutes les 6 heures.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL || !process.env.BILANX_SECRET_KEY) return;
  const { privacy } = await import('./lib/server/auth');
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
