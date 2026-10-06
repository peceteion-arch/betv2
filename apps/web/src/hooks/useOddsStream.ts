import { useEffect } from 'react';
import { useLiveOdds } from '../store/liveOdds';
import { useBetSlip } from '../store/betSlip';

export const useOddsStream = () => {
  const setOdd = useLiveOdds((s) => s.setOdd);
  const updateSlip = useBetSlip((s) => s.updateOdds);

  useEffect(() => {
    const es = new EventSource('/api/odds/stream');

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const { matchId, market, selection, value, enabled } = data;
      const key = `${matchId}|${market}|${selection}`;

      setOdd(key, value, enabled);
      updateSlip(matchId, market, selection, value);
    };

    es.onerror = () => {
      // Reconnection handled automatically by EventSource
    };

    return () => es.close();
  }, [setOdd, updateSlip]);
};
