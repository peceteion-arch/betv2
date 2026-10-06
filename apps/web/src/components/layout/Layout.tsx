import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import InstallBanner from '../InstallBanner';
import BetSlipInline from '../BetSlipInline';
import { useState, useEffect } from 'react';
import { useIOS } from '../../hooks/useIOS';
import { useBetSlip } from '../../store/betSlip';
import { useOddsStream } from '../../hooks/useOddsStream';

export default function Layout() {
  useOddsStream();

  const [isMobile, setIsMobile] = useState(false);
  const { isIOS, isSafari, hasNotch } = useIOS();
  const location = useLocation();
  const { selections, stake, totalOdds, sheetOpen: showBetSlip, setSheetOpen } = useBetSlip();

  useEffect(() => {
    let rafId: number;
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(check);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Hide bottom nav on match detail and bet detail pages
  const hideBottomNav = location.pathname.includes('/matches/') || location.pathname.includes('/groups/');

  // Match detail renders its own fixed "Ver Bilhete" button (it has no bottom
  // nav to sit above), so the floating one would be a duplicate. Groups have
  // nothing to bet on. /matches (list) is NOT matched by '/matches/' — the
  // trailing slash is deliberate, and is exactly what we want there.
  const hideBetSlipButton = hideBottomNav;

  // The sheet must not survive a navigation — otherwise it reappears over
  // whatever page the user landed on.
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  return (
    <div className={`flex h-screen bg-bet-900 ${isIOS ? 'ios-device' : ''}`}>
      {/* Desktop Sidebar */}
      {!isMobile && <Sidebar />}

      <div className={`flex-1 flex flex-col ${!isMobile ? 'ml-64' : ''}`}>
        <Navbar isMobile={isMobile} />
        <main
          className={`flex-1 overflow-y-auto ${
            isMobile
              ? `p-4 ${hideBottomNav ? 'pb-4' : 'pb-28'}`
              : 'p-6'
          }`}
          style={{
            paddingTop: isMobile ? 'env(safe-area-inset-top)' : undefined,
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && !hideBottomNav && (
        <>
          <InstallBanner />
          <nav
            className="fixed bottom-0 left-0 right-0 bg-bet-800/95 backdrop-blur-xl border-t border-bet-600/50 z-50"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingTop: '8px',
            }}
          >
            <div className="flex justify-around items-center px-2">
              {[
                { to: '/', icon: '🏠', label: 'Início' },
                { to: '/matches', icon: '⚽', label: 'Jogos' },
                { to: '/bets', icon: '🎟️', label: 'Apostas' },
                { to: '/groups', icon: '👥', label: 'Grupos' },
                { to: '/rankings', icon: '🏆', label: 'Ranking' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[56px] ${
                      isActive
                        ? 'text-neon-green bg-neon-green/10'
                        : 'text-gray-500 active:text-white active:bg-bet-700'
                    }`}
                >
                  <span className="text-xl">{link.icon}</span>
                  <span className="text-[9px] font-semibold">{link.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}

      {/* Mobile floating bet slip trigger — the desktop BetSlip is hidden
          below lg, so without this users can select odds but never bet. */}
      {isMobile && !hideBetSlipButton && selections.length > 0 && !showBetSlip && (
        <button
          onClick={() => setSheetOpen(true)}
          aria-label={`Abrir bilhete com ${selections.length} seleções`}
          className="fixed right-4 z-40 bg-neon-green text-black font-black rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 animate-slide-up active:scale-95 transition-all"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          🎟️ <span>{selections.length}</span>
          <span className="text-sm">· {(stake * totalOdds()).toFixed(2)} CR</span>
        </button>
      )}

      {/* Mobile bet slip bottom sheet */}
      {isMobile && showBetSlip && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSheetOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bilhete"
            className="relative bg-bet-800 rounded-t-3xl border-t border-bet-600 p-4 max-h-[85vh] overflow-y-auto animate-slide-up"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {/* Handle bar */}
            <div className="w-12 h-1 bg-bet-600 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg">
                Bilhete
                <span className="ml-2 bg-neon-green text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  {selections.length}
                </span>
              </h3>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar bilhete"
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <BetSlipInline onSuccess={() => setSheetOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
