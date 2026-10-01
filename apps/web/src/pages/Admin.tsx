import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  balance: number;
  betsCount: number;
  betsWon: number;
  roi: number;
  profit: number;
  role: string;
  isBlocked: boolean;
  createdAt: string;
}

interface AdminGroup {
  id: string;
  name: string;
  admin: { id: string; name: string };
  _count: { members: number };
}

interface AdminStats {
  totalUsers: number;
  totalBets: number;
  totalGroups: number;
  pendingBets: number;
  totalWon: number;
  totalLost: number;
}

interface AdminMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  country: string;
  odds: any[];
}

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [tab, setTab] = useState<'stats' | 'users' | 'groups' | 'sync' | 'meciuri'>('stats');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', balance: 100 });
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [matchForm, setMatchForm] = useState({
    homeTeam: '', awayTeam: '',
    league: 'Minifotbal', matchDate: ''
  });
  const [scoreEdit, setScoreEdit] = useState<{
    matchId: string; homeScore: string; awayScore: string
  } | null>(null);
  const [matchError, setMatchError] = useState('');
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get('/admin/stats').then((r) => setStats(r.data));
    api.get('/admin/users').then((r) => setUsers(r.data.users));
    api.get('/admin/groups').then((r) => setGroups(r.data));
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'ADMIN' || tab !== 'meciuri') return;
    api.get('/matches/all').then((r) => setMatches(r.data));
  }, [user, tab]);

  if (user?.role !== 'ADMIN') {
    return <div className="text-center py-16 text-neon-red">Acesso negado</div>;
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/admin/users', newUser);
      setUsers((prev) => [r.data, ...prev]);
      setNewUser({ name: '', email: '', password: '', balance: 100 });
      setShowCreateUser(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar utilizador');
    }
  };

  const handleBlockUser = async (userId: string, blocked: boolean) => {
    try {
      await api.patch(`/admin/users/${userId}`, { isBlocked: blocked });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBlocked: blocked } : u));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao bloquear utilizador';
      alert(message);
    }
  };

  const handleSetBalance = async (userId: string, balance: number) => {
    try {
      await api.patch(`/admin/users/${userId}`, { balance });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, balance } : u));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao definir saldo';
      alert(message);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`Eliminar utilizador "${name}"?`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao eliminar');
    }
  };

  const handleSyncMatches = async () => {
    const r = await api.post('/matches/sync');
    alert(r.data.message);
  };

  const handleSyncOdds = async () => {
    const r = await api.post('/matches/sync-odds');
    alert(r.data.message);
  };

  const handleCreateMatch = async () => {
    setMatchError('');
    setMatchLoading(true);
    try {
      const r = await api.post('/matches/manual', matchForm);
      setMatches((prev) => [r.data, ...prev]);
      setMatchForm({ homeTeam: '', awayTeam: '', league: 'Minifotbal', matchDate: '' });
    } catch (err: any) {
      setMatchError(err.response?.data?.error || 'Erro ao criar jogo');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleUpdateScore = async () => {
    if (!scoreEdit) return;
    setMatchError('');
    try {
      const r = await api.patch(`/matches/${scoreEdit.matchId}/score`, {
        homeScore: Number(scoreEdit.homeScore),
        awayScore: Number(scoreEdit.awayScore),
        status: 'FINISHED',
      });
      setMatches((prev) => prev.map((m) => (m.id === scoreEdit.matchId ? r.data : m)));
      setScoreEdit(null);
    } catch (err: any) {
      setMatchError(err.response?.data?.error || 'Erro ao atualizar resultado');
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm('Eliminar jogo?')) return;
    try {
      await api.delete(`/matches/${matchId}`);
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao eliminar jogo');
    }
  };

  const handleSettle = async () => {
    await api.post('/bets/settle');
    alert('Settlement executat!');
  };

  // VOID means "this event produced no playable result". Its legs drop out of
  // any accumulator at odds 1.00; it is not a 0-0 result and does not cancel
  // the tickets that referenced it.
  const handleVoidMatch = async (matchId: string) => {
    if (!confirm('Marchas este jogo como VOID?\n\nAs seleções deste jogo passam a contar com cota 1.00 nos bilhetes. O jogo não fica com resultado 0-0.')) return;
    try {
      const r = await api.patch(`/matches/${matchId}/void`);
      setMatches((prev) => prev.map((m) => (m.id === matchId ? r.data : m)));
    } catch (err: any) {
      setMatchError(err.response?.data?.error || 'Erro ao marcar jogo como VOID');
    }
  };

  const handleUnvoidMatch = async (matchId: string) => {
    if (!confirm('Anular a marcação VOID deste jogo?')) return;
    try {
      const r = await api.patch(`/matches/${matchId}/unvoid`);
      setMatches((prev) => prev.map((m) => (m.id === matchId ? r.data : m)));
    } catch (err: any) {
      setMatchError(err.response?.data?.error || 'Erro ao anular marcação VOID');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black">Painel de Administração</h1>

      <div className="flex gap-2">
        {(['stats', 'users', 'groups', 'sync', 'meciuri'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
              tab === t ? 'bg-neon-green text-black' : 'bg-bet-700 text-gray-400 hover:text-white'
            }`}
          >
            {t === 'stats' ? 'Estatísticas' : t === 'users' ? 'Utilizadores' : t === 'groups' ? 'Grupos' : t === 'meciuri' ? 'Meciuri' : 'Sincronizar'}
          </button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Utilizadores</p>
            <p className="text-3xl font-black text-neon-green">{stats.totalUsers}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Apostas</p>
            <p className="text-3xl font-black text-white">{stats.totalBets}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Grupos</p>
            <p className="text-3xl font-black text-neon-blue">{stats.totalGroups}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Pendentes</p>
            <p className="text-3xl font-black text-neon-yellow">{stats.pendingBets}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Ganhos</p>
            <p className="text-3xl font-black text-neon-green">{stats.totalWon}</p>
          </div>
          <div className="stat-card">
            <p className="text-[10px] uppercase text-gray-500">Perdidos</p>
            <p className="text-3xl font-black text-neon-red">{stats.totalLost}</p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">{users.length} utilizadores</p>
            <button onClick={() => setShowCreateUser(!showCreateUser)} className="btn-neon text-sm">
              + Criar Utilizador
            </button>
          </div>

          {showCreateUser && (
            <form onSubmit={handleCreateUser} className="card-bet p-5 space-y-3 animate-slide-up">
              {error && <p className="text-neon-red text-sm">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <input className="input-bet" placeholder="Nome" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
                <input className="input-bet" placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                <input className="input-bet" placeholder="Password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={6} />
                <input className="input-bet" placeholder="Saldo inicial" type="number" value={newUser.balance} onChange={(e) => setNewUser({ ...newUser, balance: Number(e.target.value) })} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-neon-solid text-sm">Criar</button>
                <button type="button" onClick={() => setShowCreateUser(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </form>
          )}

          <div className="card-bet overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bet-600/50">
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Nome</th>
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Email</th>
                  <th className="text-right p-3 text-[10px] uppercase text-gray-500">Saldo</th>
                  <th className="text-right p-3 text-[10px] uppercase text-gray-500">Role</th>
                  <th className="text-right p-3 text-[10px] uppercase text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-bet-700 hover:bg-bet-700/50">
                    <td className="p-3 text-sm">{u.name}</td>
                    <td className="p-3 text-sm text-gray-400">{u.email}</td>
                    <td className="p-3 text-sm text-right font-bold text-neon-green">{u.balance.toFixed(2)}</td>
                    <td className="p-3 text-sm text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${u.role === 'ADMIN' ? 'bg-neon-blue/20 text-neon-blue' : 'bg-bet-600 text-gray-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { const val = prompt('Novo saldo:', u.balance.toString()); if (val !== null) handleSetBalance(u.id, parseFloat(val)); }} className="text-[10px] text-neon-yellow hover:underline">Saldo</button>
                        <button onClick={() => handleBlockUser(u.id, !u.isBlocked)} className={`text-[10px] ${u.isBlocked ? 'text-neon-green' : 'text-neon-red'} hover:underline`}>{u.isBlocked ? 'Desbloquear' : 'Bloquear'}</button>
                        {u.role !== 'ADMIN' && <button onClick={() => handleDeleteUser(u.id, u.name)} className="text-[10px] text-neon-red hover:underline">Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'groups' && (
        <div className="card-bet overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bet-600/50">
                <th className="text-left p-3 text-[10px] uppercase text-gray-500">Nome</th>
                <th className="text-left p-3 text-[10px] uppercase text-gray-500">Admin</th>
                <th className="text-right p-3 text-[10px] uppercase text-gray-500">Membros</th>
                <th className="text-right p-3 text-[10px] uppercase text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-bet-700 hover:bg-bet-700/50">
                  <td className="p-3 text-sm">{g.name}</td>
                  <td className="p-3 text-sm text-gray-400">{g.admin?.name}</td>
                  <td className="p-3 text-sm text-right">{g._count.members}</td>
                  <td className="p-3 text-right">
                    <button onClick={async () => { if (confirm(`Eliminar grupo "${g.name}"?`)) { await api.delete(`/admin/groups/${g.id}`); setGroups((prev) => prev.filter((grp) => grp.id !== g.id)); } }} className="text-[10px] text-neon-red hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'meciuri' && (
        <div className="space-y-4">
          <div className="card-bet p-5 space-y-4">
            <h3 className="font-bold text-sm">Adicionar Jogo Manual</h3>
            {matchError && <p className="text-neon-red text-sm">{matchError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input-bet"
                placeholder="Casa (ex: FC Nando)"
                value={matchForm.homeTeam}
                onChange={(e) => setMatchForm({ ...matchForm, homeTeam: e.target.value })}
              />
              <input
                className="input-bet"
                placeholder="Fora (ex: Sporting Galați)"
                value={matchForm.awayTeam}
                onChange={(e) => setMatchForm({ ...matchForm, awayTeam: e.target.value })}
              />
              <input
                className="input-bet"
                placeholder="Liga"
                value={matchForm.league}
                onChange={(e) => setMatchForm({ ...matchForm, league: e.target.value })}
              />
              <input
                className="input-bet"
                type="datetime-local"
                value={matchForm.matchDate}
                onChange={(e) => setMatchForm({ ...matchForm, matchDate: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateMatch} disabled={matchLoading} className="btn-neon-solid text-sm">
                {matchLoading ? 'A criar...' : '+ Criar Jogo'}
              </button>
              <button onClick={handleSettle} className="btn-neon text-sm">
                ⚡ Liquidar Apostas
              </button>
            </div>
          </div>

          <div className="card-bet overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bet-600/50">
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Jogo</th>
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Liga</th>
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Data</th>
                  <th className="text-left p-3 text-[10px] uppercase text-gray-500">Status</th>
                  <th className="text-center p-3 text-[10px] uppercase text-gray-500">Resultado</th>
                  <th className="text-right p-3 text-[10px] uppercase text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id} className="border-b border-bet-700 hover:bg-bet-700/50">
                    <td className="p-3 text-sm">
                      {match.homeTeam} vs {match.awayTeam}
                      {match.country === 'Manual' && (
                        <span className="text-[9px] bg-neon-blue/20 text-neon-blue px-1 rounded ml-1">MANUAL</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-400">{match.league}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(match.matchDate).toLocaleString('pt-PT')}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          match.status === 'VOID'
                            ? 'bg-neon-blue/20 text-neon-blue'
                            : match.status === 'SCHEDULED'
                              ? 'bg-neon-yellow/20 text-neon-yellow'
                              : match.status === 'LIVE'
                                ? 'bg-neon-green/20 text-neon-green animate-pulse'
                                : 'bg-bet-600 text-gray-400'
                        }`}
                      >
                        {match.status}
                      </span>
                    </td>
                    <td className="p-3 text-center text-sm font-bold">
                      {match.status === 'VOID' ? (
                        <span className="text-neon-blue text-xs">VOID</span>
                      ) : scoreEdit?.matchId === match.id ? (
                        <div className="flex gap-1 items-center justify-center">
                          <input
                            className="input-bet w-14 text-center text-sm"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={scoreEdit.homeScore}
                            onChange={(e) => setScoreEdit({ ...scoreEdit, homeScore: e.target.value })}
                          />
                          <span className="text-gray-400">-</span>
                          <input
                            className="input-bet w-14 text-center text-sm"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={scoreEdit.awayScore}
                            onChange={(e) => setScoreEdit({ ...scoreEdit, awayScore: e.target.value })}
                          />
                          <button onClick={handleUpdateScore} className="btn-neon-solid text-xs px-2">✓</button>
                          <button onClick={() => setScoreEdit(null)} className="text-gray-400 text-xs px-2">✕</button>
                        </div>
                      ) : match.homeScore !== null ? (
                        `${match.homeScore} - ${match.awayScore}`
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-end">
                        {match.status === 'VOID' ? (
                          <>
                            <span className="text-[10px] text-neon-blue self-center">VOID</span>
                            <button
                              onClick={() => handleUnvoidMatch(match.id)}
                              className="text-[10px] text-neon-yellow hover:underline"
                            >
                              Anular VOID
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setScoreEdit({ matchId: match.id, homeScore: '', awayScore: '' })}
                              className="text-[10px] text-neon-yellow hover:underline"
                            >
                              Resultado
                            </button>
                            <button
                              onClick={() => handleVoidMatch(match.id)}
                              className="text-[10px] text-neon-blue hover:underline"
                            >
                              Marcar VOID
                            </button>
                          </>
                        )}
                        {match.country === 'Manual' && (
                          <button
                            onClick={() => handleDeleteMatch(match.id)}
                            className="text-[10px] text-neon-red hover:underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="card-bet p-6">
          <h3 className="font-bold mb-4">Sincronizar Dados</h3>
          <div className="space-y-3">
            <button onClick={handleSyncMatches} className="btn-neon w-full text-sm">Sincronizar Jogos (Football-Data.org)</button>
            <button onClick={handleSyncOdds} className="btn-neon-blue w-full text-sm">Aplicar Odds Scrapadas (Oddspedia)</button>
            <p className="text-xs text-gray-500 mt-4">Para odds frescas, corre primeiro: <code className="bg-bet-700 px-1 rounded">python apps/api/scraper.py</code></p>
          </div>
        </div>
      )}
    </div>
  );
}
