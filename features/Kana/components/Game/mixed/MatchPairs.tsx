'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useJapaneseTTS } from '@/features/Preferences/hooks/useJapaneseTTS';
import { useKanaAnswerRecorder } from './useKanaAnswerRecorder';

interface MatchPairsProps {
  pairs: { kana: string; romaji: string }[];
  onQuestionDone: () => void;
}

const shuffle = <T,>(a: T[]) =>
  a.map(x => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(x => x[1]);

// Match each kana with its romaji; every pair counts as one answer for that kana
export default function MatchPairs({ pairs, onQuestionDone }: MatchPairsProps) {
  const { recordCorrect, recordWrong } = useKanaAnswerRecorder();
  const { speak } = useJapaneseTTS();
  const left = useMemo(() => shuffle(pairs), [pairs]);
  const right = useMemo(() => shuffle(pairs), [pairs]);
  // Selection can start on either column; both columns are identified by the pair's kana
  const [picked, setPicked] = useState<{ side: 'kana' | 'romaji'; kana: string } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [missed, setMissed] = useState<Set<string>>(new Set());

  const pick = (side: 'kana' | 'romaji', k: string) => {
    if (!picked || picked.side === side) return setPicked({ side, kana: k });
    const kanaSide = side === 'kana' ? k : picked.kana;
    const clicked = `${side}:${k}`;
    if (picked.kana === k) {
      if (!missed.has(k)) recordCorrect(k);
      // Sound only after a correct match, so it never gives the answer away
      speak(k);
      const next = new Set(done).add(k);
      setPicked(null);
      const left = pairs.filter(p => !next.has(p.kana));
      // The last pair is obvious: complete it automatically
      if (left.length === 1) {
        const last = left[0].kana;
        if (!missed.has(last)) recordCorrect(last);
        setTimeout(() => speak(last), 500);
        next.add(last);
      }
      setDone(next);
      if (next.size === pairs.length) setTimeout(onQuestionDone, 1000);
    } else {
      recordWrong(kanaSide);
      setMissed(new Set(missed).add(kanaSide));
      setWrong(clicked);
      setPicked(null);
      setTimeout(() => setWrong(null), 400);
    }
  };

  const cell =
    'rounded-2xl border-2 px-6 py-4 text-3xl transition-all disabled:opacity-0 cursor-pointer';
  return (
    <div className='flex w-full flex-col items-center gap-6'>
      <p className='text-lg text-(--secondary-color)'>Encuentra las parejas</p>
      <div className='grid grid-cols-2 gap-x-10 gap-y-3'>
        <div className='flex flex-col gap-3'>
          {left.map(p => (
            <button
              key={p.kana}
              disabled={done.has(p.kana)}
              onClick={() => pick('kana', p.kana)}
              className={clsx(
                cell,
                wrong === `kana:${p.kana}`
                  ? 'border-red-500 text-red-500'
                  : picked?.side === 'kana' && picked.kana === p.kana
                  ? 'border-(--main-color) text-(--main-color)'
                  : 'border-(--border-color) bg-(--card-color)',
              )}
            >
              {p.kana}
            </button>
          ))}
        </div>
        <div className='flex flex-col gap-3'>
          {right.map(p => (
            <button
              key={p.romaji + p.kana}
              disabled={done.has(p.kana)}
              onClick={() => pick('romaji', p.kana)}
              className={clsx(
                cell,
                'text-2xl',
                wrong === `romaji:${p.kana}`
                  ? 'border-red-500 text-red-500'
                  : picked?.side === 'romaji' && picked.kana === p.kana
                    ? 'border-(--main-color) text-(--main-color)'
                    : 'border-(--border-color) bg-(--card-color)',
              )}
            >
              {p.romaji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
