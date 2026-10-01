import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

interface BetSelection {
  id: string;
  matchId: string;
  market: string;
  selection: string;
  odds: number;
  won: boolean | null;
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    matchDate: string;
  };
}

interface Bet {
  id: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: string;
  createdAt: string;
  selections: BetSelection[];
}

interface BetPage {
  items: Bet[];
  nextCursor: string | null;
}

// Mirrors the server's cancel() rule: a ticket is only cancellable while every
// match is SCHEDULED *and* its kick-off is still ahead of us. Hiding the
// button on any other basis (PENDING alone) is what let the UI offer to cancel
// tickets whose legs had already been played.
const canCancel = (bet: Bet) => {
  if (bet.status !== 'PENDING') return false;
  const now = Date.now();
  return bet.selections.every(
    (s) => s.match.status === 'SCHEDULED' && new Date(s.match.matchDate).getTime() > now
  );
};

export default function Bets() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { refreshUser } = useAuth();

  const buildUrl = (status: string, cur?: string | null) => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (cur) params.set('cursor', cur);
    const qs = params.toString();
    return `/bets${qs ? `?${qs}` : ''}`;
  };

  // The API has always answered with { items, nextCursor } — unwrap it in one
  // place so the list, the "load more" append and the post-cancel refetch all
  // read the same shape.
  const fetchPage = async (status: string, cur?: string | null): Promise<BetPage> => {
    const r = await api.get(buildUrl(status, cur));
    return Array.isArray(r.data) ? { items: r.data, nextCursor: null } : (r.data as BetPage);
  };

  // Filters are applied server-side, not by filtering the loaded page: the old
  // code fetched everything and narrowed it in the browser, so the summary
  // cards counted one status out of whatever page happened to be loaded.
  useEffect(() => {
    setLoading(true);
    setError('');
    setCursor(null);
    fetchPage(filter)
      .then((data) => {
        setBets(data.items || []);
        setCursor(data.nextCursor ?? null);
      })
      .catch(() => setError('Erro ao carregar apostas'))
      .finally(() => setLoading(false));
    // fetchPage/buildUrl are pure and derived from `filter`; `filter` is the
    // real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleLoadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(filter, cursor);
      // Append: the cursor page holds tickets older than what is on screen.
      setBets((prev) => [...prev, ...(data.items || [])]);
      setCursor(data.nextCursor ?? null);
    } catch {
      setError('Erro ao carregar mais apostas');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCancel = async (betId: string) => {
    if (!confirm('Cancelar aposta?')) return;
    try {
      await api.post(`/bets/${betId}/cancel`);
      refreshUser();
      setBets((prev) => prev.map((b) => b.id === betId ? { ...b, status: 'CANCELLED' } : b));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro');
      // A 409 means the server refused: a match had already started, or another
      // settlement run got there first. What we hold for this bet is stale, so
      // pull the real state back rather than guessing — and since the cursor
      // page may have been split across the refetch, restart from the top.
      const status = err?.response?.status;
      if (status === 409 || status === 400) {
        try {
          const data = await fetchPage(filter);
          setBets(data.items || []);
          setCursor(data.nextCursor ?? null);
        } catch {
          setError('Erro ao carregar apostas');
        }
      }
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'WON': return { bg: 'bg-green-500', text: 'text-green-400', label: 'GANHOU', icon: '✓' };
      case 'LOST': return { bg: 'bg-red-500', text: 'text-red-400', label: 'PERDEU', icon: '✗' };
      case 'PENDING': return { bg: 'bg-yellow-500', text: 'text-yellow-400', label: 'PENDENTE', icon: '•' };
      default: return { bg: 'bg-gray-500', text: 'text-gray-400', label: 'CANCELADO', icon: '—' };
    }
  };

  const getSelectionLabel = (s: BetSelection) => {
    if (s.selection === '1') return s.match.homeTeam;
    if (s.selection === 'X') return 'Empate';
    if (s.selection === '2') return s.match.awayTeam;
    return s.selection;
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Title */}
      <h1 className="text-xl font-black">Meus Bilhetes</h1>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'Todos', color: 'bg-gray-700 text-gray-300' },
          { key: 'PENDING', label: 'Pendentes', color: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
          { key: 'WON', label: 'Ganhos', color: 'bg-green-500/20 text-green-400 border border-green-500/30' },
          { key: 'LOST', label: 'Perdidos', color: 'bg-red-500/20 text-red-400 border border-red-500/30' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
              filter === f.key ? f.color : 'bg-gray-800 text-gray-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary Cards — only on the unfiltered view. Under a status filter the
          list holds one status, so these would read 0/0/n and just be noise. */}
      {filter === 'all' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-400">{bets.filter((b) => b.status === 'WON').length}</p>
            <p className="text-[10px] text-green-400/70 uppercase">Ganhos</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-400">{bets.filter((b) => b.status === 'LOST').length}</p>
            <p className="text-[10px] text-red-400/70 uppercase">Perdidos</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-yellow-400">{bets.filter((b) => b.status === 'PENDING').length}</p>
            <p className="text-[10px] text-yellow-400/70 uppercase">Pendentes</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-16">
          <p className="text-neon-red text-sm mb-2">{error}</p>
          <button onClick={() => setFilter((f) => (f === 'all' ? '' : 'all') + filter)} className="btn-neon text-xs">Tentar</button>
        </div>
      )}

      {/* Loading */}
      {!error && loading && (
        <div className="text-center py-20">
          <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && bets.length === 0 && (
        <div className="text-center py-20 bg-gray-800/50 rounded-2xl">
          <span className="text-5xl block mb-4">🎟️</span>
          <p className="text-gray-300 font-semibold">Nenhuma aposta</p>
          <p className="text-gray-600 text-sm mt-2">Visita os jogos e faz a tua primeira aposta</p>
        </div>
      )}

      {/* Bets */}
      <div className="space-y-3">
        {bets.map((bet) => {
          const s = getStatusStyle(bet.status);
          const profit = bet.status === 'WON' ? bet.potentialReturn - bet.stake : bet.status === 'LOST' ? -bet.stake : 0;

          return (
            <div key={bet.id} className="bg-gray-800 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center text-white font-bold text-lg`}>
                    {s.icon}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{s.label}</p>
                    <p className="text-[11px] text-gray-500">{bet.selections.length} selec{bet.selections.length === 1 ? 'ção' : 'ções'} — {new Date(bet.createdAt).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${s.text}`}>
                    {bet.status === 'WON' ? '+' : ''}{profit.toFixed(0)} CR
                  </p>
                  <p className="text-[10px] text-gray-600">Stake: {bet.stake} CR</p>
                </div>
              </div>

              {/* Selections */}
              <div className="px-4 pb-4 space-y-2">
                {bet.selections.map((sel) => {
                  // A voided match leaves won === null, but that is NOT the same
                  // as a selection still waiting for its result. Telling them
                  // apart matters: a void leg drops out of the accumulator at
                  // odds 1.00, while an undecided leg is still in play.
                  const isVoid = sel.match.status === 'VOID';
                  // The match is over and was played normally, but the result
                  // was never recorded (or we lack the data this market needs,
                  // e.g. half-time scores). That is NOT the same as a match that
                  // has not kicked off: this leg can never be decided, while a
                  // scheduled match still can.
                  const awaitingDecision =
                    sel.won === null && sel.match.status === 'FINISHED' && !isVoid;
                  return (
                  <div key={sel.id} className={`flex items-center justify-between p-3 rounded-xl text-sm ${
                    sel.won === true ? 'bg-green-500/10 border border-green-500/20' :
                    sel.won === false ? 'bg-red-500/10 border border-red-500/20' :
                    isVoid ? 'bg-neon-blue/10 border border-neon-blue/20' :
                    'bg-gray-700/50'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{sel.match.homeTeam} vs {sel.match.awayTeam}</p>
                      <p className={`text-xs ${sel.won === true ? 'text-green-400' : sel.won === false ? 'text-red-400' : isVoid ? 'text-neon-blue' : 'text-gray-400'}`}>
                        {getSelectionLabel(sel)} @ {sel.odds.toFixed(2)}
                        {isVoid && <span className="ml-2 text-neon-blue font-semibold">VOID</span>}
                      </p>
                    </div>
                    {isVoid ? (
                      <div className="text-right mr-3">
                        <p className="text-[10px] text-neon-blue font-bold">Cota efetiva</p>
                        <p className="font-bold text-sm text-neon-blue">1.00</p>
                      </div>
                    ) : sel.match.status === 'FINISHED' ? (
                      <div className="text-right mr-3">
                        <p className="text-[10px] text-gray-500">Resultado</p>
                        <p className="font-bold text-sm">{sel.match.homeScore} - {sel.match.awayScore}</p>
                      </div>
                    ) : (
                      <div className="text-right mr-3">
                        <p className="text-[10px] text-gray-600">Agendado</p>
                        <p className="text-[10px] text-gray-500">{new Date(sel.match.matchDate).toLocaleDateString('pt-PT')}</p>
                      </div>
                    )}
                    {awaitingDecision ? (
                      <span className="text-[10px] text-gray-500 text-right leading-tight max-w-20">
                        A aguardar decisão
                      </span>
                    ) : (
                      <span className="text-lg">
                        {sel.won === true ? '✅' : sel.won === false ? '❌' : isVoid ? '➖' : '⏳'}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>

              {/* Bottom Bar */}
              <div className="px-4 pb-4 flex items-center justify-between">
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Stake: <b className="text-white">{bet.stake} CR</b></span>
                  <span>Odds: <b className="text-white">{bet.totalOdds.toFixed(2)}</b></span>
                  <span>Retorno: <b className="text-blue-400">{bet.potentialReturn.toFixed(0)} CR</b></span>
                </div>
                {canCancel(bet) && (
                  <button
                    onClick={() => handleCancel(bet.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 active:scale-95"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination — the API has always returned { items, nextCursor }; the
          cursor was being dropped, so older tickets were unreachable. */}
      {!error && !loading && cursor && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full py-2.5 rounded-xl text-xs font-bold bg-gray-800 text-gray-300 active:scale-95 disabled:opacity-50"
        >
          {loadingMore ? 'A carregar...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
