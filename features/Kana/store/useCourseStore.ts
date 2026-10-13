import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CourseScript = 'hiragana' | 'katakana';

interface CourseState {
  /** Syllabary reviewed at the start of each day */
  warmupScript: CourseScript;
  lastWarmupDay: string | null;
  wordsCorrect: Record<CourseScript, number>;
  setWarmupScript: (script: CourseScript) => void;
  markWarmupDone: (day: string) => void;
  addWordCorrect: (script: CourseScript) => void;
}

const useCourseStore = create<CourseState>()(
  persist(
    set => ({
      warmupScript: 'hiragana',
      lastWarmupDay: null,
      wordsCorrect: { hiragana: 0, katakana: 0 },
      setWarmupScript: warmupScript => set({ warmupScript }),
      markWarmupDone: day => set({ lastWarmupDay: day }),
      addWordCorrect: script =>
        set(s => ({
          wordsCorrect: { ...s.wordsCorrect, [script]: s.wordsCorrect[script] + 1 },
        })),
    }),
    { name: 'kana-course' },
  ),
);

export default useCourseStore;
