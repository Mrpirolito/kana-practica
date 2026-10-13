'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play } from 'lucide-react';
import { kanaStrokes } from '@/shared/data/kanaStrokes';
import { dist, judgeStrokeOrJoined, samplePath, type Pt } from '@/shared/utils/strokeMatching';
import AudioButton from '@/shared/ui-composite/audio/AudioButton';
import { useKanaAnswerRecorder } from './useKanaAnswerRecorder';

interface DrawKanaProps {
  kana: string;
  romaji: string;
  /** New kana: show the stroke-order demo and trace over a guide */
  guided: boolean;
  onQuestionDone: () => void;
}

const MAX_MISTAKES_BEFORE_GUIDE = 3;
const MAX_FAILS_PER_STROKE = 3;

// Draw a kana in stroke order; correct only with fewer than 2 mistakes
export default function DrawKana({ kana, romaji, guided, onQuestionDone }: DrawKanaProps) {
  const { recordCorrect, recordWrong } = useKanaAnswerRecorder();
  const strokes = kanaStrokes[kana] ?? [];
  const [demo, setDemo] = useState(guided ? 0 : -1);
  const [showGuide, setShowGuide] = useState(guided);
  const [idx, setIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ink, setInk] = useState<Pt[] | null>(null);
  const inkRef = useRef<Pt[] | null>(null);
  // Where the user draws this kana relative to the reference (set by the first stroke)
  const offsetRef = useRef<Pt | null>(null);
  const strokeFails = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const playDemo = () => setDemo(0);
  useEffect(() => {
    if (demo < 0) return;
    if (demo >= strokes.length) {
      const t = setTimeout(() => setDemo(-1), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDemo(demo + 1), demo === 0 ? 300 : 750);
    return () => clearTimeout(t);
  }, [demo, strokes.length]);

  const drawing = demo < 0 && idx < strokes.length;
  const toSvg = (e: React.PointerEvent): Pt => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svgRef.current!.getScreenCTM()!.inverse(),
    );
    return [p.x, p.y];
  };

  const onUp = () => {
    const drawn = inkRef.current;
    if (!drawn) return;
    inkRef.current = null;
    setInk(null);
    const { verdict, offset, covered } = judgeStrokeOrJoined(drawn, strokes, idx, idx === 0 ? null : offsetRef.current);
    offsetRef.current = offset;
    const advance = (totalMistakes: number, step = 1) => {
      strokeFails.current = 0;
      const n = Math.min(idx + step, strokes.length);
      setIdx(n);
      if (n === strokes.length) {
        const good = totalMistakes < 2;
        if (good) recordCorrect(kana);
        else recordWrong(kana);
        setMsg({ ok: good, text: good ? '¡Bien!' : 'Completado, pero repásalo' });
        setTimeout(onQuestionDone, 900);
      }
    };
    if (verdict === 'ok') {
      setMsg(null);
      advance(mistakes, covered);
      return;
    }
    const m = mistakes + 1;
    setMistakes(m);
    if (m >= MAX_MISTAKES_BEFORE_GUIDE) setShowGuide(true);
    // Never get stuck: after a few misses on the same stroke, draw it in and move on
    if (++strokeFails.current >= MAX_FAILS_PER_STROKE) {
      setMsg({ ok: false, text: `Trazo ${idx + 1}: así se hace, sigue con el siguiente` });
      advance(m);
      return;
    }
    setMsg({
      ok: false,
      text:
        verdict === 'reversed'
          ? `Trazo ${idx + 1} al revés`
          : `Trazo ${idx + 1} no coincide`,
    });
  };

  const hint = drawing && showGuide ? samplePath(strokes[idx]).pts[0] : null;

  return (
    <div className='flex w-full flex-col items-center gap-3'>
      <p className='text-lg text-(--secondary-color)'>
        Dibuja <span className='text-3xl font-bold text-(--main-color)'>{romaji}</span>
      </p>
      <div className='flex items-center gap-2'>
        <AudioButton text={kana} variant='icon-only' autoPlay autoPlayTrigger={kana} />
        <button
          onClick={playDemo}
          className='flex items-center gap-1 rounded-xl border border-(--border-color) bg-(--card-color) px-3 py-1 text-sm'
        >
          <Play size={14} /> Orden de trazo
        </button>
        <span className='text-sm text-(--secondary-color)'>
          trazo {Math.min(idx + 1, strokes.length)}/{strokes.length}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox='0 0 109 109'
        onPointerDown={e => {
          if (!drawing) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          inkRef.current = [toSvg(e)];
          setInk(inkRef.current);
        }}
        onPointerMove={e => {
          const cur = inkRef.current;
          if (!cur) return;
          const p = toSvg(e);
          if (dist(p, cur[cur.length - 1]) > 0.6) {
            inkRef.current = [...cur, p];
            setInk(inkRef.current);
          }
        }}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className='w-[min(80vw,340px)] cursor-crosshair touch-none rounded-2xl border border-(--border-color) bg-(--card-color)'
      >
        <path d='M54.5 0V109M0 54.5H109' stroke='var(--border-color)' strokeDasharray='2 2' fill='none' />
        <g fill='none' strokeLinecap='round' strokeLinejoin='round' strokeWidth={5}>
          {(showGuide || demo >= 0) &&
            strokes.map((d, i) => <path key={`g${i}`} d={d} stroke='var(--border-color)' />)}
          {demo >= 0 &&
            strokes.slice(0, demo).map((d, i) => (
              <path key={`d${i}`} d={d} stroke='var(--main-color)' pathLength={1} className='kana-draw-anim' />
            ))}
          {demo < 0 &&
            strokes.slice(0, idx).map((d, i) => (
              <path key={`w${i}`} d={d} stroke='var(--secondary-color)' />
            ))}
          {ink && <path d={'M' + ink.map(p => p.join(',')).join('L')} stroke='var(--main-color)' />}
        </g>
        {demo >= 0 &&
          strokes.slice(0, demo).map((d, i) => {
            const [x, y] = samplePath(d).pts[0];
            return (
              <text key={`n${i}`} x={x - 6} y={y - 2} fontSize={7} fill='var(--main-color)'>
                {i + 1}
              </text>
            );
          })}
        {hint && <circle cx={hint[0]} cy={hint[1]} r={3.5} fill='#ef4444' />}
      </svg>
      <div className={clsx('min-h-6 font-semibold', msg?.ok ? 'text-green-500' : 'text-red-500')}>
        {msg?.text}
      </div>
      <style>{`.kana-draw-anim{stroke-dasharray:1;stroke-dashoffset:1;animation:kana-draw .6s ease forwards}@keyframes kana-draw{to{stroke-dashoffset:0}}`}</style>
    </div>
  );
}
