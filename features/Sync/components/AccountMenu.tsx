'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabase } from '@/shared/infra/client/supabase';
import { clearLocalData, pushIfChanged } from '../lib/progressSync';
import { useProfileStore } from '../lib/profile';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import StyledName from './StyledName';

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
  const [editing, setEditing] = useState(false);
  const profile = useProfileStore(s => s.profile);
  const loadProfile = useProfileStore(s => s.load);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sb) return;
    const load = () =>
      sb.auth.getUser().then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setUserId(data.user?.id ?? null);
        void loadProfile();
      });
    void load();
    const { data } = sb.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, [sb, loadProfile]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!sb || !userId) return null;
  if (editing) return <ProfileModal onClose={() => setEditing(false)} />;
  if (HIDDEN_ON.some(p => pathname?.includes(p))) return null;
  const displayName = profile?.username || email?.split('@')[0] || 'Tú';

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
        className='rounded-full border-2 border-(--border-color) hover:cursor-pointer'
      >
        <Avatar url={profile?.avatar_url ?? null} name={displayName} size={42} />
      </button>
      {open && (
        <div className='absolute right-0 mt-2 flex w-64 flex-col gap-2 rounded-2xl border-2 border-(--border-color) bg-(--card-color) p-3 shadow-lg'>
          <div
            className='-m-3 mb-1 flex items-center gap-3 rounded-t-2xl bg-cover bg-center p-3'
            style={{
              backgroundColor: profile?.banner_color,
              backgroundImage: profile?.banner_url ? `url(${profile.banner_url})` : undefined,
            }}
          >
            <Avatar url={profile?.avatar_url ?? null} name={displayName} size={44} />
            <div className='min-w-0'>
              <StyledName
                name={displayName}
                color={profile?.name_color ?? '#ff6b8a'}
                color2={profile?.name_color2 ?? '#a78bfa'}
                effect={profile?.name_effect ?? 'none'}
                className='text-lg'
              />
              <p className='truncate text-xs text-white/70'>{email}</p>
            </div>
          </div>
          {profile?.bio && <p className='text-xs text-(--secondary-color)'>{profile.bio}</p>}
          <button
            className='rounded-xl bg-(--main-color) px-3 py-2 text-left font-semibold text-white hover:cursor-pointer'
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
          >
            Editar perfil
          </button>
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
