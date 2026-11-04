'use client';

import { useFormStatus } from 'react-dom';
import { useId, useState } from 'react';

export function Field({
  label,
  name,
  type = 'text',
  error,
  hint,
  defaultValue,
  autoComplete,
  required = true,
  inputMode,
  maxLength,
  autoFocus,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
  autoComplete?: string;
  required?: boolean;
  inputMode?: 'numeric' | 'text' | 'email';
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={isPassword && show ? 'text' : type}
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          required={required}
          inputMode={inputMode}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={`min-h-12 w-full rounded-xl border bg-surface px-3.5 text-base outline-none focus:border-petrol focus:ring-2 focus:ring-petrol-2 ${
            error ? 'border-red' : 'border-line'
          } ${isPassword ? 'pr-24' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-2 my-auto h-9 rounded-lg px-2.5 text-sm text-ink-2 hover:bg-surface-2"
            aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {show ? 'Masquer' : 'Afficher'}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel = 'Patientez…' }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-xl bg-petrol px-4 font-semibold text-white transition-opacity disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Alert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'bg-red-2 text-red' : tone === 'success' ? 'bg-sage-2 text-ink' : 'bg-petrol-2 text-ink';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
