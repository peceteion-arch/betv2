import { useBetSlip } from '../store/betSlip';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import { useState } from 'react';

interface BetSlipInlineProps {
  onSuccess?: () => void;
}

// Mobile counterpart of BetSlip: same betting logic, but without the
// card/sticky wrapper so it can live inside a bottom sheet. It also drops the
// empty state — the floating button that opens the sheet only renders when
// there is at least one selection, so "no selections" is unreachable here.
export default function BetSlipInline({ onSuccess }: BetSlipInlineProps) {
  const { selections, stake, setStake, totalOdds, clear, removeSelection } = useBetSlip();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handlePlaceBet = async () => {
    if (selections.length === 0 || stake <= 0) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/bets', {
        stake,
        selections: selections.map((s) => ({
          matchId: s.matchId,
          market: s.market,
          selection: s.selection,
          odds: s.odds,
        })),
      });
      clear();
      refreshUser();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // Let the caller close the sheet, but only after the success flash has
      // been on screen briefly — closing instantly would hide the feedback.
      setTimeout(() => onSuccess?.(), 600);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao colocar aposta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {selections.map((s, i) => (
          <div key={i} className="bg-bet-700 rounded-lg p-3 relative group">
            <button
              onClick={() => removeSelection(s.matchId, s.market)}
              className="absolute top-1 right-1 text-gray-600 hover:text-neon-red text-xs opacity-0 group-hover:opacity-100 transition-all"
            >
              ✕
            </button>
            <p className="text-[10px] text-gray-500 uppercase">{s.market.replace(/_/g, ' ').replace('MARCAS', 'GOLOS').replace('IMPAR PAR', 'ÍMPAR/PAR')}</p>
            <p className="text-xs font-semibold mt-0.5">{s.homeTeam} vs {s.awayTeam}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-neon-green font-bold text-sm">
                {s.selection === '1' ? s.homeTeam : s.selection === 'X' ? 'Empate' : s.selection === '2' ? s.awayTeam : s.selection}
              </span>
              <span className="bg-neon-green/10 text-neon-green font-bold text-xs px-2 py-0.5 rounded">
                {Number(s.odds).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Valor</label>
          <div className="flex gap-2 mt-1">
            {[5, 10, 25, 50].map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  stake === amount
                    ? 'bg-neon-green text-black'
                    : 'bg-bet-700 text-gray-400 hover:text-white active:bg-bet-600'
                }`}
              >
                {amount}
              </button>
            ))}
          </div>
          <input
            type="number"
            className="input-bet mt-2 text-center font-mono"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            min={1}
          />
        </div>

        <div className="bg-bet-700 rounded-lg p-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Odd Total</span>
            <span className="font-bold text-white">{totalOdds().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Retorno Potencial</span>
            <span className="font-bold text-neon-green text-lg">{((Math.round((stake * totalOdds()) * 100) / 100)).toFixed(2)} CR</span>
          </div>
        </div>

        <button
          onClick={handlePlaceBet}
          className="btn-neon-solid w-full text-sm"
          disabled={loading || stake <= 0 || stake > (user?.balance || 0)}
        >
          {loading ? 'A colocar...' : stake > (user?.balance || 0) ? 'Saldo insuficiente' : `Apostar ${stake} CR`}
        </button>

        {error && (
          <div className="bg-neon-red/10 border border-neon-red/30 text-neon-red p-2 rounded-lg text-xs text-center animate-slide-up">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-neon-green/10 border border-neon-green/30 text-neon-green p-2 rounded-lg text-xs text-center animate-slide-up">
            Aposta colocada com sucesso!
          </div>
        )}
      </div>
    </div>
  );
}
