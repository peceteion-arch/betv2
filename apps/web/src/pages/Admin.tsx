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
  odds: any[];
  // Fields needed by the admin edit form
  homeTeamId?: string;
  awayTeamId?: string;
  competitionId?: string | null;
  matchday?: number;
  betSelectionCount?: number;
}

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [tab, setTab] = useState<'stats' | 'users' | 'groups' | 'meciuri'>('stats');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', balance: 100 });
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [matchForm, setMatchForm] = useState({
    homeTeamId: '', awayTeamId: '',
    competitionId: '', league: '', matchDate: '', matchday: '1'
  });
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [competitions, setCompetitions] = useState<Array<{id: string; name: string; active: boolean}>>([]);
  const [scoreEdit, setScoreEdit] = useState<{
    matchId: string; homeScore: string; awayScore: string
  } | null>(null);
  const [matchError, setMatchError] = useState('');
  const [matchLoading, setMatchLoading] = useState(false);
  const [newTeamFor, setNewTeamFor] = useState<'home' | 'away' | null>(null);
  const [newTeam, setNewTeam] = useState({ name: '', logoUrl: '' });
  const [newTeamError, setNewTeamError] = useState('');
  const [newTeamLoading, setNewTeamLoading] = useState(false);
  // Competition creation form state
  const [showCreateCompetition, setShowCreateCompetition] = useState(false);
  const [newCompetition, setNewCompetition] = useState({ name: '' });
  const [competitionError, setCompetitionError] = useState('');
  const [competitionLoading, setCompetitionLoading] = useState(false);
  // Edit-match inline form state (Admin → Meciuri). Kept per-match so the
  // current identity fields can be pre-filled and the "with-bets" freeze rule
  // applied by the frontend (the backend still re-enforces it).
  const [editMatchId, setEditMatchId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    homeTeamId: string; awayTeamId: string; competitionId: string;
    matchday: string; matchDate: string;
  }>({ homeTeamId: '', awayTeamId: '', competitionId: '', matchday: '1', matchDate: '' });
  const [editMatchStatus, setEditMatchStatus] = useState<string>('');
  const [editHasBets, setEditHasBets] = useState(false);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const loadTeams = async () => {
    const r = await api.get('/teams');
    const sorted = [...r.data].sort((a: any, b: any) =>
      String(a.name).localeCompare(String(b.name), 'ro', { sensitivity: 'base' })
    );
    const map: Record<string, string> = {};
    sorted.forEach((t: any) => { map[t.id] = t.name; });
    setTeamMap(map);
  };

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get('/admin/stats').then((r) => setStats(r.data));
    api.get('/admin/users').then((r) => setUsers(r.data.users));
    api.get('/admin/groups').then((r) => setGroups(r.data));
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'ADMIN' || tab !== 'meciuri') return;
    api.get('/matches/all').then((r) => setMatches(r.data));
    loadTeams();
    api.get('/competitions').then((r) => {
      setCompetitions(r.data);
    });
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

  const handleCreateTeam = async () => {
    setNewTeamError('');
    const name = newTeam.name.trim();
    if (name.length < 2) {
      setNewTeamError('Numele echipei trebuie să aibă minim 2 caractere');
      return;
    }
    setNewTeamLoading(true);
    try {
      const r = await api.post('/teams', { name, logoUrl: newTeam.logoUrl.trim() || null });
      await loadTeams();
      if (newTeamFor) {
        setMatchForm((prev) => ({ ...prev, [newTeamFor === 'home' ? 'homeTeamId' : 'awayTeamId']: r.data.id }));
      }
      setNewTeam({ name: '', logoUrl: '' });
      setNewTeamFor(null);
    } catch (err: any) {
      setNewTeamError(err.response?.data?.error || 'Eroare la crearea echipei');
    } finally {
      setNewTeamLoading(false);
    }
  };

  const handleCreateCompetition = async () => {
    setCompetitionError('');
    setCompetitionLoading(true);
    try {
      const name = newCompetition.name.trim();
      if (!name) {
        setCompetitionError('Numele competiției trebuie să fie completat');
        return;
      }
      const r = await api.post('/competitions', { name });
      // After successful creation, reload competitions
      api.get('/competitions').then((res) => {
        setCompetitions(res.data);
        // Select the newly created competition in the matchForm
        setMatchForm({ ...matchForm, competitionId: r.data.id });
        // Close the form
        setShowCreateCompetition(false);
        setNewCompetition({ name: '' });
      });
    } catch (err: any) {
      setCompetitionError(err.response?.data?.error || 'Eroare la crearea competiției');
    } finally {
      setCompetitionLoading(false);
    }
  };

  const handleCreateMatch = async () => {
    setMatchError('');
    setMatchLoading(true);
    try {
      // Validate required fields
      if (!matchForm.homeTeamId || !matchForm.awayTeamId || !matchForm.competitionId) {
        setMatchError('Selectează o competiție');
        return;
      }
      const matchdayNum = Number(matchForm.matchday);
      if (isNaN(matchdayNum) || matchdayNum < 1) {
        setMatchError('Etapa trebuie să fie un număr întreg pozitiv');
        return;
      }

      const matchData: any = {
        ...matchForm,
        matchday: matchdayNum,
      };

      // Clean empty strings to avoid potential 400s from API
      if (!matchData.competitionId) delete matchData.competitionId;
      if (!matchData.league) delete matchData.league;

      const r = await api.post('/matches/manual', matchData);
      setMatches((prev) => [r.data, ...prev]);
      setMatchForm({ homeTeamId: '', awayTeamId: '', competitionId: '', league: '', matchDate: '', matchday: '1' });
    } catch (err: any) {
      setMatchError(err.response?.data?.error || 'Erro ao criar jogo');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleUpdateScore = async () => {
    if (!scoreEdit) return;
    // Validate that scores are not empty
    if (scoreEdit.homeScore === '' || scoreEdit.awayScore === '') {
      setMatchError('Os campos de resultado não podem estar vazios');
      return;
    }
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

  // ---- Admin match editing (Admin → Meciuri) --------------------------------

  // Pre-fill the inline edit form from a row. The datetime-local value is
  // interpreted as Europe/Bucharest to match how createManual() stores it, so
  // we convert the stored UTC instant back into the tz-local wall clock.
  const openEditMatch = (match: AdminMatch) => {
    const d = new Date(match.matchDate);
    const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    const timeStr = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    setEditMatchId(match.id);
    setEditMatchStatus(match.status);
    setEditHasBets((match.betSelectionCount ?? 0) > 0);
    setEditForm({
      homeTeamId: match.homeTeamId ?? '',
      awayTeamId: match.awayTeamId ?? '',
      competitionId: match.competitionId ?? '',
      matchday: String(match.matchday ?? 1),
      matchDate: `${dateStr}T${timeStr}`,
    });
    setEditError('');
  };

  const closeEditMatch = () => {
    setEditMatchId(null);
    setEditError('');
  };

  // The match can only be edited while SCHEDULED. With existing bets the
  // identity fields (teams / competition / matchday) are frozen by the backend;
  // we mirror that here so the disabled fields stay honest.
  const editAllowed = editMatchStatus === 'SCHEDULED';
  const editIdentityLocked = editAllowed && editHasBets;

  const handleSaveEditMatch = async () => {
    if (!editMatchId) return;
    setEditError('');
    const matchdayNum = Number(editForm.matchday);
    if (isNaN(matchdayNum) || matchdayNum < 1) {
      setEditError('Etapa trebuie să fie un număr întreg ≥ 1');
      return;
    }
    setEditLoading(true);
    try {
      const r = await api.patch(`/matches/${editMatchId}`, {
        homeTeamId: editForm.homeTeamId,
        awayTeamId: editForm.awayTeamId,
        competitionId: editForm.competitionId || undefined,
        matchday: matchdayNum,
        matchDate: editForm.matchDate,
      });
      // Refresh the list from the API response so status, teams and date stay in sync.
      setMatches((prev) => prev.map((m) => (m.id === editMatchId ? r.data : m)));
      closeEditMatch();
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Eroare la editarea meciului');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black">Painel de Administração</h1>

      <div className="flex gap-2">
        {(['stats', 'users', 'groups', 'meciuri'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
              tab === t ? 'bg-neon-green text-black' : 'bg-bet-700 text-gray-400 hover:text-white'
            }`}
          >
            {t === 'stats' ? 'Estatísticas' : t === 'users' ? 'Utilizadores' : t === 'groups' ? 'Grupos' : t === 'meciuri' ? 'Meciuri' : ''}
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
              <div>
                <select
                  className="input-bet"
                  value={matchForm.homeTeamId}
                  onChange={(e) => setMatchForm({ ...matchForm, homeTeamId: e.target.value })}
                >
                  <option value="">Selectează echipa gazdă</option>
                  {Object.entries(teamMap).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-neon-green mt-1 hover:underline"
                  onClick={() => { setNewTeamFor('home'); setNewTeamError(''); }}
                >
                  + Echipă nouă
                </button>
              </div>
              <div>
                <select
                  className="input-bet"
                  value={matchForm.awayTeamId}
                  onChange={(e) => setMatchForm({ ...matchForm, awayTeamId: e.target.value })}
                >
                  <option value="">Selectează echipa oaspete</option>
                  {Object.entries(teamMap).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-neon-green mt-1 hover:underline"
                  onClick={() => { setNewTeamFor('away'); setNewTeamError(''); }}
                >
                  + Echipă nouă
                </button>
              </div>
              <div>
                <div className="relative">
                  <select
                    className="input-bet"
                    value={matchForm.competitionId}
                    onChange={(e) => setMatchForm({ ...matchForm, competitionId: e.target.value })}
                  >
                    <option value="">Selectează competiția</option>
                    {competitions
                      .filter(c => c.active)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="text-xs text-neon-green mt-1 hover:underline"
                    onClick={() => { setShowCreateCompetition(true); setCompetitionError(''); setNewCompetition({ name: '' }); }}
                  >
                    +
                  </button>
                  {showCreateCompetition && (
                    <div className="space-y-2 border border-bet-600 rounded-lg p-3 mt-2">
                      <p className="text-xs text-gray-400">Nume competiție</p>
                      {competitionError && <p className="text-neon-red text-sm">{competitionError}</p>}
                      <input
                        className="input-bet"
                        placeholder="Nume competiție"
                        value={newCompetition.name}
                        onChange={(e) => setNewCompetition({ ...newCompetition, name: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCreateCompetition}
                          disabled={competitionLoading}
                          className="btn-neon-solid text-sm"
                        >
                          {competitionLoading ? 'Se salvează...' : 'Salvează'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateCompetition(false);
                            setNewCompetition({ name: '' });
                            setCompetitionError('');
                          }}
                          className="btn-neon text-sm"
                        >
                          Anulează
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <input
                  className="input-bet"
                  type="number"
                  placeholder="Etapă"
                  min="1"
                  value={matchForm.matchday}
                  onChange={(e) => setMatchForm({ ...matchForm, matchday: e.target.value })}
                />
              </div>
              <input
                className="input-bet"
                type="datetime-local"
                value={matchForm.matchDate}
                onChange={(e) => setMatchForm({ ...matchForm, matchDate: e.target.value })}
              />
            </div>
            {newTeamFor && (
              <div className="space-y-2 border border-bet-600 rounded-lg p-3">
                <p className="text-xs text-gray-400">
                  Echipă nouă pentru {newTeamFor === 'home' ? 'gazdă' : 'oaspete'}
                </p>
                {newTeamError && <p className="text-neon-red text-sm">{newTeamError}</p>}
                <input
                  className="input-bet"
                  placeholder="Nume echipă"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                />
                <input
                  className="input-bet"
                  placeholder="Logo URL (opcional)"
                  value={newTeam.logoUrl}
                  onChange={(e) => setNewTeam({ ...newTeam, logoUrl: e.target.value })}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={handleCreateTeam} disabled={newTeamLoading} className="btn-neon-solid text-sm">
                    {newTeamLoading ? 'Se salvează...' : 'Salvează echipa'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewTeamFor(null); setNewTeam({ name: '', logoUrl: '' }); setNewTeamError(''); }}
                    className="btn-neon text-sm"
                  >
                    Anulează
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreateMatch} disabled={matchLoading} className="btn-neon-solid text-sm">
                {matchLoading ? 'A criar...' : '+ Criar Jogo'}
              </button>
              <button onClick={handleSettle} className="btn-neon text-sm">
                ⚡ Liquidar Apostas
              </button>
            </div>
          </div>

          {editMatchId && (
            <div className="card-bet p-5 space-y-3 animate-slide-up">
              <h3 className="font-bold text-sm">Editează Jogo</h3>
              {editError && <p className="text-neon-red text-sm">{editError}</p>}
              {!editAllowed && (
                <p className="text-neon-yellow text-sm">
                  Meciul poate fi editat doar cât time este programat.
                </p>
              )}
              {editIdentityLocked && (
                <p className="text-xs text-gray-400">
                  Meciul are deja pariuri: pot fi modificate doar data și ora.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Echipa gazdă</label>
                  <select
                    className="input-bet"
                    value={editForm.homeTeamId}
                    disabled={!editAllowed || editIdentityLocked}
                    onChange={(e) => setEditForm({ ...editForm, homeTeamId: e.target.value })}
                  >
                    <option value="">Selectează echipa gazdă</option>
                    {Object.entries(teamMap).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Echipa oaspete</label>
                  <select
                    className="input-bet"
                    value={editForm.awayTeamId}
                    disabled={!editAllowed || editIdentityLocked}
                    onChange={(e) => setEditForm({ ...editForm, awayTeamId: e.target.value })}
                  >
                    <option value="">Selectează echipa oaspete</option>
                    {Object.entries(teamMap).map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Competiție</label>
                  <select
                    className="input-bet"
                    value={editForm.competitionId}
                    disabled={!editAllowed || editIdentityLocked}
                    onChange={(e) => setEditForm({ ...editForm, competitionId: e.target.value })}
                  >
                    <option value="">Selectează competiția</option>
                    {(() => {
                      // Show active competitions plus the match's current one (even if inactive)
                      const current = editForm.competitionId;
                      const opts = [...competitions];
                      if (current && !opts.some((c) => c.id === current)) {
                        const found = matches.find((m) => m.id === editMatchId);
                        opts.push({
                          id: current,
                          name: found ? (found as any).competition?.name || current : current,
                          active: false,
                        } as any);
                      }
                      return opts
                        .filter((c: any) => c.active || c.id === current)
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ));
                    })()}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Etapa</label>
                  <input
                    className="input-bet"
                    type="number"
                    min="1"
                    value={editForm.matchday}
                    disabled={!editAllowed || editIdentityLocked}
                    onChange={(e) => setEditForm({ ...editForm, matchday: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Data</label>
                  <input
                    className="input-bet"
                    type="date"
                    value={editForm.matchDate ? editForm.matchDate.slice(0, 10) : ''}
                    disabled={!editAllowed}
                    onChange={(e) => setEditForm({ ...editForm, matchDate: `${e.target.value}T${editForm.matchDate ? editForm.matchDate.slice(11) : '00:00'}` })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 mb-1">Ora</label>
                  <input
                    className="input-bet"
                    type="time"
                    value={editForm.matchDate ? editForm.matchDate.slice(11) : ''}
                    disabled={!editAllowed}
                    onChange={(e) => setEditForm({ ...editForm, matchDate: `${editForm.matchDate ? editForm.matchDate.slice(0, 10) : ''}T${e.target.value}` })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveEditMatch}
                  disabled={editLoading || !editAllowed}
                  className="btn-neon-solid text-sm"
                >
                  {editLoading ? 'Se salvează...' : 'Salvează'}
                </button>
                <button
                  type="button"
                  onClick={closeEditMatch}
                  disabled={editLoading}
                  className="btn-neon text-sm"
                >
                  Anulează
                </button>
              </div>
            </div>
          )}

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
                    </td>
                    <td className="p-3 text-xs text-gray-400">{match.league}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(match.matchDate).toLocaleString('pt-PT', { timeZone: 'Europe/Bucharest' })}</td>
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
                      <div className="flex gap-2 justify-end items-center">
                        <button
                          onClick={() => openEditMatch(match)}
                          disabled={match.status !== 'SCHEDULED'}
                          className="text-[10px] text-neon-yellow hover:underline disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                          title={match.status === 'SCHEDULED' ? 'Editează meciul' : 'Meciul poate fi editat doar cât timp este programat.'}
                        >
                          Editează
                        </button>
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
                              onClick={() => setScoreEdit({ matchId: match.id, homeScore: String(match.homeScore ?? 0), awayScore: String(match.awayScore ?? 0) })}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}