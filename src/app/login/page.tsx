'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setBusy(false);
        return;
      }
      // Selon la configuration Supabase, une confirmation e-mail peut être requise.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setNotice('Compte créé. Confirme ton e-mail puis connecte-toi.');
        setMode('signin');
        setBusy(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
        return;
      }
    }

    router.push('/live');
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7">
        <h1 className="text-lg font-bold tracking-[0.2em]">AWC LIVE</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">Straight Line Copilot</p>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            autoComplete="email"
            className="field"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="field"
          />

          {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}
          {notice && <p className="text-sm text-[var(--color-accent)]">{notice}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-xs text-[var(--color-muted)] hover:text-white"
        >
          {mode === 'signin' ? 'Premier accès — créer le compte' : "J'ai déjà un compte"}
        </button>
      </div>
    </main>
  );
}
