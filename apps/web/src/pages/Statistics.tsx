import { useAuth } from '../lib/auth';

export default function Statistics() {
  const { user } = useAuth();
  const winRate = user?.betsCount ? Math.round(((user?.betsWon || 0) / user.betsCount) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black">Estatísticas</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Taxa de Acerto</p>
          <p className="text-4xl font-black text-neon-green">{winRate}%</p>
          <p className="text-xs text-gray-500 mt-1">{user?.betsWon || 0} / {user?.betsCount || 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Lucro Total</p>
          <p className={`text-4xl font-black ${(user?.profit || 0) >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
            {(user?.profit || 0) >= 0 ? '+' : ''}{user?.profit?.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">CRÉDITOS</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">ROI</p>
          <p className="text-4xl font-black text-neon-blue">{user?.roi || 0}%</p>
          <p className="text-xs text-gray-500 mt-1">RETORNO</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Total Apostas</p>
          <p className="text-4xl font-black text-white">{user?.betsCount || 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Vitórias</p>
          <p className="text-4xl font-black text-neon-green">{user?.betsWon || 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Derrotas</p>
          <p className="text-4xl font-black text-neon-red">{(user?.betsCount || 0) - (user?.betsWon || 0)}</p>
        </div>
      </div>

      <div className="card-bet p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Saldo Atual</h2>
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-500">Créditos disponíveis</span>
          <span className="text-2xl font-black text-neon-green">{user?.balance?.toFixed(2)} CR</span>
        </div>
        <div className="h-3 bg-bet-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-neon-green to-neon-blue rounded-full transition-all duration-500"
            style={{ width: `${Math.min((user?.balance || 0) / 2, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-600 mt-2 text-right">Começou com 100 CR</p>
      </div>
    </div>
  );
}
