import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

interface RankingPlayer {
  id: string;
  name: string;
  balance: number;
  profit: number;
  roi: number;
  betsCount: number;
  betsWon: number;
}

export default function Rankings() {
  const [rankings, setRankings] = useState<RankingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    api.get('/rankings/global')
      .then((r) => setRankings(r.data))
      .catch(() => setError('Erro ao carregar rankings'))
      .finally(() => setLoading(false));
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black">Ranking Global</h1>

      {rankings.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {rankings.slice(0, 3).map((player, i) => (
            <div key={player.id} className={`card-bet p-5 text-center ${i === 0 ? 'border-neon-yellow/30' : ''}`}>
              <div className="text-4xl mb-2">{medals[i]}</div>
              <p className="font-bold">{player.name}</p>
              <p className="text-2xl font-black text-neon-green mt-1">{player.balance.toFixed(2)}</p>
              <p className="text-[10px] text-gray-500">CRÉDITOS</p>
            </div>
          ))}
        </div>
      )}

      <div className="card-bet overflow-hidden">
        {error ? (
          <div className="text-center py-12">
            <p className="text-neon-red text-sm">{error}</p>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rankings.length === 0 ? (
          <p className="text-center py-12 text-gray-500">Sem rankings ainda</p>
        ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-bet-600/50">
              <th className="text-left p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">#</th>
              <th className="text-left p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Jogador</th>
              <th className="text-right p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Saldo</th>
              <th className="text-right p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Lucro</th>
              <th className="text-right p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">ROI</th>
              <th className="text-right p-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Apostas</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((player, i) => (
              <tr
                key={player.id}
                className={`border-b border-bet-700 hover:bg-bet-700/50 transition-colors ${
                  player.id === user?.id ? 'bg-neon-green/5' : ''
                }`}
              >
                <td className="p-4 font-bold text-gray-400">
                  {i < 3 ? medals[i] : i + 1}
                </td>
                <td className="p-4 font-semibold">{player.name}</td>
                <td className="p-4 text-right font-bold text-neon-green">{player.balance.toFixed(2)}</td>
                <td className={`p-4 text-right font-bold ${player.profit >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {player.profit >= 0 ? '+' : ''}{player.profit.toFixed(2)}
                </td>
                <td className="p-4 text-right text-gray-400">{player.roi}%</td>
                <td className="p-4 text-right text-gray-500">{player.betsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
