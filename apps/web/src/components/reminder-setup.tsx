'use client';

import { useEffect, useState } from 'react';
import { pushSubscribeAction, pushUnsubscribeAction, reminderPrefsAction, sendTestPushAction } from '@/lib/server/actions';
import { Alert } from './forms';

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Rappels de prise par notification, sur l'appareil utilisé. Le compte et le profil affiché sont
 * côté serveur ; ici : autorisation du navigateur et abonnement de l'appareil.
 */
export function ReminderSetup({ vapidKey, enabled, showNames, profileName }: { vapidKey: string; enabled: boolean; showNames: boolean; profileName: string }) {
  const [state, setState] = useState<State>('loading');
  const [names, setNames] = useState(showNames);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && enabled && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [enabled]);

  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(vapidKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await pushSubscribeAction({ endpoint: json.endpoint, keys: json.keys }, names);
      if (!r.ok) return setMsg({ tone: 'error', text: r.error ?? 'Activation impossible.' });
      setState('on');
      setMsg({ tone: 'success', text: 'Rappels activés sur cet appareil.' });
    } catch {
      setMsg({ tone: 'error', text: 'Votre appareil n’a pas pu activer les notifications. Réessayez, ou utilisez les rappels par l’agenda.' });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if (sub) {
        await pushUnsubscribeAction(sub.endpoint);
        await sub.unsubscribe();
      }
      await reminderPrefsAction(false, false);
      setState('off');
      setMsg({ tone: 'info', text: 'Rappels désactivés sur cet appareil.' });
    } finally {
      setBusy(false);
    }
  }

  const btn = 'min-h-11 rounded-xl px-4 text-sm font-medium disabled:opacity-60';
  return (
    <div className="flex flex-col gap-3 text-sm" data-rappels={state}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {state === 'loading' && <p className="text-ink-3">Vérification de cet appareil…</p>}
      {state === 'unsupported' && <p className="text-ink-2">Ce navigateur ne permet pas les notifications. Utilisez les rappels par l’agenda (fiche de chaque traitement).</p>}
      {state === 'ios-install' && (
        <p className="text-ink-2">
          Sur iPhone, les notifications ne fonctionnent que si BILANX est <strong>installé sur l’écran d’accueil</strong> (Safari → Partager → Sur
          l’écran d’accueil). Ouvrez ensuite BILANX depuis cette icône et revenez ici.
        </p>
      )}
      {state === 'denied' && (
        <p className="text-ink-2">
          Les notifications de BILANX sont bloquées sur cet appareil. Autorisez-les dans les réglages du navigateur (ou du téléphone, rubrique
          Notifications), puis rechargez la page.
        </p>
      )}
      {(state === 'off' || state === 'on') && (
        <>
          <p className="text-ink-2">
            {state === 'on' ? (
              <>
                <strong>Activés sur cet appareil</strong> pour {profileName} : une notification à chaque heure de prise, sauf si la prise est déjà notée.
              </>
            ) : (
              <>Une notification à chaque heure de prise des traitements de {profileName}, même BILANX fermé, sauf si la prise est déjà notée.</>
            )}
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={names}
              onChange={async (e) => {
                setNames(e.target.checked);
                if (state === 'on') await reminderPrefsAction(true, e.target.checked);
              }}
              className="mt-0.5 size-4 accent-[var(--petrol)]"
            />
            <span>
              Afficher le nom du médicament dans la notification
              <span className="block text-xs text-ink-3">Sinon : « Prise de traitement prévue à 08 h 00 » (rien de lisible sur l’écran verrouillé).</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {state === 'off' ? (
              <button type="button" disabled={busy} onClick={activate} className={`${btn} bg-petrol text-on-accent`}>
                {busy ? 'Activation…' : '🔔 Activer les rappels sur cet appareil'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const r = await sendTestPushAction();
                    setMsg(r.sent ? { tone: 'success', text: 'Notification de test envoyée.' } : { tone: 'error', text: 'Aucun appareil n’a pu être joint.' });
                  }}
                  className={`${btn} border border-line`}
                >
                  Envoyer une notification de test
                </button>
                <button type="button" disabled={busy} onClick={deactivate} className={`${btn} text-ink-3 underline`}>
                  Désactiver sur cet appareil
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
