import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TraceState {
  written: Record<string, number>;
  bestFlawless: number;
  recordWritten: (kana: string) => void;
  setBestFlawless: (n: number) => void;
  reset: () => void;
}

const useTraceStore = create<TraceState>()(
  persist(
    set => ({
      written: {},
      bestFlawless: 0,
      recordWritten: kana =>
        set(s => ({ written: { ...s.written, [kana]: (s.written[kana] ?? 0) + 1 } })),
      setBestFlawless: n => set(s => ({ bestFlawless: Math.max(s.bestFlawless, n) })),
      reset: () => set({ written: {}, bestFlawless: 0 }),
    }),
    { name: 'kana-trace-progress' },
  ),
);

export default useTraceStore;
