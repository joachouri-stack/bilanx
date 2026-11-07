/**
 * Système de design partagé de BILANX (composants serveur, sans état).
 *
 * Règles communes :
 * - cibles tactiles d'au moins 44 px (min-h-11) ; boutons principaux 48 px (min-h-12) ;
 * - couleurs uniquement par jetons (globals.css) : clair et sombre sont gérés automatiquement ;
 * - jamais la couleur seule pour porter une information (toujours un libellé).
 *
 * Composants clients associés : `Sheet` (components/sheet.tsx), `DayNav` (components/day-nav.tsx),
 * `Icon` (components/icon.tsx).
 */
import Link from 'next/link';
import { Icon, type IconName } from './icon';

export type Tone = 'glucose' | 'sage' | 'amber' | 'red' | 'petrol' | 'violet' | 'rose' | 'indigo' | 'neutral';

const TONES: Record<Tone, string> = {
  glucose: 'bg-glucose-2 text-glucose',
  sage: 'bg-sage-2 text-sage',
  amber: 'bg-amber-2 text-amber',
  red: 'bg-red-2 text-red',
  petrol: 'bg-petrol-2 text-petrol',
  violet: 'bg-violet-2 text-violet',
  rose: 'bg-rose-2 text-rose',
  indigo: 'bg-indigo-2 text-indigo',
  neutral: 'bg-surface-2 text-ink-2',
};

/**
 * Teinte d'une carte selon sa rubrique : dégradé léger en haut et liseré de couleur (clair et sombre).
 * En style en ligne : la règle `.card` de globals.css fixe déjà le fond et l'ombre.
 */
const ACCENT_VAR: Record<Tone, [string, string]> = {
  glucose: ['--glucose-2', '--glucose'],
  sage: ['--sage-2', '--sage'],
  amber: ['--amber-2', '--amber'],
  red: ['--red-2', '--red'],
  petrol: ['--petrol-2', '--petrol'],
  violet: ['--violet-2', '--violet'],
  rose: ['--rose-2', '--rose'],
  indigo: ['--indigo-2', '--indigo'],
  neutral: ['--surface-2', '--line'],
};
function accentStyle(t: Tone): React.CSSProperties {
  const [soft, strong] = ACCENT_VAR[t];
  return {
    backgroundImage: `linear-gradient(180deg, var(${soft}) 0%, var(--surface) 150px)`,
    boxShadow: `inset 0 4px 0 var(${strong}), var(--shadow-card)`,
  };
}

/** Pastille de statut ou de catégorie (« Dans la cible », « Démo »…). */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

/**
 * En-tête de page : titre (h1, Fraunces), sous-titre court, actions.
 * Sur téléphone, les actions passent sous le titre (et peuvent être masquées avec `actionsMobile={false}`,
 * par exemple quand la page propose déjà la même action ailleurs).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  actionsMobile = true,
}: {
  title: string;
  /** Une ligne courte, en ink-2. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** `false` : actions masquées sous 640 px (`hidden sm:flex`). Par défaut `true`. */
  actionsMobile?: boolean;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className={`${actionsMobile ? 'flex' : 'hidden sm:flex'} flex-wrap items-center gap-2`}>{actions}</div>}
    </header>
  );
}

/** Carte : `<section>` (avec `id` éventuel pour une ancre) ou lien entier si `href` est fourni. */
export function Card({
  children,
  href,
  className = '',
  id,
  accent,
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
  id?: string;
  /** Teinte douce en haut de la carte (couleur de la rubrique). */
  accent?: Tone;
}) {
  const cls = `card block min-w-0 p-5 ${className}`;
  const style = accent ? accentStyle(accent) : undefined;
  return href ? (
    <Link href={href} className={`${cls} transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-petrol`} style={style}>
      {children}
    </Link>
  ) : (
    <section id={id} className={cls} style={style}>
      {children}
    </section>
  );
}

/** Étiquette de carte (pastille + texte libre). Préférer `CardHeader` pour les nouvelles cartes. */
export function CardLabel({ tone, tag, children }: { tone: Tone; tag: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-3">
      <Chip tone={tone}>{tag}</Chip>
      {children}
    </div>
  );
}

/**
 * En-tête de carte : titre (17 px, h2 par défaut), pastille facultative, action à droite (lien « Voir tout »…).
 * @example <CardHeader title="Glycémie" tag="Capteur" tagTone="glucose" action={<Link href="/glycemie">Détails</Link>} />
 */
export function CardHeader({
  title,
  tag,
  tagTone = 'neutral',
  action,
  as: H = 'h2',
  icon,
  iconTone = 'petrol',
}: {
  title: React.ReactNode;
  tag?: React.ReactNode;
  tagTone?: Tone;
  action?: React.ReactNode;
  /** Icône de rubrique dans une pastille colorée, à gauche du titre. */
  icon?: IconName;
  iconTone?: Tone;
  /** Niveau de titre : `h2` (défaut) ou `h3` dans une section déjà titrée. */
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONES[iconTone]}`} aria-hidden>
            <Icon name={icon} className="size-5" />
          </span>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <H className="text-[17px] font-semibold leading-6">{title}</H>
          {tag && <Chip tone={tagTone}>{tag}</Chip>}
        </div>
      </div>
      {action && <div className="shrink-0 whitespace-nowrap text-sm">{action}</div>}
    </div>
  );
}

/**
 * Chiffre clé : libellé, valeur en grand, unité, précision.
 * @example <Stat label="Temps dans la cible" value="72" unit="%" hint="14 derniers jours" />
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  size = 'lg',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  /** `lg` : text-4xl (chiffre principal d'une carte) ; `md` : text-2xl (grille de chiffres). */
  size?: 'lg' | 'md';
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
        <span className={`tabular leading-tight ${size === 'lg' ? 'text-4xl font-bold tracking-tight' : 'text-2xl font-semibold'}`}>{value}</span>
        {unit && <span className="text-base text-ink-3">{unit}</span>}
      </p>
      {hint && <Meta className="mt-1">{hint}</Meta>}
    </div>
  );
}

/** État vide : ce qui manque et, si possible, l'action pour le remplir. Jamais de donnée inventée. */
export function EmptyState({ title, description, action }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-prose text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Sélecteur à segments (périodes, vues) fait de liens : pleine largeur sur téléphone, compact au-delà de 640 px.
 * Le segment courant porte `aria-current="page"` ; son texte est exactement `label`.
 * @example <Segmented label="Période" items={[{ href: '?periode=7', label: '7 j', current: true }, …]} />
 */
export function Segmented({ items, label }: { items: { href: string; label: string; current: boolean }[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="grid w-full gap-1 rounded-xl bg-surface-2 p-1 sm:inline-flex sm:w-auto"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.current ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
            it.current ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:bg-surface hover:text-ink'
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Zone à défilement (tableau large, liste longue) : atteignable au clavier et annoncée par son nom
 * (WCAG 2.1.1 : sinon le contenu masqué est inaccessible sans souris).
 */
export function ScrollRegion({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-petrol ${className}`}>
      {children}
    </div>
  );
}

/** Texte secondaire (source, date, précision), 13 px. */
export function Meta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[13px] leading-5 text-ink-3 ${className}`}>{children}</p>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'min-h-12 rounded-xl bg-petrol px-5 font-semibold text-on-accent hover:opacity-90',
  secondary: 'min-h-12 rounded-xl border border-line bg-surface px-5 font-medium text-ink hover:bg-surface-2',
  ghost: 'min-h-11 rounded-lg px-3 font-medium text-petrol hover:bg-petrol-2',
  danger: 'min-h-12 rounded-xl border border-line bg-surface px-5 font-medium text-red hover:bg-red-2',
};

/**
 * Classes d'un bouton BILANX, pour un élément qui ne peut pas utiliser `Button` ou `ButtonLink`
 * (bouton de formulaire client, `<summary>`…).
 */
export function buttonClass({ variant = 'secondary', size = 'md', className = '' }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return [
    // « whitespace-nowrap » par défaut ; un « whitespace-… » passé dans className le remplace (sinon l'ordre du CSS l'emporterait).
    `inline-flex select-none items-center justify-center gap-2 ${/(^|\s)whitespace-/.test(className) ? '' : 'whitespace-nowrap '}transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50`,
    VARIANTS[variant],
    size === 'lg' ? 'min-h-14 px-6 text-[17px]' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Bouton (`<button>`, `type="button"` par défaut). Accepte tous les attributs d'un bouton HTML
 * (`type="submit"`, `formAction`, `disabled`, `aria-*`, `onClick` dans un composant client…).
 * @example <Button variant="primary" type="submit">Enregistrer</Button>
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...rest} />;
}

/**
 * Lien présenté comme un bouton (mêmes variantes que `Button`).
 * `primary` est conservé pour compatibilité (équivaut à `variant="primary"`).
 * @example <ButtonLink href="/analyses/ajouter" variant="primary">Ajouter un résultat</ButtonLink>
 */
export function ButtonLink({
  href,
  children,
  primary = false,
  variant,
  size = 'md',
  className = '',
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  /** @deprecated utiliser `variant="primary"`. */
  primary?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  'aria-label'?: string;
  'aria-current'?: React.AriaAttributes['aria-current'];
  prefetch?: boolean;
}) {
  return (
    <Link href={href} className={buttonClass({ variant: variant ?? (primary ? 'primary' : 'secondary'), size, className })} {...rest}>
      {children}
    </Link>
  );
}

/** Barre de répartition des temps glycémiques (couleur + libellé, jamais la couleur seule). */
export function RangeBar({ veryLow, low, inRange, high, veryHigh }: Record<'veryLow' | 'low' | 'inRange' | 'high' | 'veryHigh', number>) {
  const parts = [
    { v: veryLow, c: 'bg-red-strong' },
    { v: low, c: 'bg-red' },
    { v: inRange, c: 'bg-sage' },
    { v: high, c: 'bg-amber' },
    { v: veryHigh, c: 'bg-orange' },
  ];
  return (
    <div className="my-2 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Très bas ${pct(veryLow)}, bas ${pct(low)}, dans la cible ${pct(inRange)}, élevé ${pct(high)}, très élevé ${pct(veryHigh)}`}>
      {parts.map((p, i) => (
        <div key={i} className={p.c} style={{ width: `${p.v}%` }} />
      ))}
    </div>
  );
}

/** Pourcentage arrondi, avec l'espace français : `pct(71.6)` → « 72 % ». */
export const pct = (v: number) => `${Math.round(v)} %`;
