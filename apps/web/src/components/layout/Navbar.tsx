import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import api from '../../lib/api';

interface NavbarProps {
  isMobile?: boolean;
}

export default function Navbar({ isMobile }: NavbarProps) {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        setUnreadCount(data.count);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      className="bg-bet-800/80 backdrop-blur-xl border-b border-bet-600/50 flex items-center justify-between px-4 sticky z-20"
      style={{
        height: '56px',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex items-center gap-3">
        {!isMobile && (
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neon-green flex items-center justify-center">
              <span className="text-black font-black text-sm">BL</span>
            </div>
          </Link>
        )}
        <span className="text-gray-400 text-sm hidden sm:block">
          Olá, <strong className="text-white">{user?.name}</strong>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Balance */}
        <div className="hidden sm:flex items-center gap-2 bg-bet-700/80 rounded-xl px-3 py-1.5">
          <span className="text-[10px] uppercase text-gray-500">Saldo</span>
          <span className="text-neon-green font-bold text-sm">{user?.balance?.toFixed(2)}</span>
        </div>

        {/* Mobile balance */}
        {isMobile && (
          <div className="flex items-center gap-1 bg-bet-700/80 rounded-lg px-2 py-1">
            <span className="text-neon-green font-bold text-xs">{user?.balance?.toFixed(2)}</span>
            <span className="text-[8px] text-gray-500">CR</span>
          </div>
        )}

        {/* Notifications */}
        <Link to="/notifications" className="relative p-2 hover:bg-bet-700 active:bg-bet-600 rounded-xl transition-colors">
          <span className="text-lg">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-neon-red text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-bet-700 active:bg-bet-600 rounded-xl transition-colors text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-bet-700 rounded-2xl border border-bet-600 shadow-2xl py-2 z-50 animate-fade-in">
                <div className="px-4 py-3 border-b border-bet-600">
                  <p className="font-semibold text-sm text-white">{user?.name}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>

                <Link
                  to="/change-password"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-bet-600 hover:text-white transition-colors"
                >
                  <span>🔑</span>
                  Alterar Password
                </Link>

                <Link
                  to="/install"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-bet-600 hover:text-white transition-colors"
                >
                  <span>📲</span>
                  Instalar App
                </Link>

                {user?.role === 'ADMIN' && (
                  <>
                    <Link
                      to="/admin"
                      onClick={() => setShowMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-bet-600 hover:text-white transition-colors"
                    >
                      <span>⚙️</span>
                      Admin
                    </Link>
                    <Link
                      to="/admin/competitii"
                      onClick={() => setShowMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-bet-600 hover:text-white transition-colors"
                    >
                      Competiții
                    </Link>
                  </>
                )}

                <hr className="border-bet-600 my-1" />

                <button
                  onClick={() => { logout(); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-neon-red hover:bg-bet-600 transition-colors"
                >
                  <span>🚪</span>
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
