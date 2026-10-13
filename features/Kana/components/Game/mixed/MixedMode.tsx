'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { kana } from '@/features/Kana/data/kana';
import useKanaStore from '@/features/Kana/store/useKanaStore';
import useCourseStore, { type CourseScript } from '@/features/Kana/store/useCourseStore';
import { useStatsStore } from '@/features/Progress';
import { kanaStrokes } from '@/shared/data/kanaStrokes';
import Stars from '@/shared/ui-composite/Game/Stars';
import MCQ from '../MCQ';
import Input from '../Input';
import MatchPairs from './MatchPairs';
import DrawKana from './DrawKana';
import ReadWord, { type KanaWord } from './ReadWord';
import { useKanaAnswerRecorder } from './useKanaAnswerRecorder';

type Exercise = 'mcq' | 'mcq-rev' | 'pairs' | 'type' | 'word' | 'text' | 'listen' | 'draw' | 'read';
type Stage = 'custom' | 'warmup' | CourseScript | 'hiragana-words' | 'katakana-words' | 'review';

const EXERCISES: { id: Exercise; label: string; weight: number }[] = [
  { id: 'type', label: 'Escribe la respuesta', weight: 4 },
  { id: 'mcq', label: 'Opción múltiple', weight: 2 },
  { id: 'mcq-rev', label: 'Opción múltiple (invertida)', weight: 2 },
  { id: 'listen', label: 'Escucha', weight: 2 },
  { id: 'draw', label: 'Dibuja el kana', weight: 2 },
  { id: 'pairs', label: 'Encuentra las parejas', weight: 1.5 },
  { id: 'word', label: 'Escribe la palabra', weight: 1.5 },
  { id: 'text', label: 'Escribe el texto', weight: 1 },
];
const STAGE_LABEL: Record<Stage, string> = {
  custom: 'Práctica personalizada',
  warmup: 'Calentamiento diario',
  hiragana: 'Aprendiendo hiragana',
  'hiragana-words': 'Leyendo palabras en hiragana',
  katakana: 'Aprendiendo katakana',
  'katakana-words': 'Leyendo palabras en katakana',
  review: 'Repaso general',
};
/** Attempts below this keep drawing guided (demo + traced guide) */
const GUIDED_DRAW_ATTEMPTS = 3;
/** Unmastered kana being learned at once */
const LEARN_SLOTS = 5;
/** Mastered kana mixed in as review (doubled once nothing is left to learn) */
const REVIEW_SLOTS = 3;
/** A kana is mastered with this many attempts at MASTERED_ACCURACY or better */
const MASTERED_ATTEMPTS = 20;
const MASTERED_ACCURACY = 0.9;
/** Words read correctly to finish a reading stage */
const WORDS_GOAL = 40;
/** Questions in the daily warm-up */
const WARMUP_QUESTIONS = 15;
/** Share of questions that are word reading during a reading stage */
const READ_SHARE = 0.6;

type MasteryMap = Record<string, { correct: number; incorrect: number }>;

const isMastered = (m?: { correct: number; incorrect: number }) => {
  const total = (m?.correct ?? 0) + (m?.incorrect ?? 0);
  return total >= MASTERED_ATTEMPTS && (m?.correct ?? 0) / total >= MASTERED_ACCURACY;
};
const rowMasteredIn = (mastery: MasteryMap, row: number) =>
  kana[row].kana.every(c => isMastered(mastery[c]));

const scriptOfRow = (i: number): CourseScript =>
  kana[i].kana[0].charCodeAt(0) < 0x30a0 ? 'hiragana' : 'katakana';
const ROWS: Record<CourseScript, number[]> = {
  hiragana: kana.map((_, i) => i).filter(i => scriptOfRow(i) === 'hiragana'),
  katakana: kana.map((_, i) => i).filter(i => scriptOfRow(i) === 'katakana'),
};
const today = () => new Date().toISOString().slice(0, 10);

function courseStage(mastery: MasteryMap, words: Record<CourseScript, number>): Stage {
  if (!ROWS.hiragana.every(r => rowMasteredIn(mastery, r))) return 'hiragana';
  if (words.hiragana < WORDS_GOAL) return 'hiragana-words';
  if (!ROWS.katakana.every(r => rowMasteredIn(mastery, r))) return 'katakana';
  if (words.katakana < WORDS_GOAL) return 'katakana-words';
  return 'review';
}

function pickExercise(prev: Exercise | null, poolSize: number): Exercise {
  const options = EXERCISES.filter(
    e => e.id !== prev && (poolSize >= 3 || !['pairs', 'word', 'text'].includes(e.id)),
  );
  let r = Math.random() * options.reduce((s, e) => s + e.weight, 0);
  for (const e of options) if ((r -= e.weight) < 0) return e.id;
  return options[0].id;
}

// Words come from KanaDojo's vocabulary lists: hiragana-only N5, katakana-only N5-N3
function useKanaWords() {
  const [words, setWords] = useState<Record<CourseScript, KanaWord[]>>({ hiragana: [], katakana: [] });
  useEffect(() => {
    type Entry = { kana: string; waller_definition: string };
    Promise.all(
      ['n5', 'n4', 'n3'].map(lv =>
        fetch(`/data-vocab/${lv}.json`).then(r => r.json() as Promise<Entry[]>).catch(() => []),
      ),
    ).then(([n5, n4, n3]) => {
      const toWord = (e: Entry) => ({ kana: e.kana, meaning: e.waller_definition });
      setWords({
        hiragana: n5.filter(e => /^[ぁ-ゟ]{2,}$/.test(e.kana)).map(toWord),
        katakana: [...n5, ...n4, ...n3].filter(e => /^[゠-ヿ]{2,}$/.test(e.kana)).map(toWord),
      });
    });
  }, []);
  return words;
}

interface MixedModeProps {
  isHidden: boolean;
}

// Guided course: rotates exercise types, advances rows by mastery, then moves on to reading
export default function MixedMode({ isHidden }: MixedModeProps) {
  const setKanaGroupIndices = useKanaStore(s => s.setKanaGroupIndices);
  const characterMastery = useStatsStore(s => s.allTimeStats.characterMastery);
  const { adaptiveSelector } = useKanaAnswerRecorder();
  const course = useCourseStore();
  const words = useKanaWords();

  // No rows picked in the menu = full course; otherwise practise only the picked rows
  const initialSelection = useRef(useKanaStore.getState().kanaGroupIndices);
  const customRows = useMemo(() => [...initialSelection.current].sort((a, b) => a - b), []);
  const isCourse = customRows.length === 0;
  useEffect(() => {
    const original = initialSelection.current;
    return () => setKanaGroupIndices(original);
  }, [setKanaGroupIndices]);

  const reviewCursor = useRef(0);
  const warmupLeft = useRef(WARMUP_QUESTIONS);
  const lastExercise = useRef<Exercise | null>(null);
  const [question, setQuestion] = useState(0);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [stage, setStage] = useState<Stage>('custom');
  const [curriculum, setCurriculum] = useState<number[]>([]);
  const [learning, setLearning] = useState<string[]>([]);
  const [charPool, setCharPool] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [pairs, setPairs] = useState<{ kana: string; romaji: string }[]>([]);
  const [word, setWord] = useState<KanaWord | null>(null);

  const romajiOf = useCallback((c: string) => {
    const g = kana.find(g => g.kana.includes(c))!;
    return g.romanji[g.kana.indexOf(c)];
  }, []);

  const nextQuestion = useCallback(() => {
    // Read stores directly: the answer that just finished is not in this render yet
    const mastery = useStatsStore.getState().allTimeStats.characterMastery;
    const c = useCourseStore.getState();

    let st: Stage = isCourse ? courseStage(mastery, c.wordsCorrect) : 'custom';
    let rows: number[];
    if (isCourse && c.lastWarmupDay !== today()) {
      const warmRows = ROWS[c.warmupScript].filter(r => rowMasteredIn(mastery, r));
      if (warmRows.length && warmupLeft.current > 0) {
        warmupLeft.current--;
        st = 'warmup';
      } else {
        c.markWarmupDone(today());
      }
    }
    if (st === 'warmup') rows = ROWS[c.warmupScript].filter(r => rowMasteredIn(mastery, r));
    else if (st === 'custom') rows = customRows;
    else if (st === 'review') rows = [...ROWS.hiragana, ...ROWS.katakana];
    else rows = ROWS[st.startsWith('hiragana') ? 'hiragana' : 'katakana'];
    setStage(st);
    setCurriculum(rows);

    // Learn kana one by one: a few unmastered kana in course order; a mastered one
    // leaves the set and the next one comes in. Mastered kana keep coming back as review.
    const chars = rows.flatMap(r => kana[r].kana);
    const learning = st === 'warmup' ? [] : chars.filter(ch => !isMastered(mastery[ch])).slice(0, LEARN_SLOTS);
    const masteredChars = chars.filter(ch => isMastered(mastery[ch]));
    const reviewCount = learning.length ? REVIEW_SLOTS : REVIEW_SLOTS * 2;
    const reviews: string[] = [];
    for (let i = 0; i < Math.min(reviewCount, masteredChars.length); i++) {
      reviews.push(masteredChars[(reviewCursor.current + i) % masteredChars.length]);
    }
    reviewCursor.current += 1;
    const pool = learning.length + reviews.length ? [...learning, ...reviews] : chars;
    const active = rows.filter(r => kana[r].kana.some(ch => pool.includes(ch)));
    setKanaGroupIndices(active);
    setLearning(learning);
    setCharPool(pool);
    const readingScript: CourseScript | null =
      st === 'hiragana-words' ? 'hiragana' : st === 'katakana-words' ? 'katakana' : null;
    const wordList = readingScript ? words[readingScript] : [];
    // A kana never answered before is introduced by drawing it with the guide
    const fresh = st === 'warmup' ? undefined : pool.find(ch => !mastery[ch] && kanaStrokes[ch]);

    let ex: Exercise;
    if (fresh) ex = 'draw';
    else if (wordList.length && Math.random() < READ_SHARE) ex = 'read';
    else ex = pickExercise(lastExercise.current, pool.length);

    let char = fresh ?? adaptiveSelector.selectWeightedCharacter(pool);
    if (ex === 'draw' && !kanaStrokes[char]) {
      const drawable = pool.filter(ch => kanaStrokes[ch]);
      if (drawable.length) char = adaptiveSelector.selectWeightedCharacter(drawable);
      else ex = 'type';
    }
    if (ex === 'pairs') {
      const chosen = new Set<string>();
      while (chosen.size < Math.min(5, pool.length)) {
        chosen.add(adaptiveSelector.selectWeightedCharacter(pool.filter(ch => !chosen.has(ch))));
      }
      setPairs([...chosen].map(k => ({ kana: k, romaji: romajiOf(k) })));
    }
    if (ex === 'read') setWord(wordList[Math.floor(Math.random() * wordList.length)]);
    adaptiveSelector.markCharacterSeen(char);
    setTarget(char);
    lastExercise.current = ex;
    setExercise(ex);
    setQuestion(q => q + 1);
  }, [isCourse, customRows, setKanaGroupIndices, adaptiveSelector, romajiOf, words]);

  useEffect(() => {
    nextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!exercise) return null;

  const courseChars = curriculum.flatMap(r => kana[r].kana);
  const masteredCount = courseChars.filter(ch => isMastered(characterMastery[ch])).length;
  const readingScript: CourseScript | null =
    stage === 'hiragana-words' ? 'hiragana' : stage === 'katakana-words' ? 'katakana' : null;
  const [progressLabel, done, total] =
    stage === 'warmup'
      ? ['Preguntas de calentamiento', WARMUP_QUESTIONS - warmupLeft.current, WARMUP_QUESTIONS]
      : readingScript
        ? ['Palabras leídas', Math.min(course.wordsCorrect[readingScript], WORDS_GOAL), WORDS_GOAL]
        : ['Kana dominados', masteredCount, courseChars.length];
  const label = exercise === 'read' ? 'Lee la palabra' : EXERCISES.find(e => e.id === exercise)?.label;
  const pool = charPool;
  const next = () => nextQuestion();
  const key = `${exercise}-${question}`;

  return (
    <div className={isHidden ? 'hidden' : 'flex w-full flex-col items-center gap-6 sm:w-4/5'}>
      <div className='w-full max-w-md space-y-2'>
        <div className='flex items-center justify-between gap-2'>
          <span className='font-semibold text-(--main-color)'>{STAGE_LABEL[stage]}</span>
          {isCourse && (
            <div className='flex items-center gap-1 text-xs text-(--secondary-color)'>
              <span>Empezar el día con</span>
              {(['hiragana', 'katakana'] as CourseScript[]).map(s => (
                <button
                  key={s}
                  onClick={() => course.setWarmupScript(s)}
                  className={clsx(
                    'rounded-lg border px-2 py-0.5 capitalize',
                    course.warmupScript === s
                      ? 'border-(--main-color) bg-(--main-color) text-white'
                      : 'border-(--border-color)',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className='flex justify-between text-sm text-(--secondary-color)'>
          <span>{progressLabel}</span>
          <span>{done}/{total}</span>
        </div>
        <div className='h-2.5 overflow-hidden rounded-full bg-(--border-color)'>
          <div
            className='h-full rounded-full bg-(--main-color) transition-all duration-500'
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        {learning.length > 0 && (
          <div className='flex flex-wrap justify-center gap-1 pt-1'>
            {learning.map(c => {
              const m = characterMastery[c];
              const attempts = (m?.correct ?? 0) + (m?.incorrect ?? 0);
              return (
                <span
                  key={c}
                  title={`${m?.correct ?? 0}/${attempts} correctas`}
                  className={
                    isMastered(m)
                      ? 'rounded-lg bg-(--main-color) px-2 py-1 text-white'
                      : 'rounded-lg border border-(--border-color) px-2 py-1 text-(--secondary-color)'
                  }
                >
                  {c} <small>{Math.min(attempts, MASTERED_ATTEMPTS)}/{MASTERED_ATTEMPTS}</small>
                </span>
              );
            })}
          </div>
        )}
        <p className='text-center text-sm font-semibold text-(--main-color)'>{label}</p>
      </div>

      {exercise === 'mcq' && <MCQ key={key} isHidden={false} forceReverse={false} charPool={charPool} onQuestionDone={next} />}
      {exercise === 'mcq-rev' && <MCQ key={key} isHidden={false} forceReverse charPool={charPool} onQuestionDone={next} />}
      {exercise === 'listen' && <MCQ key={key} isHidden={false} listen charPool={charPool} onQuestionDone={next} />}
      {exercise === 'type' && <Input key={key} isHidden={false} charPool={charPool} fixedLength={1} onQuestionDone={next} />}
      {exercise === 'word' && <Input key={key} isHidden={false} charPool={charPool} fixedLength={Math.min(3, pool.length)} onQuestionDone={next} />}
      {exercise === 'text' && <Input key={key} isHidden={false} charPool={charPool} fixedLength={Math.min(5, pool.length)} onQuestionDone={next} />}
      {exercise === 'pairs' && <MatchPairs key={key} pairs={pairs} onQuestionDone={next} />}
      {exercise === 'read' && word && readingScript && (
        <ReadWord
          key={key}
          word={word}
          onCorrect={() => course.addWordCorrect(readingScript)}
          onQuestionDone={next}
        />
      )}
      {exercise === 'draw' && (
        <DrawKana
          key={key}
          kana={target}
          romaji={romajiOf(target)}
          guided={
            (characterMastery[target]?.correct ?? 0) + (characterMastery[target]?.incorrect ?? 0) <
            GUIDED_DRAW_ATTEMPTS
          }
          onQuestionDone={next}
        />
      )}
      {(exercise === 'pairs' || exercise === 'draw') && <Stars />}
    </div>
  );
}
