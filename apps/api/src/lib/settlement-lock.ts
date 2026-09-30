// Shared in-memory settlement lock.
//
// The cron endpoint and the admin POST /bets/settle route both trigger
// settlePendingBets(). They must share one flag, otherwise two concurrent
// triggers (e.g. the scheduled cron plus a manual admin call) both pass their
// own guard and enter settlement at the same time. The per-bet updateMany
// guard in bet.service.ts is the real correctness net; this just avoids the
// duplicated work and the 500s that a rollback under contention would cause.
export let settleRunning = false;

export const setSettleRunning = (value: boolean) => {
  settleRunning = value;
};
