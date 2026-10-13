'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { getSupabase } from '@/shared/infra/client/supabase';
import { clearLocalData, pushIfChanged } from '../lib/progressSync';

// Game screens use the top-right corner for their own stats button
const HIDDEN_ON = ['/train', '/learn', '/blitz', '/gauntlet'];

/** Top-right account button: shows the email, syncs, logs out or switches account */
export default function AccountMenu() {
  const sb = getSupabase();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sb) return;
    const load = () =>
      sb.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setUserId(data.user?.id ?? null);
      });
    void load();
    const { data } = sb.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!sb || !userId || HIDDEN_ON.some(p => pathname?.includes(p))) return null;

  const logout = async () => {
    await pushIfChanged(sb, userId).catch(() => undefined);
    // Leave nothing behind so another account starts clean on this device
    clearLocalData();
    await sb.auth.signOut();
    window.location.reload();
  };

  return (
    <div ref={ref} className='fixed top-3 right-3 z-[90]'>
      <button
        onClick={() => setOpen(!open)}
        aria-label='Cuenta'
        className='flex h-11 w-11 items-center justify-center rounded-full border-2 border-(--border-color) bg-(--card-color) text-(--main-color) hover:cursor-pointer'
      >
        {email ? (
          <span className='text-lg font-bold uppercase'>{email[0]}</span>
        ) : (
          <UserRound size={22} />
        )}
      </button>
      {open && (
        <div className='absolute right-0 mt-2 flex w-64 flex-col gap-2 rounded-2xl border-2 border-(--border-color) bg-(--card-color) p-3 shadow-lg'>
          <p className='truncate text-sm text-(--secondary-color)'>
            Sesión: <span className='text-(--main-color)'>{email}</span>
          </p>
          <button
            className='rounded-xl border-2 border-(--border-color) px-3 py-2 text-left hover:cursor-pointer'
            onClick={async () => {
              try {
                const r = await pushIfChanged(sb, userId);
                if (r === 'pulled') window.location.reload();
                setMsg(r === 'pushed' ? 'Progreso guardado' : 'Ya estaba al día');
              } catch {
                setMsg('No se pudo sincronizar');
              }
            }}
          >
            Sincronizar ahora
          </button>
          <button
            className='rounded-xl border-2 border-(--border-color) px-3 py-2 text-left hover:cursor-pointer'
            onClick={logout}
          >
            Cambiar de cuenta
          </button>
          <button
            className='rounded-xl border-2 border-(--border-color) px-3 py-2 text-left text-red-500 hover:cursor-pointer'
            onClick={logout}
          >
            Cerrar sesión
          </button>
          {msg && <p className='text-xs text-(--secondary-color)'>{msg}</p>}
        </div>
      )}
    </div>
  );
}
