import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';

interface AdminMatch {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  league: string;
  matchday: number;
  matchDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  competition: {
    id: string;
    name: string;
  } | null;
}

interface ScoreForm {
  homeScore: string;
  awayScore: string;
  status: 'LIVE' | 'FINISHED';
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programat',
  LIVE: 'În desfășurare',
  FINISHED: 'Terminat',
  POSTPONED: 'Amânat',
  VOID: 'Anulat',
};

const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;

const getStatusClass = (status: string) => {
  switch (status) {
    case 'LIVE':
      return 'bg-neon-red/20 text-neon-red';
    case 'FINISHED':
      return 'bg-neon-green/20 text-neon-green';
    case 'POSTPONED':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'VOID':
      return 'bg-gray-500/20 text-gray-400';
    default:
      return 'bg-blue-500/20 text-blue-400';
  }
};

export default function AdminMatchDetail() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<AdminMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [scoreForm, setScoreForm] = useState<ScoreForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [unvoiding, setUnvoiding] = useState(false);

  const loadMatch = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/matches/${id}`);
      setMatch(res.data);
    } catch (err: unknown) {
      const message = err instanceof Error && 'response' in err ? (err as any).response?.data?.error : 'Meciul nu a putut fi încărcat';
      setError(message);
      setMatch(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatch();
  }, [id]);

  const getLogoUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    if (import.meta.env.DEV) {
      return `${window.location.protocol}//${window.location.hostname}:3001${url}`;
    }
    return url;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isVoid = match?.status === 'VOID';
  const hasScore = match ? match.homeScore !== null && match.awayScore !== null : false;

  const openScoreForm = () => {
    if (!match) return;
    setScoreForm({
      homeScore: String(match.homeScore ?? 0),
      awayScore: String(match.awayScore ?? 0),
      status: match.status === 'LIVE' ? 'LIVE' : 'FINISHED',
    });
  };

  const handleSaveScore = async () => {
    if (!match || !scoreForm) return;
    if (scoreForm.homeScore === '' || scoreForm.awayScore === '') {
      setError('Completează ambele scoruri înainte de a salva.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/matches/${match.id}/score`, {
        homeScore: Number(scoreForm.homeScore),
        awayScore: Number(scoreForm.awayScore),
        status: scoreForm.status,
      });
      setScoreForm(null);
      await loadMatch();
    } catch (err: unknown) {
      const message = (err as any)?.response?.data?.error || 'Actualizarea rezultatului a eșuat';
      setError(`Nu este posibilă actualizarea rezultatului: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!match) return;
    if (!confirm('Marchează acest meci ca VOID?\nSelecțiile acestui meci vor fi eliminate de pe bilete (cota 1.00). Rezultatul nu va fi 0-0.')) return;
    setVoiding(true);
    setError('');
    try {
      await api.patch(`/matches/${match.id}/void`);
      await loadMatch();
    } catch (err: unknown) {
      const message = (err as any)?.response?.data?.error || 'Marcarea VOID a eșuat';
      setError(`Nu este posibilă marcarea VOID: ${message}`);
    } finally {
      setVoiding(false);
    }
  };

  const handleUnvoid = async () => {
    if (!match) return;
    if (!confirm('Anulează marcaja VOID pentru acest meci?')) return;
    setUnvoiding(true);
    setError('');
    try {
      await api.patch(`/matches/${match.id}/unvoid`);
      await loadMatch();
    } catch (err: unknown) {
      const message = (err as any)?.response?.data?.error || 'Anularea VOID a eșuat';
      setError(`Nu este posibilă anularea VOID: ${message}`);
    } finally {
      setUnvoiding(false);
    }
  };

  if (error && !match) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-white">
        <Link to="/admin" className="text-neon-green text-sm hover:underline">
          &larr; Înapoi
        </Link>
        <div className="card-bet p-6 mt-4">
          <p className="text-neon-red">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !match) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-white flex flex-col items-center justify-center py-16">
        <div className="inline-block w-8 h-8 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4 text-sm">Se încarcă meciul...</p>
      </div>
    );
  }

  const backHref = match.competition
    ? `/admin/competitii/${match.competition.id}/etape/${match.matchday}`
    : '/admin';

  return (
    <div className="max-w-2xl mx-auto p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <Link to={backHref} className="text-neon-green text-sm hover:underline">
          &larr; {match.competition ? `Înapoi la Etapa ${match.matchday}` : 'Înapoi'}
        </Link>
        <Link to={`/matches/${match.id}`} className="text-neon-blue text-sm hover:underline">
          Vezi pagina publică
        </Link>
      </div>

      <h1 className="text-xl font-black mb-4">Administrare meci</h1>

      {/* Meci info */}
      <div className="card-bet p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-xs px-2 py-1 rounded font-bold ${getStatusClass(match.status)}`}>
              {statusLabel(match.status)}
            </span>
          </div>
          <span className="text-xs text-gray-500">{formatDate(match.matchDate)}</span>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 text-right min-w-0">
            <div className="flex flex-col items-end gap-1">
              <p className="text-sm font-bold truncate">{match.homeTeam}</p>
              {match.homeCrest && (
                <img src={getLogoUrl(match.homeCrest)} alt="" className="w-8 h-8 object-contain" />
              )}
            </div>
          </div>

          <div className="min-w-[6rem] text-center flex-shrink-0">
            {hasScore ? (
              <span className="text-2xl font-black text-neon-green">
                {match.homeScore} - {match.awayScore}
              </span>
            ) : (
              <span className="text-2xl font-black text-gray-500">vs</span>
            )}
          </div>

          <div className="flex-1 text-left min-w-0">
            <div className="flex flex-col items-start gap-1">
              <p className="text-sm font-bold truncate">{match.awayTeam}</p>
              {match.awayCrest && (
                <img src={getLogoUrl(match.awayCrest)} alt="" className="w-8 h-8 object-contain" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-bet-700 text-xs text-gray-400 space-y-1">
          <p>
            Competiție: <span className="text-white font-semibold">{match.competition?.name ?? match.league}</span>
          </p>
          <p>
            Etapa: <span className="text-white font-semibold">{match.matchday}</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-neon-red/10 border border-neon-red/30 text-neon-red text-sm">
          {error}
        </div>
      )}

      {/* VOID / UNVOID actions */}
      {isVoid ? (
        <div className="card-bet p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-neon-blue mb-1">Meciul este marcat VOID</p>
              <p className="text-xs text-gray-500">
                Selecțiile acestui meci sunt excluse de pe bilete (cota 1.00).
              </p>
            </div>
            <button
              onClick={handleUnvoid}
              disabled={unvoiding}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-neon-yellow text-black hover:opacity-90 transition-all disabled:opacity-50"
            >
              {unvoiding ? 'Se procesează...' : 'Anulează VOID'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card-bet p-4 mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Mecile activate se pot marca VOID.</p>
            <button
              onClick={handleVoid}
              disabled={voiding}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-bet-700 text-neon-blue hover:opacity-90 transition-all disabled:opacity-50"
            >
              {voiding ? 'Se procesează...' : 'Marchează VOID'}
            </button>
          </div>
        </div>
      )}

      {/* Score form — hidden when the match is VOID, since void is not a result */}
      {!isVoid && (
        <div className="card-bet p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">Resultat</h2>

          {scoreForm ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Scor gazde</label>
                <input
                  type="number"
                  min={0}
                  className="input-bet flex-1"
                  value={scoreForm.homeScore}
                  onChange={(e) => setScoreForm({ ...scoreForm, homeScore: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Scor oaspeți</label>
                <input
                  type="number"
                  min={0}
                  className="input-bet flex-1"
                  value={scoreForm.awayScore}
                  onChange={(e) => setScoreForm({ ...scoreForm, awayScore: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Status</label>
                <select
                  className="input-bet flex-1"
                  value={scoreForm.status}
                  onChange={(e) => setScoreForm({ ...scoreForm, status: e.target.value as 'LIVE' | 'FINISHED' })}
                >
                  <option value="LIVE">LIVE</option>
                  <option value="FINISHED">FINISHED</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveScore}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-neon-green text-black hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {saving ? 'Se salvează...' : 'Salvează rezultatul'}
                </button>
                <button
                  onClick={() => setScoreForm(null)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-all disabled:opacity-50"
                >
                  Anulează
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openScoreForm}
              className="w-full py-2 rounded-lg text-xs font-bold bg-bet-700 text-white hover:opacity-90 transition-all"
            >
              {hasScore ? 'Modifică rezultatul' : 'Adaugă rezultatul'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
