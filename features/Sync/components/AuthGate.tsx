'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/shared/infra/client/supabase';
import { useMounted } from '@/shared/hooks/generic/useMounted';
import {
  forcePush,
  isFirstSyncOnDevice,
  localHasProgress,
  pullIfNewer,
  pushIfChanged,
} from '../lib/progressSync';

const PUSH_EVERY_MS = 20_000;
const MIN_PASSWORD = 6;
export const SOURCE_URL = 'https://github.com/Mrpirolito/kana-practica';

type Mode = 'login' | 'signup' | 'forgot' | 'recover';

const ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Confirma tu email antes de entrar (revisa tu correo)',
  'User already registered': 'Ya existe una cuenta con ese email',
};
const translate = (msg: string) => ERRORS[msg] ?? msg;

/**
 * When sync is configured the app requires an account and keeps all local data
 * synced between devices. Without config (local dev) it renders nothing.
 */
export default function AuthGate() {
  const sb = getSupabase();
  // Supabase only exists in the browser: render nothing until mounted to keep hydration stable
  const mounted = useMounted();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!sb);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      // Arrived from the reset-password email: ask for the new password first
      if (event === 'PASSWORD_RECOVERY') setMode('recover');
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  // Pull on login/startup, then push changes periodically and when leaving the page
  useEffect(() => {
    if (!sb || !session || mode === 'recover') return;
    const userId = session.user.id;
    let stopped = false;
    const sync = () =>
      pushIfChanged(sb, userId)
        .then(r => {
          if (r === 'pulled' && !stopped) window.location.reload();
        })
        .catch(e => console.warn('[sync]', e));
    // First login on a device that already has progress: let the user pick which copy wins
    const keepThisDevice =
      isFirstSyncOnDevice(userId) &&
      localHasProgress() &&
      window.confirm(
        'Este dispositivo ya tiene progreso guardado.\n\n' +
          'Aceptar: subir el progreso de ESTE dispositivo a tu cuenta (reemplaza el de la nube).\n' +
          'Cancelar: usar el progreso de tu cuenta (reemplaza el de este dispositivo).',
      );
    (keepThisDevice ? forcePush(sb, userId).then(() => false) : pullIfNewer(sb, userId))
      .then(pulled => (pulled ? window.location.reload() : sync()))
      .catch(e => console.warn('[sync]', e));
    const timer = setInterval(sync, PUSH_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [sb, session, mode]);

  if (!mounted || !sb || (session && mode !== 'recover')) return null;

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if ((mode === 'signup' || mode === 'recover') && password !== password2) {
      return setError('Las contraseñas no coinciden');
    }
    if ((mode === 'signup' || mode === 'recover') && password.length < MIN_PASSWORD) {
      return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    }
    setBusy(true);
    const redirectTo = window.location.origin;
    if (mode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(translate(error.message));
    } else if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) setError(translate(error.message));
      else if (!data.session) {
        switchMode('login');
        setInfo('Cuenta creada. Confirma el email que te hemos enviado y luego entra aquí.');
      }
    } else if (mode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) setError(translate(error.message));
      else setInfo('Si existe esa cuenta, te llegará un email para cambiar la contraseña.');
    } else {
      const { error } = await sb.auth.updateUser({ password });
      if (error) setError(translate(error.message));
      else switchMode('login');
    }
    setBusy(false);
  };

  const input =
    'rounded-2xl border-2 border-(--border-color) bg-(--background-color) px-4 py-3 text-(--main-color)';
  const title: Record<Mode, string> = {
    login: 'Inicia sesión para estudiar',
    signup: 'Crea tu cuenta',
    forgot: 'Recuperar contraseña',
    recover: 'Elige tu nueva contraseña',
  };
  const button: Record<Mode, string> = {
    login: 'Entrar',
    signup: 'Crear cuenta',
    forgot: 'Enviar email',
    recover: 'Guardar contraseña',
  };

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-(--background-color) p-4'>
      {ready && (
        <form
          onSubmit={submit}
          className='flex w-full max-w-sm flex-col gap-3 rounded-3xl border-2 border-(--border-color) bg-(--card-color) p-6'
        >
          <h1 className='text-center text-3xl font-bold text-(--main-color)'>かな</h1>
          {(mode === 'login' || mode === 'signup') && (
            <div className='grid grid-cols-2 gap-1 rounded-2xl bg-(--background-color) p-1'>
              {(['login', 'signup'] as Mode[]).map(m => (
                <button
                  key={m}
                  type='button'
                  onClick={() => switchMode(m)}
                  className={clsx(
                    'rounded-xl py-2 text-sm font-semibold',
                    mode === m ? 'bg-(--main-color) text-white' : 'text-(--secondary-color)',
                  )}
                >
                  {m === 'login' ? 'Entrar' : 'Registrarse'}
                </button>
              ))}
            </div>
          )}
          <p className='text-center text-(--secondary-color)'>{title[mode]}</p>
          {mode !== 'recover' && (
            <input
              type='email'
              autoComplete='email'
              required
              placeholder='Email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={input}
            />
          )}
          {mode !== 'forgot' && (
            <input
              type='password'
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              placeholder={mode === 'login' ? 'Contraseña' : 'Nueva contraseña'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={input}
            />
          )}
          {(mode === 'signup' || mode === 'recover') && (
            <input
              type='password'
              autoComplete='new-password'
              required
              placeholder='Repite la contraseña'
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              className={input}
            />
          )}
          {error && <p className='text-center text-sm text-red-500'>{error}</p>}
          {info && <p className='text-center text-sm text-green-500'>{info}</p>}
          <button
            disabled={busy}
            className='rounded-2xl bg-(--main-color) px-4 py-3 font-semibold text-white disabled:opacity-60'
          >
            {busy ? 'Un momento…' : button[mode]}
          </button>
          {mode === 'login' && (
            <button
              type='button'
              onClick={() => switchMode('forgot')}
              className='text-sm text-(--secondary-color) underline'
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type='button'
              onClick={() => switchMode('login')}
              className='text-sm text-(--secondary-color) underline'
            >
              Volver
            </button>
          )}
          <a
            href={SOURCE_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-center text-xs text-(--secondary-color)'
          >
            Código fuente (AGPL-3.0, basado en KanaDojo)
          </a>
        </form>
      )}
    </div>
  );
}
