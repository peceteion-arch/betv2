import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface Competition {
  id: string;
  name: string;
  active: boolean;
  logoUrl?: string;
}

export default function AdminCompetitions() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadCompetitions = async () => {
    try {
      const r = await api.get('/competitions');
      setCompetitions(r.data);
    } catch (err: any) {
      setError('Eroare la încărcarea competițiilor');
    }
  };

  useEffect(() => {
    loadCompetitions();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/competitions', { name });
      setName('');
      await loadCompetitions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la creare');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, newName: string) => {
    try {
      await api.patch(`/competitions/${id}`, { name: newName });
      setEditId(null);
      await loadCompetitions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la editare');
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      await api.patch(`/competitions/${id}/status`, { active: !active });
      await loadCompetitions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la actualizarea statusului');
    }
  };

  const handleUploadLogo = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    try {
      await api.post(`/competitions/${id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await loadCompetitions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la upload');
    }
  };

  const getLogoUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    if (import.meta.env.DEV) {
      return `${window.location.protocol}//${window.location.hostname}:3001${url}`;
    }
    return url;
  };


  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <h1 className="text-2xl font-black mb-6">Administrare Competiții</h1>

      {error && <div className="bg-neon-red/10 text-neon-red p-3 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleCreate} className="card-bet p-4 mb-8 flex gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nume competiție"
          className="input-bet flex-1"
          required
        />
        <button type="submit" disabled={loading} className="btn-neon-solid px-6">
          {loading ? '...' : '+ Competiție'}
        </button>
      </form>

      <div className="space-y-4">
        {competitions.map((c) => (
          <div key={c.id} className="card-bet p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-bet-700 rounded-lg flex items-center justify-center overflow-hidden">
                {c.logoUrl ? (
                  <img src={c.logoUrl ? getLogoUrl(c.logoUrl) : undefined} alt={c.name} className="w-full h-full object-cover" />
                ) : <span className="text-xs text-gray-500">Logo</span>}
              </div>

              {editId === c.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-bet"
                />
              ) : (
                <span className="font-bold text-lg">{c.name}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs ${c.active ? 'bg-neon-green/20 text-neon-green' : 'bg-gray-500/20 text-gray-500'}`}>
                {c.active ? 'Activă' : 'Inactivă'}
              </span>

              {editId === c.id ? (
                <button onClick={() => handleUpdate(c.id, editName)} className="btn-neon text-xs">Salvați</button>
              ) : (
                <button onClick={() => { setEditId(c.id); setEditName(c.name); }} className="btn-neon text-xs">Editează</button>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleUploadLogo(c.id, e.target.files[0])}
                className="hidden"
                id={`logo-${c.id}`}
              />
              <label htmlFor={`logo-${c.id}`} className="btn-neon text-xs cursor-pointer">
                {c.logoUrl ? 'Schimbă logo' : 'Încarcă logo'}
              </label>

              <button
                onClick={() => handleToggleStatus(c.id, c.active)}
                className={`btn-neon text-xs ${c.active ? 'text-neon-red' : 'text-neon-green'}`}
              >
                {c.active ? 'Dezactivează' : 'Activează'}
              </button>

              <Link to={`/admin/competitii/${c.id}`} className="btn-neon-solid px-4 text-xs">
                Vezi etapele
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
