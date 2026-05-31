import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { insforge } from '../lib/insforge';
import { useAuth } from '../hooks/useAuth';
import SacredBackground from '../components/SacredBackground';

export default function AuthPage() {
  const { user, loading, refresh } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const redirectTo = `${window.location.origin}/auth`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (needsVerification) {
        const { error: verifyError } = await insforge.auth.verifyEmail({
          email,
          otp,
        });
        if (verifyError) throw verifyError;
        setNeedsVerification(false);
        setMode('signin');
        setError('');
        alert('Email verified. Please sign in.');
        return;
      }

      if (mode === 'signup') {
        const { data, error: signUpError } = await insforge.auth.signUp({
          email,
          password,
          name: name || email.split('@')[0],
          redirectTo,
        });
        if (signUpError) throw signUpError;

        if (data?.requireEmailVerification) {
          setNeedsVerification(true);
          return;
        }

        if (data?.accessToken) {
          await refresh();
          return;
        }
      } else {
        const { error: signInError } = await insforge.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    setError('');
    await insforge.auth.signInWithOAuth({
      provider,
      redirectTo: window.location.origin,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <SacredBackground />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-saffron-400 tracking-tight">Sarvajna</h1>
          <p className="text-stone-400 mt-2 text-sm">
            One place for GPT-4o, Claude Sonnet & Gemini Flash — plus your documents
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-8 shadow-xl shadow-black/40">
          <div className="flex gap-2 mb-6 p-1 bg-ink-950 rounded-lg">
            <button
              type="button"
              onClick={() => { setMode('signin'); setNeedsVerification(false); }}
              className={`flex-1 py-2 text-sm rounded-md transition ${mode === 'signin' ? 'bg-saffron-600 text-white' : 'text-stone-400 hover:text-stone-200'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setNeedsVerification(false); }}
              className={`flex-1 py-2 text-sm rounded-md transition ${mode === 'signup' ? 'bg-saffron-600 text-white' : 'text-stone-400 hover:text-stone-200'}`}
            >
              Sign up
            </button>
          </div>

          {needsVerification ? (
            <p className="text-sm text-stone-400 mb-4">
              Enter the 6-digit code sent to <strong className="text-stone-200">{email}</strong>
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && !needsVerification ? (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-ink-950 border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-saffron-500"
              />
            ) : null}

            {!needsVerification ? (
              <>
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-ink-950 border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-saffron-500"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-ink-950 border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-saffron-500"
                />
              </>
            ) : (
              <input
                type="text"
                required
                maxLength={6}
                placeholder="Verification code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 bg-ink-950 border border-stone-700 rounded-lg text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-saffron-500 tracking-widest text-center text-lg"
              />
            )}

            {error ? (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 bg-saffron-600 hover:bg-saffron-500 disabled:opacity-50 text-white font-medium rounded-lg transition"
            >
              {busy ? 'Please wait…' : needsVerification ? 'Verify email' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {!needsVerification ? (
            <>
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-stone-800" />
                <span className="text-xs text-stone-500">or continue with</span>
                <div className="flex-1 h-px bg-stone-800" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  className="py-2.5 border border-stone-700 rounded-lg text-sm text-stone-300 hover:bg-ink-950 transition"
                >
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('github')}
                  className="py-2.5 border border-stone-700 rounded-lg text-sm text-stone-300 hover:bg-ink-950 transition"
                >
                  GitHub
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
