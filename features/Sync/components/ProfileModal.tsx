'use client';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, X } from 'lucide-react';
import { getSupabase } from '@/shared/infra/client/supabase';
import { useProfileStore, type NameEffect, type Profile } from '../lib/profile';
import Avatar from './Avatar';
import StyledName from './StyledName';

const EFFECTS: { id: NameEffect; label: string }[] = [
  { id: 'none', label: 'Normal' },
  { id: 'gradient', label: 'Degradado' },
  { id: 'rainbow', label: 'Arcoíris' },
  { id: 'glow', label: 'Brillo' },
  { id: 'sparkle', label: 'Brillitos' },
  { id: 'shimmer', label: 'Destello' },
];
const MIN_PASSWORD = 6;

// Profile editor: picture, username, bio, banner, name style, password and email
export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { profile, email, save, uploadAvatar } = useProfileStore();
  const [draft, setDraft] = useState<Profile | null>(profile);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  if (!draft) return null;

  const set = (patch: Partial<Profile>) => setDraft({ ...draft, ...patch });
  const fallbackName = email?.split('@')[0] ?? 'Tú';
  const show = (ok: boolean, text: string) => setMsg({ ok, text });

  const run = async (fn: () => Promise<string | null>, okText: string) => {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    show(!err, err ?? okText);
  };

  const sb = getSupabase();
  const label = 'text-sm font-semibold text-(--secondary-color)';
  const input =
    'w-full rounded-xl border-2 border-(--border-color) bg-(--background-color) px-3 py-2 text-(--main-color)';
  const btn = 'rounded-xl bg-(--main-color) px-4 py-2 font-semibold text-white disabled:opacity-60';

  return (
    <div className='fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/60 p-4'>
      <div className='relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-(--border-color) bg-(--card-color)'>
        <div className='h-24' style={{ background: draft.banner_color }} />
        <button
          onClick={onClose}
          aria-label='Cerrar'
          className='absolute top-3 right-3 rounded-full bg-black/40 p-1.5 text-white hover:cursor-pointer'
        >
          <X size={18} />
        </button>

        <div className='-mt-12 flex flex-col gap-4 px-5 pb-5'>
          <div className='flex items-end gap-3'>
            <button
              onClick={() => fileRef.current?.click()}
              className='group relative rounded-full border-4 border-(--card-color) hover:cursor-pointer'
              aria-label='Cambiar foto'
            >
              <Avatar url={draft.avatar_url} name={draft.username ?? fallbackName} size={88} />
              <span className='absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100'>
                <Camera size={24} />
              </span>
            </button>
            <input
              ref={fileRef}
              type='file'
              accept='image/png,image/jpeg,image/webp,image/gif'
              hidden
              onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                await run(() => uploadAvatar(f), 'Foto actualizada');
                setDraft(d => (d ? { ...d, avatar_url: useProfileStore.getState().profile?.avatar_url ?? d.avatar_url } : d));
              }}
            />
            <div className='pb-2 text-2xl'>
              <StyledName
                name={draft.username || fallbackName}
                color={draft.name_color}
                color2={draft.name_color2}
                effect={draft.name_effect}
              />
            </div>
          </div>
          {draft.bio && <p className='text-sm text-(--secondary-color)'>{draft.bio}</p>}

          <label className='flex flex-col gap-1'>
            <span className={label}>Nombre de usuario</span>
            <input
              className={input}
              maxLength={24}
              placeholder={fallbackName}
              value={draft.username ?? ''}
              onChange={e => set({ username: e.target.value || null })}
            />
          </label>
          <label className='flex flex-col gap-1'>
            <span className={label}>Biografía</span>
            <textarea
              className={clsx(input, 'resize-none')}
              rows={2}
              maxLength={160}
              placeholder='Algo sobre ti…'
              value={draft.bio ?? ''}
              onChange={e => set({ bio: e.target.value || null })}
            />
          </label>

          <div className='flex flex-col gap-2'>
            <span className={label}>Estilo del nombre</span>
            <div className='grid grid-cols-3 gap-2'>
              {EFFECTS.map(fx => (
                <button
                  key={fx.id}
                  onClick={() => set({ name_effect: fx.id })}
                  className={clsx(
                    'rounded-xl border-2 px-2 py-2 text-sm hover:cursor-pointer',
                    draft.name_effect === fx.id ? 'border-(--main-color)' : 'border-(--border-color)',
                  )}
                >
                  <StyledName
                    name={fx.label}
                    color={draft.name_color}
                    color2={draft.name_color2}
                    effect={fx.id}
                  />
                </button>
              ))}
            </div>
            <div className='flex flex-wrap items-center gap-4 text-sm text-(--secondary-color)'>
              <label className='flex items-center gap-2'>
                Color
                <input type='color' value={draft.name_color} onChange={e => set({ name_color: e.target.value })} />
              </label>
              <label className='flex items-center gap-2'>
                Segundo color
                <input type='color' value={draft.name_color2} onChange={e => set({ name_color2: e.target.value })} />
              </label>
              <label className='flex items-center gap-2'>
                Banner
                <input type='color' value={draft.banner_color} onChange={e => set({ banner_color: e.target.value })} />
              </label>
            </div>
          </div>

          <button
            disabled={busy}
            className={btn}
            onClick={() => {
              const { id: _id, ...patch } = draft;
              if (patch.username && patch.username.trim().length < 3) {
                return show(false, 'El nombre debe tener al menos 3 caracteres');
              }
              void run(() => save({ ...patch, username: patch.username?.trim() || null }), 'Perfil guardado');
            }}
          >
            Guardar perfil
          </button>

          <hr className='border-(--border-color)' />

          <div className='flex flex-col gap-2'>
            <span className={label}>Cambiar contraseña</span>
            <input
              className={input}
              type='password'
              autoComplete='new-password'
              placeholder='Nueva contraseña'
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <input
              className={input}
              type='password'
              autoComplete='new-password'
              placeholder='Repite la contraseña'
              value={password2}
              onChange={e => setPassword2(e.target.value)}
            />
            <button
              disabled={busy || !password}
              className={btn}
              onClick={() => {
                if (password.length < MIN_PASSWORD) return show(false, `Mínimo ${MIN_PASSWORD} caracteres`);
                if (password !== password2) return show(false, 'Las contraseñas no coinciden');
                void run(async () => {
                  const { error } = (await sb?.auth.updateUser({ password })) ?? {};
                  if (!error) {
                    setPassword('');
                    setPassword2('');
                  }
                  return error?.message ?? null;
                }, 'Contraseña cambiada');
              }}
            >
              Cambiar contraseña
            </button>
          </div>

          <div className='flex flex-col gap-2'>
            <span className={label}>Cambiar email (ahora: {email})</span>
            <input
              className={input}
              type='email'
              placeholder='Nuevo email'
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <button
              disabled={busy || !newEmail}
              className={btn}
              onClick={() =>
                void run(async () => {
                  const { error } =
                    (await sb?.auth.updateUser(
                      { email: newEmail },
                      { emailRedirectTo: window.location.origin },
                    )) ?? {};
                  return error?.message ?? null;
                }, 'Te hemos enviado un email para confirmar el cambio')
              }
            >
              Cambiar email
            </button>
          </div>

          {msg && (
            <p className={clsx('text-center text-sm', msg.ok ? 'text-green-500' : 'text-red-500')}>{msg.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}
