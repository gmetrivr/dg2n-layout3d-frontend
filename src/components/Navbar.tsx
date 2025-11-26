import { useEffect, useState, useTransition } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { useAuth } from '../contexts/AuthContext';

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);
  const { logout, username } = useAuth();

  const handleNavigation = (path: string, event: React.MouseEvent) => {
    event.preventDefault();
    console.log('[Navbar] Navigation clicked to:', path, 'from:', location.pathname);

    // If already on the target page, do nothing
    if (location.pathname === path) {
      console.log('[Navbar] Already on target page, skipping navigation');
      return;
    }

    // Show loading overlay immediately
    console.log('[Navbar] Setting isNavigating to true');
    setIsNavigating(true);

    // Small delay to let the loading overlay render before heavy unmount
    requestAnimationFrame(() => {
      console.log('[Navbar] First requestAnimationFrame');
      requestAnimationFrame(() => {
        console.log('[Navbar] Second requestAnimationFrame, starting transition');
        // Use transition to make navigation non-blocking
        startTransition(() => {
          console.log('[Navbar] Inside transition, calling navigate to:', path);
          navigate(path);
          console.log('[Navbar] Navigate called');
        });
      });
    });
  };

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    console.log('[Navbar] Location changed to:', location.pathname);
    setMobileOpen(false);
    console.log('[Navbar] Clearing isNavigating (setting to false)');
    setIsNavigating(false); // Clear loading state when route changes
  }, [location.pathname]);

  const linkBase =
    'text-sm font-medium transition-colors text-white visited:text-white hover:text-white/80 border-b border-transparent pb-1';
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <div
        className={`fixed top-0 left-0 w-full z-[200] pointer-events-auto transition-all duration-300 ${
          isScrolled ? 'bg-background/80 backdrop-blur-md border-b shadow-sm' : 'bg-transparent'
        }`}
        style={{ willChange: 'transform', isolation: 'isolate' }}
      >
        <nav className="relative flex items-center justify-between p-6 max-w-7xl mx-auto">
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" onClick={(e) => handleNavigation('/', e)} className={`${linkBase} ${isActive('/') ? 'border-white' : ''}`}>
              Home
            </Link>
            <Link
              to="/cad-to-3d"
              onClick={(e) => handleNavigation('/cad-to-3d', e)}
              className={`${linkBase} ${isActive('/cad-to-3d') ? 'border-white' : ''}`}
            >
              CAD to 3D
            </Link>
            <Link
              to="/3d-viewer-modifier"
              onClick={(e) => handleNavigation('/3d-viewer-modifier', e)}
              className={`${linkBase} ${isActive('/3d-viewer-modifier') ? 'border-white' : ''}`}
            >
              3D Viewer Modifier
            </Link>
            <Link
              to="/my-stores"
              onClick={(e) => handleNavigation('/my-stores', e)}
              className={`${linkBase} ${isActive('/my-stores') ? 'border-white' : ''}`}
            >
              My Created Stores
            </Link>
          </div>

          <Link to="/" onClick={(e) => handleNavigation('/', e)} className="md:absolute md:left-1/2 md:-translate-x-1/2 md:transform">
            <img src="/dg2n-logo-wt.png" alt="dg2n" className="h-10 w-auto object-contain invert dark:invert-0" />
          </Link>

          <div className="hidden md:flex items-center gap-4">
            {username && <span className="text-sm text-muted-foreground">{username}</span>}
            <Button size="sm" variant="outline" onClick={() => void logout()}>
              Log out
            </Button>
          </div>

          <Button
            aria-label="Open menu"
            className="md:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              <path
                fillRule="evenodd"
                d="M3.75 5.25a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h15a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </nav>

        <div
          className={`md:hidden fixed inset-0 z-50 transition-transform ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!mobileOpen}
        >
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-64 bg-background border-l p-6 flex flex-col gap-6 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Menu</span>
              <button
                aria-label="Close menu"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted"
                onClick={() => setMobileOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M6.225 4.811a.75.75 0 011.06 0L12 9.525l4.715-4.714a.75.75 0 111.06 1.06L13.06 10.586l4.715 4.714a.75.75 0 11-1.06 1.06L12 11.646l-4.715 4.714a.75.75 0 11-1.06-1.06l4.714-4.714-4.714-4.715a.75.75 0 010-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <Link to="/" onClick={(e) => handleNavigation('/', e)} className={`${linkBase} ${isActive('/') ? 'border-white' : ''}`}>
                Home
              </Link>
              <Link
                to="/cad-to-3d"
                onClick={(e) => handleNavigation('/cad-to-3d', e)}
                className={`${linkBase} ${isActive('/cad-to-3d') ? 'border-white' : ''}`}
              >
                CAD to 3D
              </Link>
              <Link
                to="/3d-viewer-modifier"
                onClick={(e) => handleNavigation('/3d-viewer-modifier', e)}
                className={`${linkBase} ${isActive('/3d-viewer-modifier') ? 'border-white' : ''}`}
              >
                3D Viewer Modifier
              </Link>
              <Link
                to="/my-stores"
                onClick={(e) => handleNavigation('/my-stores', e)}
                className={`${linkBase} ${isActive('/my-stores') ? 'border-white' : ''}`}
              >
                My Created Stores
              </Link>
            </div>
            <div className="mt-auto flex flex-col gap-3">
              {username && <span className="text-sm text-muted-foreground">Signed in as {username}</span>}
              <Button variant="outline" onClick={() => void logout()}>
                Log out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay - rendered outside navbar container to cover entire window */}
      {isNavigating && (
        <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-background/90 p-6 rounded-lg shadow-xl border border-border">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
