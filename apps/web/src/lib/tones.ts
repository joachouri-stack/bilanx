/**
 * Couleurs nommées (jetons de globals.css) en classes Tailwind écrites en entier
 * (Tailwind ne voit que les classes littérales).
 */
export type ToneName = 'petrol' | 'sage' | 'glucose' | 'amber' | 'red' | 'violet' | 'rose' | 'indigo' | 'neutral';

export const TONES: Record<ToneName, { soft: string; text: string; solid: string; glow: string; ring: string }> = {
  petrol: { soft: 'bg-petrol-2 text-petrol', text: 'text-petrol', solid: 'bg-petrol text-on-accent', glow: 'bg-petrol/25', ring: 'ring-petrol' },
  sage: { soft: 'bg-sage-2 text-sage', text: 'text-sage', solid: 'bg-sage text-on-accent', glow: 'bg-sage/25', ring: 'ring-sage' },
  glucose: { soft: 'bg-glucose-2 text-glucose', text: 'text-glucose', solid: 'bg-glucose text-on-accent', glow: 'bg-glucose/25', ring: 'ring-glucose' },
  amber: { soft: 'bg-amber-2 text-amber', text: 'text-amber', solid: 'bg-amber text-on-accent', glow: 'bg-amber/25', ring: 'ring-amber' },
  red: { soft: 'bg-red-2 text-red', text: 'text-red', solid: 'bg-red text-on-accent', glow: 'bg-red/25', ring: 'ring-red' },
  violet: { soft: 'bg-violet-2 text-violet', text: 'text-violet', solid: 'bg-violet text-on-accent', glow: 'bg-violet/25', ring: 'ring-violet' },
  rose: { soft: 'bg-rose-2 text-rose', text: 'text-rose', solid: 'bg-rose text-on-accent', glow: 'bg-rose/25', ring: 'ring-rose' },
  indigo: { soft: 'bg-indigo-2 text-indigo', text: 'text-indigo', solid: 'bg-indigo text-on-accent', glow: 'bg-indigo/25', ring: 'ring-indigo' },
  neutral: { soft: 'bg-surface-2 text-ink-2', text: 'text-ink-2', solid: 'bg-ink-2 text-surface', glow: 'bg-ink-3/15', ring: 'ring-ink-3' },
};
