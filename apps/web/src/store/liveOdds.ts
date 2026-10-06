import { create } from 'zustand';

interface LiveOdd {
  value: number;
  enabled: boolean;
  trend: 'up' | 'down' | null;
}

interface LiveOddsStore {
  liveOdds: Map<string, LiveOdd>;
  setOdd: (key: string, value: number, enabled: boolean) => void;
  clearTrend: (key: string) => void;
}

export const useLiveOdds = create<LiveOddsStore>((set) => ({
  liveOdds: new Map(),

  setOdd: (key, value, enabled) => {
    set((state) => {
      const old = state.liveOdds.get(key);
      let trend: 'up' | 'down' | null = null;
      if (old) {
        if (value > old.value) trend = 'up';
        else if (value < old.value) trend = 'down';
      }

      const newMap = new Map(state.liveOdds);
      newMap.set(key, { value, enabled, trend });
      return { liveOdds: newMap };
    });
    
    // Clear trend after 8s
    setTimeout(() => {
      set((state) => {
        const item = state.liveOdds.get(key);
        if (item?.trend) {
          const newMap = new Map(state.liveOdds);
          newMap.set(key, { ...item, trend: null });
          return { liveOdds: newMap };
        }
        return state;
      });
    }, 8000);
  },

  clearTrend: (key) => {
    set((state) => {
      const item = state.liveOdds.get(key);
      if (item?.trend) {
        const newMap = new Map(state.liveOdds);
        newMap.set(key, { ...item, trend: null });
        return { liveOdds: newMap };
      }
      return state;
    });
  }
}));
