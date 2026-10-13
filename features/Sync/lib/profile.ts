import { create } from 'zustand';
import { getSupabase } from '@/shared/infra/client/supabase';

export type NameEffect = 'none' | 'gradient' | 'rainbow' | 'glow' | 'sparkle' | 'shimmer';

export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  name_color: string;
  name_color2: string;
  name_effect: NameEffect;
  banner_color: string;
  banner_url: string | null;
  bio: string | null;
}

export const DEFAULT_PROFILE: Omit<Profile, 'id'> = {
  username: null,
  avatar_url: null,
  name_color: '#ff6b8a',
  name_color2: '#a78bfa',
  name_effect: 'none',
  banner_color: '#2a2140',
  banner_url: null,
  bio: null,
};

interface ProfileState {
  profile: Profile | null;
  email: string | null;
  load: () => Promise<void>;
  save: (patch: Partial<Omit<Profile, 'id'>>) => Promise<string | null>;
  uploadImage: (kind: 'avatar' | 'banner', file: File) => Promise<string | null>;
}

const ERRORS: Record<string, string> = {
  '23505': 'Ese nombre de usuario ya está cogido',
  '23514': 'Nombre de 3 a 24 caracteres y biografía de 160 como máximo',
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  email: null,
  load: async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data: auth } = await sb.auth.getUser();
    const user = auth.user;
    if (!user) return set({ profile: null, email: null });
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    set({ profile: (data as Profile) ?? { id: user.id, ...DEFAULT_PROFILE }, email: user.email ?? null });
  },
  save: async patch => {
    const sb = getSupabase();
    const current = get().profile;
    if (!sb || !current) return 'Sin sesión';
    const next = { ...current, ...patch };
    const { error } = await sb
      .from('profiles')
      .upsert({ ...next, updated_at: new Date().toISOString() });
    if (error) return ERRORS[error.code] ?? error.message;
    set({ profile: next });
    return null;
  },
  uploadImage: async (kind, file) => {
    const sb = getSupabase();
    const current = get().profile;
    if (!sb || !current) return 'Sin sesión';
    if (file.size > 4 * 1024 * 1024) return 'La imagen debe pesar menos de 4 MB';
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    // New name each time so browsers and the CDN never show the old picture
    const path = `${current.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) return error.message;
    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    return get().save(kind === 'avatar' ? { avatar_url: data.publicUrl } : { banner_url: data.publicUrl });
  },
}));
