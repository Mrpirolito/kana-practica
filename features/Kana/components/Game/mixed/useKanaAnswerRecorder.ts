'use client';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStatsStore } from '@/features/Progress';
import { useCorrect, useError } from '@/shared/hooks/generic/useAudio';
import { getGlobalAdaptiveSelector } from '@/shared/utils/adaptiveSelection';

const adaptiveSelector = getGlobalAdaptiveSelector();
const isHiragana = (c: string) => c.charCodeAt(0) >= 0x3040 && c.charCodeAt(0) <= 0x309f;

// Records answers from the mixed-mode exercises exactly like the classic games do
export function useKanaAnswerRecorder() {
  const s = useStatsStore(
    useShallow(state => ({
      score: state.score,
      setScore: state.setScore,
      incrementHiraganaCorrect: state.incrementHiraganaCorrect,
      incrementKatakanaCorrect: state.incrementKatakanaCorrect,
      incrementWrongStreak: state.incrementWrongStreak,
      resetWrongStreak: state.resetWrongStreak,
      incrementCorrectAnswers: state.incrementCorrectAnswers,
      incrementWrongAnswers: state.incrementWrongAnswers,
      addCharacterToHistory: state.addCharacterToHistory,
      incrementCharacterScore: state.incrementCharacterScore,
    })),
  );
  const { playCorrect } = useCorrect();
  const { playErrorTwice } = useError();

  const recordCorrect = useCallback(
    (char: string) => {
      playCorrect();
      s.addCharacterToHistory(char);
      s.incrementCharacterScore(char, 'correct');
      s.incrementCorrectAnswers();
      s.setScore(s.score + 1);
      adaptiveSelector.updateCharacterWeight(char, true);
      if (isHiragana(char)) s.incrementHiraganaCorrect();
      else s.incrementKatakanaCorrect();
      s.resetWrongStreak();
    },
    [s, playCorrect],
  );

  const recordWrong = useCallback(
    (char: string) => {
      playErrorTwice();
      s.incrementCharacterScore(char, 'wrong');
      s.incrementWrongAnswers();
      s.setScore(Math.max(0, s.score - 1));
      adaptiveSelector.updateCharacterWeight(char, false);
      s.incrementWrongStreak();
    },
    [s, playErrorTwice],
  );

  // Whole-word answers count toward session totals, not per-kana mastery
  const recordWord = useCallback(
    (good: boolean) => {
      if (good) {
        playCorrect();
        s.incrementCorrectAnswers();
        s.setScore(s.score + 1);
        s.resetWrongStreak();
      } else {
        playErrorTwice();
        s.incrementWrongAnswers();
        s.incrementWrongStreak();
      }
    },
    [s, playCorrect, playErrorTwice],
  );

  return { recordCorrect, recordWrong, recordWord, adaptiveSelector };
}
