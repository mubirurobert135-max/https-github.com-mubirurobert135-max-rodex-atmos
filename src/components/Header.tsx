import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Compass, Sparkles, AlertCircle, RefreshCw, Navigation, Globe, Check, User, ShieldCheck, Bell, Send } from 'lucide-react';
import { SAMPLE_CITIES } from '../utils/weatherUtils';
import { LocationMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

// Track the pointer inside a navigation control so its highlight follows the cursor.
const updateNavPointer = (event: React.PointerEvent<HTMLElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', (event.clientX - bounds.left) + 'px');
  event.currentTarget.style.setProperty('--pointer-y', (event.clientY - bounds.top) + 'px');
};

interface HeaderProps {
  onSearch: (query: string) => void;
  onSelectCoordinates: (lat: number, lon: number, name: string) => void;
  onGetCurrentLocation: () => void;
  unit: 'C' | 'F';
  onToggleUnit: () => void;
  isLoading: boolean;
  currentLocationName: string;
  locationMode?: LocationMode;
  onOpenAssistant: () => void;
  onOpenAuth: () => void;
  onOpenPrivacyPortal: () => void;
  onOpenAlertsModal?: () => void;
  activeAlertsCount?: number;
  activeTab?: 'dashboard' | 'map';
  onSelectTab?: (tab: 'dashboard' | 'map') => void;
}

interface GeocodingResult {

  name: string;
  country: string;
  admin1?: string;
  lat: number;
  lon: number;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  onSelectCoordinates,
  onGetCurrentLocation,
  unit,
  onToggleUnit,
  isLoading,
  currentLocationName,
  locationMode = 'gps',
  onOpenAssistant,
  onOpenAuth,
  onOpenAlertsModal,
  activeAlertsCount = 0,
  activeTab = 'dashboard',
  onSelectTab
}) => {
  const { user, userProfile, isVerified } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [liveSearchResults, setLiveSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Animated rotating placeholder state
  const PLACEHOLDER_MESSAGES = [
    'Search any city or country…',
    'Discover weather anywhere…',
    'Hourly & 7-day forecasts…',
    'Ask Atmos about conditions…'
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (isInputFocused || searchTerm.length > 0) {
      setIsFadingOut(false);
      return;
    }

    let transitionTimer: number | undefined;
    const interval = window.setInterval(() => {
      setIsFadingOut(true);
      transitionTimer = window.setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_MESSAGES.length);
        setIsFadingOut(false);
      }, 240);
    }, 3800);

    return () => {
      window.clearInterval(interval);
      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
    };
  }, [isInputFocused, searchTerm, PLACEHOLDER_MESSAGES.length]);

  // Debounced geocoding search; cancel stale requests so older results cannot replace newer queries.
  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingLive(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/weather/geocoding-search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Location search failed (${res.status})`);
          return res.json();
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setLiveSearchResults(Array.isArray(data?.results) ? data.results : []);
          }
        })
        .catch((error: unknown) => {
          const aborted = error instanceof DOMException && error.name === 'AbortError';
          if (!controller.signal.aborted && !aborted) setLiveSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingLive(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  const fallbackCities = SAMPLE_CITIES.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onSearch(searchTerm.trim());
      setShowDropdown(false);
      setIsMobileSearchExpanded(false);
    }
  };

  return (
    <header className={`w-full py-2.5 px-3 sm:px-6 lg:px-8 ${activeTab === 'dashboard' ? 'border-b-0 bg-transparent' : 'border-b border-white/10 bg-[#070e1c]/75'} backdrop-blur-xl sticky top-0 z-50 transition-all`}>
      <div className="rodex-header-layout max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        
        {/* Brand Logo & Title */}
        <div className="rodex-header-brand flex items-center gap-3 shrink-0">
          <div className="group w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-lg shrink-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-400/30">
            <Compass className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-500 group-hover:rotate-12" />
          </div>
          {activeTab !== 'dashboard' && (
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-black tracking-wide text-white flex items-center gap-1.5 font-heading">
                RODEX <span className="text-sky-300 font-light">Atmos</span>
              </h1>
              <p className="text-[11px] text-sky-200/70 font-medium font-body leading-none mt-0.5">
                Understand your day
              </p>
            </div>
          )}
        </div>

        {/* Desktop Navigation Tabs */}
        {onSelectTab && (
          <nav
            aria-label="Primary Navigation"
            className={`rodex-header-primary-nav ${activeTab === 'map' ? 'hidden lg:flex' : 'hidden'} items-center p-1 rounded-2xl bg-slate-950/30 backdrop-blur-xl border border-white/10 shadow-inner`}
          >
            <button
              aria-current={activeTab === 'dashboard' ? 'page' : undefined}
              onPointerMove={updateNavPointer}
              onClick={() => onSelectTab('dashboard')}
              className={`rodex-pointer-spotlight px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 btn-hover-lift ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-cyan-300/20 to-emerald-300/15 text-white shadow-md shadow-cyan-500/10 border border-cyan-100/20'
                  : 'text-white/65 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              aria-current={activeTab === 'map' ? 'page' : undefined}
              onPointerMove={updateNavPointer}
              onClick={() => onSelectTab('map')}
              className={`rodex-pointer-spotlight px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 btn-hover-lift ${
                activeTab === 'map'
                  ? 'bg-gradient-to-r from-cyan-300/20 to-emerald-300/15 text-white shadow-md shadow-cyan-500/10 border border-cyan-100/20'
                  : 'text-white/65 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>
          </nav>
        )}

        {/* Location Search Bar */}
        <div ref={searchRef} className="rodex-header-search relative flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-cyan-200 pointer-events-none z-10 shrink-0" />
            
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                setIsInputFocused(true);
                setShowDropdown(true);
              }}
              onBlur={() => setIsInputFocused(false)}
              placeholder=""
              className="w-full pl-9 pr-9 py-2 bg-white/8 hover:bg-white/12 focus:bg-[#0b162a] text-white text-xs sm:text-sm rounded-2xl border border-white/15 focus:border-cyan-200/55 focus:ring-2 focus:ring-cyan-200/10 focus:outline-none transition-all duration-200 shadow-inner"
              aria-label="Search city or country"
            />

            {!searchTerm && !isInputFocused && (
              <span className={`absolute left-9 right-8 text-xs sm:text-sm text-sky-200/60 pointer-events-none transition-opacity duration-300 truncate ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
                {PLACEHOLDER_MESSAGES[placeholderIndex]}
              </span>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-1.5 p-1.5 rounded-xl hover:bg-white/15 text-sky-400 hover:text-sky-300 transition"
              title="Search forecast location"
              aria-label="Submit search"
            >
              {isLoading ? (
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-sky-400 -rotate-12 hover:scale-110 transition-transform" />
              )}
            </button>
          </form>

          {/* Search Dropdown Results */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a1426]/95 border border-white/16 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto backdrop-blur-2xl">
              {isSearchingLive && (
                <div className="p-3 text-center text-xs text-sky-200/70 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                  <span>Searching global locations...</span>
                </div>
              )}

              {liveSearchResults.map((city) => (
                <button
                  key={`${city.name}-${city.lat}-${city.lon}`}
                  onClick={() => {
                    onSelectCoordinates(city.lat, city.lon, city.name);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white text-xs sm:text-sm flex items-center justify-between transition group border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-medium group-hover:text-sky-300 transition truncate">{city.name}</span>
                    {city.admin1 && <span className="text-[11px] text-white/50 truncate">({city.admin1})</span>}
                  </div>
                  <span className="text-[11px] text-sky-200/70 font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 shrink-0 ml-2">
                    {city.country}
                  </span>
                </button>
              ))}

              {liveSearchResults.length === 0 && fallbackCities.map((city) => (
                <button
                  key={`fallback-${city.name}-${city.country}`}
                  onClick={() => {
                    onSelectCoordinates(city.lat, city.lon, city.name);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white text-xs sm:text-sm flex items-center justify-between transition group border-b border-white/5 last:border-0"
                >
                  <span className="font-medium group-hover:text-sky-300 transition">{city.name}</span>
                  <span className="text-xs text-white/50">{city.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rodex-header-shortcuts">
        {/* Account is deliberately placed immediately after location search for quick access. */}
        <button
          type="button"
          onClick={onOpenAuth}
          onPointerMove={updateNavPointer}
          className="header-account-shortcut rodex-pointer-spotlight"
          title={user ? 'Open account settings' : 'Sign in or create an account'}
          aria-label={user ? 'Open account' : 'Sign in or create an account'}
        >
          <span className="header-account-icon overflow-hidden rounded-full">
            {(user?.providerData.find((provider) => provider.providerId === 'google.com')?.photoURL || userProfile?.photoURL || user?.photoURL) ? (
              <img
                src={(user?.providerData.find((provider) => provider.providerId === 'google.com')?.photoURL || userProfile?.photoURL || user?.photoURL)!}
                alt={user?.displayName || userProfile?.displayName || 'Account profile'}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="w-4 h-4" />
            )}
          </span>
          <span className="header-account-label">Account</span>
          {user && (
            <span
              className={`header-account-status ${isVerified ? 'is-verified' : 'is-pending'}`}
              aria-label={isVerified ? 'Verified account' : 'Account verification pending'}
              title={isVerified ? 'Verified account' : 'Account verification pending'}
            />
          )}
        </button>

        {/* RODEX AI tab — positioned immediately after Account for one-tap access. */}
        <button
          type="button"
          onClick={onOpenAssistant}
          onPointerMove={updateNavPointer}
          className="rodex-pointer-spotlight group inline-flex h-[39px] w-[39px] shrink-0 items-center justify-center gap-2 rounded-[13px] border border-violet-300/55 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 px-0 text-white shadow-lg shadow-violet-950/25 transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-violet-500/30 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto sm:px-3"
          title="Open RODEX AI"
          aria-label="Open RODEX AI from header navigation"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-white transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <span className="hidden text-xs font-extrabold tracking-wide sm:inline">RODEX AI</span>
        </button>

        </div>

        {/* Right-Hand Controls Cluster */}
        <div className="rodex-header-controls flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Temperature Unit Toggle Button */}
          <button
            onClick={onToggleUnit}
            className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl bg-white/8 hover:bg-white/15 border border-white/15 text-sky-200 text-xs font-bold transition shadow-sm backdrop-blur-md btn-hover-lift min-h-[38px]"
            title="Toggle temperature unit"
            aria-label={`Switch temperature unit, currently °${unit}`}
          >
            <span>°{unit}</span>
            <span className="text-white/30 hidden sm:inline">|</span>
            <span className="text-white/60 font-normal hidden sm:inline">°{unit === 'C' ? 'F' : 'C'}</span>
          </button>

          {/* Smart Alerts Bell Icon (Desktop & Tablet) */}
          {onOpenAlertsModal && (
            <button
              onClick={onOpenAlertsModal}
              className="hidden md:flex relative p-2 sm:p-2.5 rounded-2xl bg-white/8 hover:bg-white/15 border border-white/15 text-sky-200 transition shadow-sm backdrop-blur-md active:scale-95 min-h-[38px] min-w-[38px] items-center justify-center"
              title="Smart Weather Alerts & Preferences"
              aria-label={`Open smart weather alerts (${activeAlertsCount} active)`}
            >
              <Bell className="w-4 h-4" />
              {activeAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {activeAlertsCount}
                </span>
              )}
            </button>
          )}


        </div>

      </div>
    </header>
  );
};
