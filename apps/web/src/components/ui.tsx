import Link from 'next/link';

type Tone = 'glucose' | 'sage' | 'amber' | 'red' | 'petrol' | 'neutral';

const TONES: Record<Tone, string> = {
  glucose: 'bg-glucose-2 text-glucose',
  sage: 'bg-sage-2 text-sage',
  amber: 'bg-amber-2 text-amber',
  red: 'bg-red-2 text-red',
  petrol: 'bg-petrol-2 text-petrol',
  neutral: 'bg-surface-2 text-ink-2',
};

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  href,
  className = '',
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const cls = `card block min-w-0 p-5 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-petrol`}>
      {children}
    </Link>
  ) : (
    <section className={cls}>{children}</section>
  );
}

export function CardLabel({ tone, tag, children }: { tone: Tone; tag: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-3">
      <Chip tone={tone}>{tag}</Chip>
      {children}
    </div>
  );
}

export function Meta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs text-ink-3 ${className}`}>{children}</p>;
}

export function ButtonLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 font-medium ${
        primary ? 'border-petrol bg-petrol text-white' : 'border-line bg-surface text-ink hover:bg-surface-2'
      }`}
    >
      {children}
    </Link>
  );
}

/** Barre de répartition des temps glycémiques (couleur + libellé, jamais la couleur seule). */
export function RangeBar({ veryLow, low, inRange, high, veryHigh }: Record<'veryLow' | 'low' | 'inRange' | 'high' | 'veryHigh', number>) {
  const parts = [
    { v: veryLow, c: 'bg-[#9E2A1C]' },
    { v: low, c: 'bg-red' },
    { v: inRange, c: 'bg-sage' },
    { v: high, c: 'bg-amber' },
    { v: veryHigh, c: 'bg-[#B5552F]' },
  ];
  return (
    <div className="my-2 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Très bas ${pct(veryLow)}, bas ${pct(low)}, dans la cible ${pct(inRange)}, élevé ${pct(high)}, très élevé ${pct(veryHigh)}`}>
      {parts.map((p, i) => (
        <div key={i} className={p.c} style={{ width: `${p.v}%` }} />
      ))}
    </div>
  );
}

export const pct = (v: number) => `${Math.round(v)} %`;
