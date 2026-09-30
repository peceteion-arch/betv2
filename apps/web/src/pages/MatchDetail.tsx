import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useBetSlip } from '../store/betSlip';
import BetSlip from '../components/BetSlip';

const MARKET_LABELS: Record<string, string> = {
  '1X2': 'Resultado Final',
  'DUPLA_HIPOTESE': 'Dupla Hipótese',
  'MARCAS_0_5': 'Golos O/U 0.5',
  'MARCAS_1_5': 'Golos O/U 1.5',
  'MARCAS_2_5': 'Golos O/U 2.5',
  'MARCAS_3_5': 'Golos O/U 3.5',
  'MARCAS_4_5': 'Golos O/U 4.5',
  'AMBAS_MARCAM': 'Ambas Marcam',
  'RESULTADO_CORRETO': 'Resultado Correto',
  'HANDICAP_n1_5': 'Handicap -1.5',
  'HANDICAP_n0_5': 'Handicap -0.5',
  'HANDICAP_0_0': 'Handicap 0',
  'HANDICAP_0_5': 'Handicap +0.5',
  'HANDICAP_1_5': 'Handicap +1.5',
  'IMPAR_PAR': 'Ímpar/Par',
  'GOLOS_0': 'Exatamente 0 golos',
  'GOLOS_1': 'Exatamente 1 golo',
  'GOLOS_2': 'Exatamente 2 golos',
  'GOLOS_3': 'Exatamente 3 golos',
  'GOLOS_4': 'Exatamente 4 golos',
  'GOLOS_5': 'Exatamente 5 golos',
  'GOLOS_6': 'Exatamente 6 golos',
};

interface MatchData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  league: string;
  groupStage: string | null;
  matchDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: Array<{ id: string; market: string; selection: string; value: number }>;
}

export default function MatchDetail() {
  const { id } = useParams();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const { addSelection, removeSelection, selections, stake, totalOdds, setSheetOpen } = useBetSlip();

  useEffect(() => {
    if (id) {
      api.get(`/matches/${id}`)
        .then((r) => setMatch(r.data))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleOddsClick = (market: string, selection: string, odds: number) => {
    if (!canBet) return;
    const exists = selections.find((s) => s.matchId === match.id && s.market === market && s.selection === selection);
    if (exists) {
      removeSelection(match.id, market);
    } else {
      addSelection({ matchId: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam, market, selection, odds });
    }
  };

  const isSelected = (market: string, selection: string) =>
    match ? selections.some((s) => s.matchId === match.id && s.market === market && s.selection === selection) : false;

  const canBet = match && match.status === 'SCHEDULED' && new Date(match.matchDate).getTime() > Date.now();

  const groupedOdds = match?.odds?.reduce<Record<string, typeof match.odds>>((acc, odd) => {
    if (!acc[odd.market]) acc[odd.market] = [];
    acc[odd.market].push(odd);
    return acc;
  }, {});

  // Declared before the loading / !match early returns below, so the button
  // still renders while the match is being fetched. This page hides the
  // bottom nav, so the button sits at the bottom of the viewport and opens
  // the same shared sheet as Layout.
  const mobileBilhete = selections.length > 0 ? (
    <div className="lg:hidden">
      {/* Spacer so the fixed button never covers the last market */}
      <div className="h-20" />
      <button
        onClick={() => setSheetOpen(true)}
        aria-label={`Abrir bilhete com ${selections.length} seleções`}
        className="fixed left-0 right-0 bottom-0 z-40 mx-4 bg-neon-green text-black font-black rounded-2xl px-4 py-4 shadow-2xl flex items-center justify-center gap-2 animate-slide-up active:scale-95 transition-all"
        style={{ marginBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        🎟️ Ver Bilhete
        <span>{selections.length}</span>
        <span className="text-sm">· {(stake * totalOdds()).toFixed(0)} CR</span>
      </button>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
        {mobileBilhete}
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Jogo não encontrado</p>
        <Link to="/matches" className="btn-neon text-sm mt-4 inline-block">Voltar</Link>
        {mobileBilhete}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mobileBilhete}

      {/* Back button */}
      <Link to="/matches" className="text-neon-blue text-sm flex items-center gap-1">
        ← Voltar
      </Link>

      {/* Match Header */}
      <div className="card-bet p-4">
        <div className="text-center mb-3">
          <span className="text-[10px] text-gray-500 uppercase">{match.league}</span>
          {match.groupStage && (
            <span className="ml-2 text-[10px] text-neon-blue">{match.groupStage.replace('GROUP_', 'Grupo ')}</span>
          )}
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between gap-2">
          {/* Home */}
          <div className="flex-1 text-right min-w-0">
            <p className={`text-sm font-bold truncate ${match.status === 'FINISHED' && (match.homeScore ?? 0) > (match.awayScore ?? 0) ? 'text-neon-green' : 'text-white'}`}>
              {match.homeTeam}
            </p>
          </div>

          {/* Crest */}
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            {match.homeCrest && <img src={match.homeCrest} alt="" className="w-8 h-8 object-contain" />}
          </div>

          {/* Score */}
          <div className="px-3 flex-shrink-0">
            {match.status === 'FINISHED' ? (
              <span className="text-2xl font-black">{match.homeScore} - {match.awayScore}</span>
            ) : match.status === 'LIVE' || (match.status === 'SCHEDULED' && new Date(match.matchDate).getTime() <= Date.now()) ? (
              <div className="text-center">
                <span className="bg-neon-yellow/20 text-neon-yellow text-[9px] font-bold px-2 py-0.5 rounded-full">EM JOGO</span>
                {match.homeScore !== null && (
                  <p className="font-bold text-lg mt-1">{match.homeScore} - {match.awayScore}</p>
                )}
              </div>
            ) : (
              <div className="text-center">
                <p className="font-bold text-lg text-white">
                  {new Date(match.matchDate).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] text-gray-500">
                  {new Date(match.matchDate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            )}
          </div>

          {/* Crest */}
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            {match.awayCrest && <img src={match.awayCrest} alt="" className="w-8 h-8 object-contain" />}
          </div>

          {/* Away */}
          <div className="flex-1 text-left min-w-0">
            <p className={`text-sm font-bold truncate ${match.status === 'FINISHED' && (match.awayScore ?? 0) > (match.homeScore ?? 0) ? 'text-neon-green' : 'text-white'}`}>
              {match.awayTeam}
            </p>
          </div>
        </div>
      </div>

      {/* Betting disabled banner */}
      {!canBet && (
        <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
          match.status === 'FINISHED'
            ? 'bg-gray-500/10 text-gray-400 border border-gray-500/30'
            : match.status === 'LIVE' || (match.status === 'SCHEDULED' && new Date(match.matchDate).getTime() <= Date.now())
            ? 'bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30'
            : 'bg-gray-500/10 text-gray-400 border border-gray-500/30'
        }`}>
          {match.status === 'FINISHED'
            ? `Terminado: ${match.homeScore} - ${match.awayScore}`
            : match.status === 'LIVE'
            ? 'Em jogo — apostas encerradas'
            : match.status === 'SCHEDULED' && new Date(match.matchDate).getTime() <= Date.now()
            ? 'Em jogo — apostas encerradas'
            : 'Aposta não disponível'}
        </div>
      )}

      {/* Markets */}
      {groupedOdds && Object.entries(groupedOdds).map(([market, odds]: [string, any]) => (
        <div key={market} className="card-bet p-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
            {MARKET_LABELS[market] || market.replace(/_/g, ' ')}
          </h3>
          <div className={`grid gap-1.5 ${market === 'RESULTADO_CORRETO' ? 'grid-cols-3' : odds.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {odds.map((odd: any) => {
              const sel = isSelected(market, odd.selection);
              let label = odd.selection;
              if (market === '1X2') {
                label = odd.selection === '1' ? match.homeTeam : odd.selection === 'X' ? 'Empate' : match.awayTeam;
              }
              return (
                <button
                  key={odd.id}
                  onClick={() => handleOddsClick(market, odd.selection, odd.value)}
                  disabled={!canBet}
                  className={`py-2.5 rounded-lg text-center transition-all ${
                    !canBet
                      ? 'bg-bet-700/50 cursor-not-allowed opacity-50'
                      : sel
                        ? 'bg-neon-green text-black active:scale-95'
                        : 'bg-bet-700 hover:bg-bet-600 active:scale-95'
                  }`}
                >
                  <p className={`text-[9px] uppercase truncate ${sel ? 'text-black/60' : 'text-gray-500'}`}>
                    {label}
                  </p>
                  <p className={`text-xs font-bold ${sel ? 'text-black' : canBet ? 'text-white' : 'text-gray-500'}`}>
                    {Number(odd.value).toFixed(2)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Desktop BetSlip */}
      <div className="hidden lg:block">
        <BetSlip />
      </div>
    </div>
  );
}
