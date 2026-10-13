'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play, RotateCcw, SkipForward, Trophy } from 'lucide-react';
import { useClick } from '@/shared/hooks/generic/useAudio';
import { useJapaneseTTS } from '@/features/Preferences/hooks/useJapaneseTTS';
import useAchievementStore, {
  ACHIEVEMENTS,
} from '@/features/Achievements/store/useAchievementStore';
import { allKana } from '../data/kanaData';
import { kanaStrokes } from '@/shared/data/kanaStrokes';
import { dist, judgeStrokeOrJoined, samplePath, type Pt } from '@/shared/utils/strokeMatching';
import useTraceStore from '../store/useTraceStore';

type Phase = 'demo' | 'guided1' | 'guided2' | 'memory' | 'done';
type Script = 'hiragana' | 'katakana';

const PHASE_LABEL: Record<Phase, string> = {
  demo: 'Mira el orden de trazo',
  guided1: 'Calca con guía (1/2)',
  guided2: 'Calca con guía (2/2)',
  memory: 'Escríbelo de memoria',
  done: '¡Completado!',
};
const NEXT_PHASE: Record<Phase, Phase> = {
  demo: 'guided1',
  guided1: 'guided2',
  guided2: 'memory',
  memory: 'done',
  done: 'done',
};
const BRUSH_IDS = ['brush_first', 'brush_ten', 'brush_hiragana', 'brush_katakana', 'brush_flawless'];

const isHiragana = (k: string) => k.codePointAt(0)! < 0x30a0;
const BASIC = new Set(
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん',
);
const isBasic = (k: string) =>
  BASIC.has(isHiragana(k) ? k : String.fromCodePoint(k.codePointAt(0)! - 0x60));


const shuffle = <T,>(a: T[]) => a.map(x => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(x => x[1]);

export default function KanaTrace() {
  const { playClick } = useClick();
  const { speak } = useJapaneseTTS();
  const { written, bestFlawless, recordWritten, setBestFlawless } = useTraceStore();
  const unlocked = useAchievementStore(s => s.unlockedAchievements);
  const unlockAchievement = useAchievementStore(s => s.unlockAchievement);

  const [script, setScript] = useState<Script>('hiragana');
  const [onlyBasic, setOnlyBasic] = useState(true);
  const pool = useMemo(
    () =>
      allKana.filter(
        k =>
          kanaStrokes[k.kana]?.length &&
          isHiragana(k.kana) === (script === 'hiragana') &&
          (!onlyBasic || isBasic(k.kana)),
      ),
    [script, onlyBasic],
  );

  const [queue, setQueue] = useState<typeof allKana>([]);
  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<Phase>('demo');
  const [strokeIdx, setStrokeIdx] = useState(0);
  const [demoCount, setDemoCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [flawlessRun, setFlawlessRun] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [ink, setInk] = useState<Pt[] | null>(null);
  const inkRef = useRef<Pt[] | null>(null);
  // Where the user draws this kana relative to the reference (set by the first stroke)
  const offsetRef = useRef<Pt | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = queue[qi];
  const strokes = current ? kanaStrokes[current.kana] : [];

  const startDemo = useCallback(() => {
    if (!current) return;
    if (demoTimer.current) clearTimeout(demoTimer.current);
    setPhase('demo');
    setStrokeIdx(0);
    setDemoCount(0);
    setFeedback(null);
    speak(current.kana);
    const n = kanaStrokes[current.kana].length;
    const step = (i: number) => {
      setDemoCount(i);
      if (i < n) demoTimer.current = setTimeout(() => step(i + 1), 800);
      else demoTimer.current = setTimeout(() => setPhase('guided1'), 700);
    };
    demoTimer.current = setTimeout(() => step(1), 250);
  }, [current, speak]);

  useEffect(() => {
    setQueue(shuffle(pool));
    setQi(0);
  }, [pool]);

  useEffect(() => {
    setMistakes(0);
    startDemo();
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kana]);

  const unlock = useCallback(
    (id: string) => {
      if (unlocked[id]) return;
      const a = ACHIEVEMENTS.find(x => x.id === id);
      if (a) unlockAchievement(a);
    },
    [unlocked, unlockAchievement],
  );

  // Award writing achievements whenever progress changes
  useEffect(() => {
    const kana = Object.keys(written);
    const hira = kana.filter(k => isHiragana(k) && isBasic(k)).length;
    const kata = kana.filter(k => !isHiragana(k) && isBasic(k)).length;
    if (kana.length >= 1) unlock('brush_first');
    if (kana.length >= 10) unlock('brush_ten');
    if (hira >= 46) unlock('brush_hiragana');
    if (kata >= 46) unlock('brush_katakana');
    if (bestFlawless >= 5) unlock('brush_flawless');
  }, [written, bestFlawless, unlock]);

  const next = () => {
    playClick();
    if (qi + 1 < queue.length) setQi(qi + 1);
    else {
      setQueue(shuffle(pool));
      setQi(0);
    }
  };

  const finishPhase = () => {
    if (!current) return;
    if (phase === 'memory') {
      speak(current.kana);
      recordWritten(current.kana);
      const run = mistakes === 0 ? flawlessRun + 1 : 0;
      setFlawlessRun(run);
      setBestFlawless(run);
      setPhase('done');
      setFeedback({ ok: true, text: mistakes ? `Completado con ${mistakes} errores` : '¡Perfecto, sin errores!' });
      return;
    }
    setFeedback({ ok: true, text: '¡Bien!' });
    setTimeout(() => {
      setPhase(NEXT_PHASE[phase]);
      setStrokeIdx(0);
      setFeedback(null);
    }, 450);
  };

  const toSvg = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const canDraw = phase === 'guided1' || phase === 'guided2' || phase === 'memory';

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw || strokeIdx >= strokes.length) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    inkRef.current = [toSvg(e)];
    setInk(inkRef.current);
  };
  const onMove = (e: React.PointerEvent) => {
    const cur = inkRef.current;
    if (!cur) return;
    const p = toSvg(e);
    if (dist(p, cur[cur.length - 1]) > 0.6) {
      inkRef.current = [...cur, p];
      setInk(inkRef.current);
    }
  };
  const onUp = () => {
    const drawn = inkRef.current;
    if (!drawn) return;
    inkRef.current = null;
    const { verdict, offset, covered } = judgeStrokeOrJoined(drawn, strokes, strokeIdx, strokeIdx === 0 ? null : offsetRef.current);
    offsetRef.current = offset;
    setInk(null);
    if (verdict === 'ok') {
      setFeedback(null);
      const n = Math.min(strokeIdx + covered, strokes.length);
      setStrokeIdx(n);
      if (n === strokes.length) finishPhase();
      return;
    }
    setMistakes(m => m + 1);
    setFeedback({
      ok: false,
      text:
        verdict === 'reversed'
          ? `Trazo ${strokeIdx + 1} al revés: empieza por el punto rojo`
          : `Trazo ${strokeIdx + 1} no coincide: revisa forma y posición`,
    });
    if (phase === 'memory' && mistakes + 1 >= 3) {
      setPhase('guided2');
      setStrokeIdx(0);
    }
  };

  const total = pool.length;
  const sessionPct = total ? Math.round(((qi + (phase === 'done' ? 1 : 0)) / total) * 100) : 0;
  const scriptAll = allKana.filter(k => kanaStrokes[k.kana]?.length && isHiragana(k.kana) === (script === 'hiragana'));
  const masteredCount = scriptAll.filter(k => written[k.kana]).length;
  const masteredPct = scriptAll.length ? Math.round((masteredCount / scriptAll.length) * 100) : 0;
  const phaseIdx = ['demo', 'guided1', 'guided2', 'memory', 'done'].indexOf(phase);
  const guideVisible = phase !== 'memory';
  const nextStart = canDraw && phase !== 'memory' && strokeIdx < strokes.length ? samplePath(strokes[strokeIdx]).pts[0] : null;

  const bar = (pct: number, label: string, sub: string) => (
    <div className='flex flex-col gap-1'>
      <div className='flex justify-between text-sm text-(--secondary-color)'>
        <span>{label}</span>
        <span>{sub}</span>
      </div>
      <div className='h-2.5 w-full overflow-hidden rounded-full bg-(--border-color)'>
        <div className='h-full rounded-full bg-(--main-color) transition-all duration-500' style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  return (
    <div className='flex min-h-[85vh] flex-1 flex-col gap-6'>
      <div className='flex flex-col items-center justify-between gap-4 md:flex-row'>
        <div>
          <h1 className='text-3xl font-bold text-(--main-color)'>Escritura de Kana</h1>
          <p className='text-(--secondary-color)'>Aprende el orden de trazo: mira, calca y escribe de memoria</p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {(['hiragana', 'katakana'] as Script[]).map(s => (
            <button
              key={s}
              onClick={() => { playClick(); setScript(s); }}
              className={clsx(
                'rounded-xl border px-4 py-2 capitalize transition-all',
                script === s ? 'border-(--main-color) bg-(--main-color) text-white' : 'border-(--border-color) bg-(--card-color) text-(--secondary-color)',
              )}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => { playClick(); setOnlyBasic(!onlyBasic); }}
            className='rounded-xl border border-(--border-color) bg-(--card-color) px-4 py-2 text-(--secondary-color)'
          >
            {onlyBasic ? 'Solo básicos' : 'Con dakuten'}
          </button>
        </div>
      </div>

      <div className='grid gap-3 rounded-2xl border border-(--border-color) bg-(--card-color) p-4 md:grid-cols-2'>
        {bar(sessionPct, 'Sesión', `${Math.min(qi + (phase === 'done' ? 1 : 0), total)}/${total}`)}
        {bar(masteredPct, `Dominio ${script}`, `${masteredCount}/${scriptAll.length}`)}
      </div>

      <div className='flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center'>
        <div className='flex flex-col items-center gap-3'>
          {current && (
            <div className='flex items-center gap-3'>
              <span className='text-4xl'>{current.kana}</span>
              <span className='text-2xl text-(--secondary-color)'>{current.romanji}</span>
              <button
                onClick={() => speak(current.kana)}
                className='rounded-xl border border-(--border-color) bg-(--card-color) px-3 py-2'
                title='Escuchar'
              >
                🔊
              </button>
            </div>
          )}
          <div className='flex gap-1'>
            {['Ver', 'Calco 1', 'Calco 2', 'Memoria'].map((l, i) => (
              <span
                key={l}
                className={clsx(
                  'rounded-full px-3 py-1 text-xs',
                  i < phaseIdx ? 'bg-(--main-color) text-white' : i === phaseIdx ? 'border border-(--main-color) text-(--main-color)' : 'border border-(--border-color) text-(--secondary-color)',
                )}
              >
                {l}
              </span>
            ))}
          </div>
          <p className='text-(--secondary-color)'>
            {PHASE_LABEL[phase]}
            {canDraw && ` · trazo ${Math.min(strokeIdx + 1, strokes.length)}/${strokes.length}`}
          </p>

          <svg
            ref={svgRef}
            viewBox='0 0 109 109'
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={clsx('w-[min(88vw,420px)] touch-none rounded-2xl border border-(--border-color) bg-(--card-color)', canDraw && 'cursor-crosshair')}
          >
            <path d='M54.5 0V109M0 54.5H109' stroke='var(--border-color)' strokeDasharray='2 2' fill='none' />
            <g fill='none' strokeLinecap='round' strokeLinejoin='round' strokeWidth={5}>
              {guideVisible && phase !== 'demo' && strokes.map((d, i) => <path key={`g${i}`} d={d} stroke='var(--border-color)' />)}
              {phase === 'demo' &&
                strokes.slice(0, demoCount).map((d, i) => (
                  <path key={`d${current?.kana}${i}`} d={d} stroke='var(--main-color)' pathLength={1} className='kana-trace-anim' />
                ))}
              {canDraw && phase !== 'memory' && strokeIdx < strokes.length && (
                <path d={strokes[strokeIdx]} stroke='var(--main-color)' opacity={0.3} />
              )}
              {phase !== 'demo' && strokes.slice(0, phase === 'done' ? strokes.length : strokeIdx).map((d, i) => (
                <path key={`w${i}`} d={d} stroke='var(--secondary-color)' />
              ))}
              {ink && <path d={'M' + ink.map(p => p.join(',')).join('L')} stroke='var(--main-color)' />}
            </g>
            {phase === 'demo' &&
              strokes.slice(0, demoCount).map((d, i) => {
                const [x, y] = samplePath(d).pts[0];
                return (
                  <text key={`n${i}`} x={x - 6} y={y - 2} fontSize={7} fill='var(--main-color)'>
                    {i + 1}
                  </text>
                );
              })}
            {nextStart && <circle cx={nextStart[0]} cy={nextStart[1]} r={3.5} fill='#ef4444' />}
          </svg>

          <div className={clsx('min-h-6 font-semibold', feedback?.ok ? 'text-green-500' : 'text-red-500')}>{feedback?.text}</div>

          <div className='flex gap-2'>
            <button onClick={() => { playClick(); startDemo(); }} className='flex items-center gap-2 rounded-xl border border-(--border-color) bg-(--card-color) px-4 py-2'>
              <Play size={18} /> Ver orden
            </button>
            <button
              onClick={() => { playClick(); setPhase(phase === 'demo' || phase === 'done' ? 'guided1' : phase); setStrokeIdx(0); setFeedback(null); }}
              className='flex items-center gap-2 rounded-xl border border-(--border-color) bg-(--card-color) px-4 py-2'
            >
              <RotateCcw size={18} /> Repetir
            </button>
            <button onClick={next} className='flex items-center gap-2 rounded-xl border border-(--main-color) bg-(--main-color) px-4 py-2 text-white'>
              <SkipForward size={18} /> Siguiente
            </button>
          </div>
        </div>

        <div className='w-full max-w-sm rounded-2xl border border-(--border-color) bg-(--card-color) p-4'>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold text-(--main-color)'>
            <Trophy size={20} /> Logros de escritura
          </h2>
          <ul className='flex flex-col gap-2'>
            {BRUSH_IDS.map(id => {
              const a = ACHIEVEMENTS.find(x => x.id === id)!;
              const got = !!unlocked[id];
              return (
                <li key={id} className={clsx('flex items-center gap-3 rounded-xl border p-2', got ? 'border-(--main-color)' : 'border-(--border-color) opacity-50')}>
                  <span className={clsx('text-2xl', !got && 'grayscale')}>{a.icon}</span>
                  <div>
                    <div className='font-medium'>{a.title}</div>
                    <div className='text-xs text-(--secondary-color)'>{a.description}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className='mt-3 text-sm text-(--secondary-color)'>Racha sin errores: {flawlessRun} (mejor {bestFlawless})</p>
          <div className='mt-3 grid grid-cols-8 gap-1'>
            {scriptAll.filter(k => isBasic(k.kana)).map(k => (
              <span
                key={k.kana}
                title={`${k.romanji} · ${written[k.kana] ?? 0}×`}
                className={clsx('rounded text-center text-sm', written[k.kana] ? 'bg-(--main-color) text-white' : 'text-(--secondary-color)')}
              >
                {k.kana}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`.kana-trace-anim{stroke-dasharray:1;stroke-dashoffset:1;animation:kana-trace-draw .7s ease forwards}@keyframes kana-trace-draw{to{stroke-dashoffset:0}}`}</style>
      <p className='text-center text-xs text-(--secondary-color)'>
        Datos de trazos: KanjiVG © Ulrich Apel, CC BY-SA 3.0
      </p>
    </div>
  );
}
