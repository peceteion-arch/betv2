import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

interface Match {
  id: string;
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchday: number;
  matchDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: Team;
  awayTeam: Team;
}

interface Competition {
  id: string;
  name: string;
  active: boolean;
  logoUrl?: string;
}

export default function AdminStageDetail() {
  const { competitionId, matchday } = useParams();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const compRes = await api.get(`/competitions/${competitionId}`);
        const matchesRes = await api.get(`/competitions/${competitionId}/matches`);
        setCompetition(compRes.data);
        setMatches(matchesRes.data.filter((m: Match) => m.matchday === Number(matchday)));
      } catch (err) {
        setError('Eroare la încărcarea datelor');
      }
    };
    fetchData();
  }, [competitionId, matchday]);

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
      minute: '2-digit'
    });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'LIVE':
        return 'bg-neon-red/20 text-neon-red';
      case 'FINISHED':
        return 'bg-neon-green/20 text-neon-green';
      case 'POSTPONED':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'VOID':
        return 'bg-gray-500/20 text-gray-500';
      default:
        return 'bg-blue-500/20 text-blue-400';
    }
  };

  if (error) return <div className="max-w-4xl mx-auto p-6 text-neon-red">{error}</div>;
  if (!competition) return <div className="max-w-4xl mx-auto p-6">Se încarcă...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <Link to={`/admin/competitii/${competition.id}`} className="text-neon-green text-sm hover:underline">
        &larr; Înapoi la Etape
      </Link>

      <div className="flex items-center gap-4 mt-4 mb-6">
        {competition.logoUrl ? (
          <img src={getLogoUrl(competition.logoUrl)} alt={competition.name} className="w-16 h-16 object-contain" />
        ) : (
          <div className="w-16 h-16 bg-bet-700 rounded-lg flex items-center justify-center">
            <span className="text-xs text-gray-500">Logo</span>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black">{competition.name}</h1>
          <div className="text-neon-green font-bold text-lg">Etapa {matchday}</div>
        </div>
      </div>

      <div className="space-y-3">
        {matches.map((m) => (
          <div key={m.id} className="card-bet p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${getStatusClass(m.status)}`}>{m.status}</span>
              </div>
              <span className="text-xs text-gray-500">{formatDate(m.matchDate)}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 text-right">
                {m.homeScore !== null && m.awayScore !== null ? (
                  <span className="text-lg font-black text-neon-green">{m.homeScore} - {m.awayScore}</span>
                ) : (
                  <span className="text-gray-500">vs</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Link to={`/matches/${m.id}`} className="text-neon-green text-sm hover:underline">
                  {m.homeTeam.name}
                </Link>
                <span className="text-gray-500">VS</span>
                <Link to={`/matches/${m.id}`} className="text-neon-green text-sm hover:underline">
                  {m.awayTeam.name}
                </Link>
              </div>
            </div>
          </div>
        ))}
        {matches.length === 0 && (
          <div className="text-gray-500">Nu există meciuri pentru această etapă.</div>
        )}
      </div>
    </div>
  );
}
