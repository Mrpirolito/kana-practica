'use client';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { toRomaji } from 'wanakana';
import AudioButton from '@/shared/ui-composite/audio/AudioButton';
import { useKanaAnswerRecorder } from './useKanaAnswerRecorder';

export interface KanaWord {
  kana: string;
  meaning: string;
}

interface ReadWordProps {
  word: KanaWord;
  onCorrect: () => void;
  onQuestionDone: () => void;
}

const normalize = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, '').replace(/[āâ]/g, 'aa').replace(/[ūû]/g, 'uu')
    .replace(/[ēê]/g, 'ee').replace(/[ōô]/g, 'ou').replace(/[īî]/g, 'ii');

// Accept both "ou" and "oo" style long vowels and n/nn
const variants = (romaji: string) =>
  new Set([romaji, romaji.replace(/ou/g, 'oo'), romaji.replace(/oo/g, 'ou'), romaji.replace(/n(?=[^aiueoy]|$)/g, 'nn')]);

// Read a word written in kana and type it in romaji
export default function ReadWord({ word, onCorrect, onQuestionDone }: ReadWordProps) {
  const { recordWord } = useKanaAnswerRecorder();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const answered = useRef(false);
  const expected = normalize(toRomaji(word.kana));

  const check = () => {
    if (state !== 'ask') return onQuestionDone();
    if (!value.trim()) return;
    const good = variants(expected).has(normalize(value));
    if (!answered.current) {
      answered.current = true;
      recordWord(good);
      if (good) onCorrect();
    }
    setState(good ? 'right' : 'wrong');
    // Correct: show the reading and audio briefly, then move on by itself
    if (good) setTimeout(onQuestionDone, 1800);
  };

  return (
    <div className='flex w-full flex-col items-center gap-5'>
      <p className='text-lg text-(--secondary-color)'>Lee la palabra y escríbela en romaji</p>
      <p className='text-6xl font-medium sm:text-7xl'>{word.kana}</p>
      {state !== 'ask' && (
        <div className='flex flex-col items-center gap-2'>
          <AudioButton text={word.kana} autoPlay autoPlayTrigger={word.kana} />
          <p className={clsx('text-xl font-semibold', state === 'right' ? 'text-green-500' : 'text-red-500')}>
            {expected}
          </p>
          <p className='text-(--secondary-color)'>{word.meaning}</p>
        </div>
      )}
      <input
        autoFocus
        value={value}
        disabled={state !== 'ask'}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && check()}
        placeholder='romaji...'
        className='w-full max-w-sm rounded-3xl border-4 border-(--border-color) bg-(--card-color) px-5 py-3 text-center text-2xl focus:outline-none'
      />
      <button
        onClick={check}
        className='rounded-2xl bg-(--main-color) px-8 py-3 text-lg font-semibold text-white'
      >
        {state === 'ask' ? 'Comprobar' : 'Continuar'}
      </button>
    </div>
  );
}
