'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/shared/infra/client/supabase';
import { clearLocalData, pushIfChanged } from '../lib/progressSync';
import { SOURCE_URL } from './AuthGate';

// Shows who is logged in, lets them force a sync and log out
export default function AccountSection() {
  const sb = getSupabase();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    sb?.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
  }, [sb]);

  if (!sb) {
    return <p className='text-(--secondary-color)'>Sincronización no configurada (modo local).</p>;
  }

  return (
    <div className='flex flex-col gap-3'>
      <p className='text-(--secondary-color)'>
        Sesión: <span className='text-(--main-color)'>{email ?? '…'}</span>. Tu progreso se
        sincroniza solo entre tus dispositivos.
      </p>
      <div className='flex flex-wrap gap-2'>
        <button
          className='rounded-xl border-2 border-(--border-color) px-4 py-2'
          onClick={async () => {
            if (!userId) return;
            try {
              const r = await pushIfChanged(sb, userId);
              if (r === 'pulled') window.location.reload();
              setMsg(r === 'pushed' ? 'Progreso guardado en la nube' : 'Ya estaba al día');
            } catch {
              setMsg('No se pudo sincronizar');
            }
          }}
        >
          Sincronizar ahora
        </button>
        <button
          className='rounded-xl border-2 border-(--border-color) px-4 py-2'
          onClick={async () => {
            if (userId) await pushIfChanged(sb, userId).catch(() => undefined);
            // Save first, then leave no data behind on this device
            clearLocalData();
            await sb.auth.signOut();
            window.location.reload();
          }}
        >
          Cerrar sesión
        </button>
      </div>
      {msg && <p className='text-sm text-(--secondary-color)'>{msg}</p>}
      <a href={SOURCE_URL} target='_blank' rel='noopener noreferrer' className='text-xs text-(--secondary-color) underline'>
        Código fuente (AGPL-3.0, basado en KanaDojo)
      </a>
    </div>
  );
}
