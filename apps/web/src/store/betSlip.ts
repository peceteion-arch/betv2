import { create } from 'zustand';

interface BetSelection {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  odds: number;
}

interface BetSlipStore {
  selections: BetSelection[];
  stake: number;
  // Mobile bottom sheet visibility. Lives here rather than in Layout so pages
  // without a bottom nav (match detail) can open the same sheet.
  sheetOpen: boolean;
  addSelection: (selection: BetSelection) => void;
  removeSelection: (matchId: string, market: string) => void;
  setStake: (stake: number) => void;
  setSheetOpen: (open: boolean) => void;
  clear: () => void;
  totalOdds: () => number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export const useBetSlip = create<BetSlipStore>((set, get) => {
  return {
    selections: [],
    stake: 10,
    sheetOpen: false,

    addSelection: (selection) => {
      set((state) => {
        const exists = state.selections.find(
          (s) => s.matchId === selection.matchId && s.market === selection.market
        );
        if (exists) {
          return {
            selections: state.selections.map((s) =>
              s.matchId === selection.matchId && s.market === selection.market
                ? selection
                : s
            ),
          };
        }
        return { selections: [...state.selections, selection] };
      });
    },

    removeSelection: (matchId, market) => {
      set((state) => ({
        selections: state.selections.filter(
          (s) => !(s.matchId === matchId && s.market === market)
        ),
      }));
    },

    setStake: (stake) => set({ stake }),

    setSheetOpen: (sheetOpen) => set({ sheetOpen }),

    clear: () => set({ selections: [], stake: 10, sheetOpen: false }),

    totalOdds: () => {
      const { selections } = get();
      const raw = selections.reduce((acc, s) => acc * s.odds, 1);
      return round2(raw);
    },
  };
});

// Selector for derived totalOdds — use this in components instead of calling totalOdds()
export const selectTotalOdds = (state: BetSlipStore) => {
  const raw = state.selections.reduce((acc, s) => acc * s.odds, 1);
  return round2(raw);
};