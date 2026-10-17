'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Trophy, X } from 'lucide-react';
import { getSupabase } from '@/shared/infra/client/supabase';
import type { NameEffect } from '../lib/profile';
import Avatar from './Avatar';
import StyledName from './StyledName';

interface Row {
  user_id: string;
  username: string;
  avatar_url: string | null;
  name_color: string;
  name_color2: string;
  name_effect: NameEffect;
  mastered_kana: number;
  total_correct: number;
  accuracy: number | null;
  days_trained: number;
  words_read: number;
}

type Metric = 'mastered_kana' | 'total_correct' | 'accuracy' | 'days_trained' | 'words_read';

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'mastered_kana', label: 'Kana dominados', unit: '' },
  { id: 'total_correct', label: 'Aciertos', unit: '' },
  { id: 'accuracy', label: 'Precisión', unit: '%' },
  { id: 'days_trained', label: 'Días', unit: '' },
  { id: 'words_read', label: 'Palabras', unit: '' },
];
const MEDALS = ['🥇', '🥈', '🥉'];

// Friends ranking computed server-side from everyone's synced progress (totals only)
export default function LeaderboardModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('mastered_kana');

  useEffect(() => {
    getSupabase()
      ?.rpc('leaderboard')
      .then(({ data, error }) => {
        if (error) setError('No se pudo cargar el ranking');
        else setRows(data as Row[]);
      });
  }, []);

  const sorted = [...(rows ?? [])].sort(
    (a, b) => (b[metric] ?? 0) - (a[metric] ?? 0) || b.total_correct - a.total_correct,
  );
  const unit = METRICS.find(m => m.id === metric)!.unit;

  return (
    <div className='fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/60 p-4'>
      <div className='relative w-full max-w-md rounded-3xl border-2 border-(--border-color) bg-(--card-color) p-5'>
        <button
          onClick={onClose}
          aria-label='Cerrar'
          className='absolute top-4 right-4 text-(--secondary-color) hover:cursor-pointer'
        >
          <X size={20} />
        </button>
        <h2 className='mb-4 flex items-center gap-2 text-2xl font-bold text-(--main-color)'>
          <Trophy size={24} /> Ranking
        </h2>
        <div className='mb-4 flex flex-wrap gap-1'>
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={clsx(
                'rounded-full px-3 py-1 text-sm hover:cursor-pointer',
                metric === m.id ? 'bg-(--main-color) text-white' : 'border border-(--border-color) text-(--secondary-color)',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {error && <p className='text-center text-red-500'>{error}</p>}
        {!rows && !error && <p className='text-center text-(--secondary-color)'>Cargando…</p>}
        <ol className='flex flex-col gap-2'>
          {sorted.map((r, i) => (
            <li
              key={r.user_id}
              className={clsx(
                'flex items-center gap-3 rounded-2xl border-2 p-2',
                r.user_id === userId ? 'border-(--main-color)' : 'border-(--border-color)',
              )}
            >
              <span className='w-7 text-center text-lg font-bold text-(--secondary-color)'>{MEDALS[i] ?? i + 1}</span>
              <Avatar url={r.avatar_url} name={r.username} size={36} />
              <div className='min-w-0 flex-1 truncate'>
                <StyledName name={r.username} color={r.name_color} color2={r.name_color2} effect={r.name_effect} />
                {r.user_id === userId && <span className='ml-1 text-xs text-(--secondary-color)'>(tú)</span>}
              </div>
              <span className='text-lg font-bold text-(--main-color)'>
                {r[metric] ?? 0}
                {unit}
              </span>
            </li>
          ))}
        </ol>
        <p className='mt-4 text-center text-xs text-(--secondary-color)'>
          Se actualiza con cada sincronización. Sin nombre de usuario sales como &quot;Sin nombre&quot;.
        </p>
      </div>
    </div>
  );
}
