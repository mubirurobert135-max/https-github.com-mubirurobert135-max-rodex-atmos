import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Compass, Sparkles, AlertCircle, RefreshCw, Navigation, Globe, Check, User, ShieldCheck, Bell, Send } from 'lucide-react';
import { SAMPLE_CITIES } from '../utils/weatherUtils';
import { LocationMode } from '../types';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

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
  const { user, isVerified } = useAuth();
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
    if (isInputFocused || searchTerm.length > 0) return;

    const interval = setInterval(() => {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_MESSAGES.length);
        setIsFadingOut(false);
      }, 350);
      return () => clearTimeout(timer);
    }, 3500);

    return () => clearInterval(interval);
  }, [isInputFocused, searchTerm, PLACEHOLDER_MESSAGES.length]);

  // Debounced live geocoding search
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    setIsSearchingLive(true);
    const timer = setTimeout(() => {
      fetch(`/api/weather/geocoding-search?q=${encodeURIComponent(searchTerm.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.results)) {
            setLiveSearchResults(data.results);
          }
        })
        .catch(() => {})
        .finally(() => setIsSearchingLive(false));
    }, 300);

    return () => clearTimeout(timer);
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
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold text-lg shrink-0">
            <Compass className="w-5 h-5 sm:w-6 sm:h-6 animate-spin-slow" />
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
            className={`${activeTab === 'map' ? 'hidden lg:flex' : 'hidden'} items-center p-1 rounded-2xl bg-white/8 backdrop-blur-md border border-white/12 shadow-inner`}
          >
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 btn-hover-lift ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25 border border-sky-400/30'
                  : 'text-sky-200/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => onSelectTab('map')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 btn-hover-lift ${
                activeTab === 'map'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25 border border-sky-400/30'
                  : 'text-sky-200/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>
          </nav>
        )}

        {/* Location Search Bar */}
        <div ref={searchRef} className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-sky-300 pointer-events-none z-10 shrink-0" />
            
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
              className="w-full pl-9 pr-9 py-2 bg-white/8 hover:bg-white/12 focus:bg-[#0b162a] text-white text-xs sm:text-sm rounded-2xl border border-white/15 focus:border-sky-400/60 focus:outline-none transition-all duration-200 shadow-inner"
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

        {/* Right-Hand Controls Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
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

          {/* Compact RODEX AI Trigger (Desktop) */}
          <button
            onClick={onOpenAssistant}
            className={`${activeTab === 'map' ? 'hidden lg:flex' : 'hidden'} items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-600 to-emerald-500 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-sky-500/25 border border-sky-300/40 group btn-hover-lift`}
            title="Open RODEX AI Voice & Chat Assistant"
            aria-label="Open RODEX AI Voice and Chat Assistant"
          >
            <Sparkles className="w-4 h-4 text-sky-200 group-hover:rotate-12 transition-transform" />
            <span>AI Assistant</span>
          </button>

          {/* Account / Profile Button (Desktop) */}
          <button
            onClick={onOpenAuth}
            className={`${activeTab === 'map' ? 'hidden lg:flex' : 'hidden'} items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition shadow-sm border btn-hover-lift ${
              user 
                ? isVerified 
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/40' 
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/40'
                : 'bg-white/8 hover:bg-white/15 text-white border-white/15'
            }`}
            title={user ? 'Account Settings & Privacy' : 'Sign In or Create Account'}
            aria-label={user ? 'Account Settings and Privacy' : 'Sign In'}
          >
            <User className="w-4 h-4" />
            <span className="truncate max-w-[100px]">
              {user ? (user.email ? user.email.split('@')[0] : user.phoneNumber || 'Account') : 'Account'}
            </span>
            {user && (
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ${isVerified ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'}`}>
                {isVerified ? 'Verified' : 'Pending'}
              </span>
            )}
          </button>

        </div>

      </div>
    </header>
  );
};
