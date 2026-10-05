import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useBetSlip } from '../store/betSlip';
import BetSlip from '../components/BetSlip';

interface MatchOdds {
  id: string;
  market: string;
  selection: string;
  value: number;
}

interface MatchItem {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  league: string;
  matchDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: MatchOdds[];
}

export default function Matches() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const { addSelection, selections, removeSelection } = useBetSlip();

  useEffect(() => {
    setLoading(true);
    setError('');
    const endpoint = filter === 'live' ? '/matches/live' : '/matches';
    api.get(endpoint)
      .then((r) => setMatches(Array.isArray(r.data) ? r.data : r.data.items || []))
      .catch(() => setError('Erro ao carregar jogos'))
      .finally(() => setLoading(false));
  }, [filter, retry]);

  const handleOddsClick = (match: MatchItem, market: string, selection: string, odds: number) => {
    const exists = selections.find((s) => s.matchId === match.id && s.market === market && s.selection === selection);
    if (exists) {
      removeSelection(match.id, market);
    } else {
      addSelection({ matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam, market, selection, odds });
    }
  };

  const isSelected = (matchId: string, market: string, selection: string) =>
    selections.some((s) => s.matchId === matchId && s.market === market && s.selection === selection);

  const getOddsByMarket = (odds: MatchOdds[], market: string) => odds?.filter((o) => o.market === market) || [];

  const canBet = (match: MatchItem) => {
    if (match.status === 'FINISHED') return false;
    if (match.status === 'LIVE') return false;
    if (match.status === 'CANCELLED') return false;
    const matchTime = new Date(match.matchDate).getTime();
    const now = Date.now();
    if (now >= matchTime) return false;
    return true;
  };

  const getMatchStatus = (match: MatchItem) => {
    if (match.status === 'FINISHED') return { text: 'Terminado', color: 'text-gray-400' };
    if (match.status === 'CANCELLED') return { text: 'Cancelado', color: 'text-neon-red' };
    if (match.status === 'LIVE') return { text: 'Em jogo', color: 'text-neon-red' };
    const matchTime = new Date(match.matchDate).getTime();
    const now = Date.now();
    if (now >= matchTime) return { text: 'Em jogo', color: 'text-neon-yellow' };
    return null;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black">⚽ Mundial 2026</h1>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              filter === 'all' ? 'bg-neon-green text-black' : 'bg-bet-700 text-gray-400'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('live')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1 ${
              filter === 'live' ? 'bg-neon-red text-white' : 'bg-bet-700 text-gray-400'
            }`}
          >
            {filter === 'live' && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
            Vivo
          </button>
        </div>
      </div>

      {/* Selections count */}
      {selections.length > 0 && (
        <div className="bg-neon-green/10 border border-neon-green/30 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-neon-green font-semibold">{selections.length} seleção(ões)</span>
          <Link to="/bets" className="text-xs text-neon-green underline">Ver bilhete</Link>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-16">
          <p className="text-neon-red text-sm mb-2">{error}</p>
          <button onClick={() => setRetry((r) => r + 1)} className="btn-neon text-xs">Tentar</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && matches.length === 0 && (
        <div className="text-center py-16">
          <span className="text-4xl block mb-2">⚽</span>
          <p className="text-gray-500">Sem jogos</p>
        </div>
      )}

      {/* Matches */}
      {!loading && matches.map((match) => {
        const odds1x2 = getOddsByMarket(match.odds, '1X2');
        const bettable = canBet(match);
        const status = getMatchStatus(match);
        return (
          <div key={match.id} className={`card-bet ${!bettable ? 'opacity-60' : ''}`}>
            {/* Teams + Score */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {match.homeCrest && <img src={match.homeCrest} alt="" className="w-5 h-5 object-contain" />}
                  <span className={`text-sm font-semibold truncate ${
                    match.status === 'FINISHED' && (match.homeScore ?? 0) > (match.awayScore ?? 0) ? 'text-neon-green' : 'text-white'
                  }`}>{match.homeTeam}</span>
                </div>
                <div className="px-3 min-w-[70px] text-center">
                  {match.status === 'FINISHED' ? (
                    <span className="font-black">{match.homeScore} - {match.awayScore}</span>
                  ) : status ? (
                    <div>
                      <span className={`text-xs font-bold ${status.color}`}>{status.text}</span>
                      {match.homeScore !== null && (
                        <p className="font-bold text-sm">{match.homeScore ?? 0} - {match.awayScore ?? 0}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {new Date(match.matchDate).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <span className={`text-sm font-semibold truncate text-right ${
                    match.status === 'FINISHED' && (match.awayScore ?? 0) > (match.homeScore ?? 0) ? 'text-neon-green' : 'text-white'
                  }`}>{match.awayTeam}</span>
                  {match.awayCrest && <img src={match.awayCrest} alt="" className="w-5 h-5 object-contain" />}
                </div>
              </div>

              {/* Odds 1X2 */}
              <div className="grid grid-cols-3 gap-1.5">
                {odds1x2.map((odd) => {
                  const sel = isSelected(match.id, '1X2', odd.selection);
                  const label = odd.selection === '1' ? match.homeTeam.slice(0, 8) : odd.selection === 'X' ? 'Empate' : match.awayTeam.slice(0, 8);
                  return (
                    <button
                      key={odd.id}
                      onClick={() => bettable && handleOddsClick(match, '1X2', odd.selection, odd.value)}
                      disabled={!bettable}
                      className={`py-2.5 rounded-lg text-center transition-all ${
                        !bettable
                          ? 'bg-bet-700/50 cursor-not-allowed opacity-50'
                          : sel
                            ? 'bg-neon-green text-black font-bold active:scale-95'
                            : 'bg-bet-700 hover:bg-bet-600 active:scale-95'
                      }`}
                    >
                      <p className={`text-[9px] truncate ${sel ? 'text-black/60' : 'text-gray-500'}`}>
                        {label}
                      </p>
                      <p className={`text-xs font-bold ${sel ? 'text-black' : bettable ? 'text-white' : 'text-gray-500'}`}>
                        {Number(odd.value).toFixed(2)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Link to detail */}
            <Link
              to={`/matches/${match.id}`}
              className="block text-center py-2 text-xs text-neon-blue border-t border-bet-700 hover:bg-bet-700/50"
            >
              +{Math.max(0, (match.odds?.length || 0) - 3)} mercados
            </Link>
          </div>
        );
      })}

      {/* Desktop BetSlip */}
      <div className="hidden lg:block">
        <BetSlip />
      </div>
    </div>
  );
}
