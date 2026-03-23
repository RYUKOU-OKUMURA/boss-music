import React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Bell, Settings, User, Search } from 'lucide-react';
import clsx from 'clsx';

export const Navigation: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isHome = location.pathname === '/';
  const searchQuery = searchParams.get('q') ?? '';

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) {
          next.set('q', value);
        } else {
          next.delete('q');
        }
        return next;
      },
      { replace: true }
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-zen-bg/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link
          to={{ pathname: '/', search: location.search }}
          className="text-2xl font-headline font-bold text-neon-cyan italic tracking-wider"
        >
          NeonPulse
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link
            to={{ pathname: '/', search: location.search }}
            className={clsx(
              'text-sm font-medium transition-colors',
              isHome ? 'text-neon-cyan border-b-2 border-neon-cyan pb-1' : 'text-zen-mist/60 hover:text-zen-mist'
            )}
          >
            ホーム
          </Link>
          <button className="text-sm font-medium text-zen-mist/60 hover:text-zen-mist transition-colors">
            ディスカバー
          </button>
          <button className="text-sm font-medium text-zen-mist/60 hover:text-zen-mist transition-colors">
            ライブラリ
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-mist/40" />
          <input
            type="search"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="曲を検索..."
            autoComplete="off"
            className="bg-surface border border-white/5 rounded-full py-1.5 pl-10 pr-4 text-sm text-zen-mist placeholder-zen-mist/40 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/50 transition-all w-64"
          />
        </div>
        <button className="text-zen-mist/60 hover:text-zen-mist transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <button className="text-zen-mist/60 hover:text-zen-mist transition-colors">
          <Settings className="w-5 h-5" />
        </button>
        <button className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5 text-white" />
        </button>
      </div>
    </nav>
  );
};
