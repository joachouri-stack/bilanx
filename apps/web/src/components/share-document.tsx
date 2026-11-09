'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { buttonClass } from './ui';

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Nom de fichier lisible et sûr : « Ordonnance du Dr Martin.pdf », « IRM du genou - p2.jpg ». */
function fileName(title: string, page: number, pages: number, mime: string) {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Document';
  return `${base}${pages > 1 ? ` - p${page}` : ''}.${EXT[mime] ?? 'bin'}`;
}

/**
 * Partager l'original d'un document (e-mail, WhatsApp, Messages, AirDrop…) par la feuille de partage du téléphone.
 * Les fichiers sont préparés à l'ouverture de la page : iOS n'ouvre la feuille de partage que tout de suite après l'appui.
 * Sans feuille de partage (la plupart des ordinateurs) : le fichier est téléchargé, à joindre soi-même.
 */
export function ShareDocument({ id, title, pageCount }: { id: string; title: string; pageCount: number }) {
  const files = useRef<File[] | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (): Promise<File[]> => {
    if (files.current) return files.current;
    const list = await Promise.all(
      Array.from({ length: pageCount }, async (_, i) => {
        const r = await fetch(`/api/documents/${id}/pages/${i + 1}`, { credentials: 'same-origin' });
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        const mime = (r.headers.get('content-type') ?? blob.type).split(';')[0]!.trim();
        return new File([blob], fileName(title, i + 1, pageCount, mime), { type: mime });
      }),
    );
    // Un PDF contient toutes ses pages : un seul fichier.
    files.current = list[0]?.type === 'application/pdf' ? list.slice(0, 1) : list;
    return files.current;
  };

  useEffect(() => {
    load()
      .then(() => setReady(true))
      .catch(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- préparation unique à l'ouverture
  }, [id]);

  const download = (list: File[]) => {
    for (const f of list) {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    setMessage(list.length > 1 ? 'Fichiers téléchargés : joignez-les à votre e-mail ou message.' : 'Fichier téléchargé : joignez-le à votre e-mail ou message.');
  };

  const share = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const list = await load();
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: list })) {
        try {
          await navigator.share({ files: list, title });
        } catch (e) {
          // Feuille fermée sans partager : rien à signaler.
          if ((e as Error).name !== 'AbortError') download(list);
        }
      } else download(list);
    } catch {
      setMessage('Le document n’a pas pu être préparé. Vérifiez la connexion puis réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={share} disabled={busy} aria-busy={!ready || busy} className={buttonClass({ variant: 'secondary', className: 'w-full sm:w-auto' })}>
        <Icon name="share" className="size-5" />
        {busy ? 'Préparation…' : 'Partager'}
      </button>
      {message && (
        <p role="status" className="text-[13px] text-ink-2">
          {message}
        </p>
      )}
    </div>
  );
}
