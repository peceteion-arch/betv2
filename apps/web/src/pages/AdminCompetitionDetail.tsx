import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
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

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programat',
  LIVE: 'În desfășurare',
  FINISHED: 'Terminat',
  POSTPONED: 'Amânat',
  VOID: 'Anulat',
};

const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;

export default function AdminCompetitionDetail() {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [compRes, matchesRes] = await Promise.all([
          api.get(`/competitions/${competitionId}`),
          api.get(`/competitions/${competitionId}/matches`),
        ]);
        setCompetition(compRes.data);
        setMatches(matchesRes.data);
      } catch (err) {
        setError('Eroare la încărcarea datelor');
      }
    };
    fetchData();
  }, [competitionId]);

  const getLogoUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    if (import.meta.env.DEV) {
      return `${window.location.protocol}//${window.location.hostname}:3001${url}`;
    }
    return url;
  };

  // Group matches by matchday
  const stages = matches.reduce((acc, m) => {
    if (!acc[m.matchday]) acc[m.matchday] = [];
    acc[m.matchday].push(m);
    return acc;
  }, {} as Record<number, Match[]>);

  const sortedStages = Object.keys(stages).map(Number).sort((a, b) => a - b);

  const getStatusSummary = (matches: Match[]) => {
    const counts: Record<string, number> = {};
    matches.forEach(m => {
      counts[m.status] = (counts[m.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => `${count} ${statusLabel(status).toLowerCase()}`).join(', ');
  };

  if (error) return <div className="max-w-4xl mx-auto p-6 text-neon-red">{error}</div>;
  if (!competition) return <div className="max-w-4xl mx-auto p-6">Se încarcă...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <Link to="/admin/competitii" className="text-neon-green text-sm hover:underline">
        &larr; Înapoi la Competiții
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
          <span className={`text-sm px-2 py-1 rounded ${competition.active ? 'bg-neon-green/20 text-neon-green' : 'bg-gray-500/20 text-gray-500'}`}>
            {competition.active ? 'Activă' : 'Inactivă'}
          </span>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Etape</h2>

      <div className="space-y-3">
        {sortedStages.map(matchday => {
          const stageMatches = stages[matchday];
          return (
            <button
              key={matchday}
              onClick={() => navigate(`/admin/competitii/${competition.id}/etape/${matchday}`)}
              className="card-bet p-4 w-full flex items-center justify-between gap-4 hover:border-neon-green/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-neon-green">Etapa {matchday}</span>
                <span className="text-sm text-gray-400">({stageMatches.length} meciuri)</span>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">{getStatusSummary(stageMatches)}</div>
                <div className="text-sm text-neon-green">Vezi meciurile &rarr;</div>
              </div>
            </button>
          );
        })}
        {sortedStages.length === 0 && (
          <div className="text-gray-500">Nu există etape în această competiție.</div>
        )}
      </div>
    </div>
  );
}
