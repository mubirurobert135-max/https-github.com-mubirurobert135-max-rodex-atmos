import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Compass, Sparkles, AlertCircle, RefreshCw, Navigation, Globe, Check, User, ShieldCheck, Bell } from 'lucide-react';
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
  onOpenPrivacyPortal,
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
  const searchRef = useRef<HTMLDivElement>(null);

  // Animated rotating placeholder state
  const PLACEHOLDER_MESSAGES = [
    'Search any city or country…',
    'Discover weather anywhere…',
    'Find your hourly forecast…',
    'Explore the 7-day forecast…',
    'Ask Atmos about the weather…'
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Smooth placeholder message rotation every 3.5 seconds
  useEffect(() => {
    if (isInputFocused || searchTerm.length > 0) return;

    const interval = setInterval(() => {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_MESSAGES.length);
        setIsFadingOut(false);
      }, 400);
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
    }
  };

  return (
    <header className="w-full py-4 px-4 sm:px-6 lg:px-8 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-50 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand Logo & Slogan */}
        <div className="flex items-center justify-between w-full md:w-auto gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-bold text-xl">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wider text-white flex items-center gap-1.5 font-heading">
                RODEX <span className="text-sky-300 font-light">Atmos</span>
              </h1>
              <p className="text-[11px] text-sky-200/80 font-medium font-body">
                Understand your day
              </p>
            </div>
          </div>

          {/* Compact Mobile Utilities */}
          <div className="flex md:hidden items-center gap-2">
            <PWAInstallButton />

            {onOpenAlertsModal && (
              <button
                onClick={onOpenAlertsModal}
                className="relative p-2 rounded-xl bg-white/10 hover:bg-white/20 text-sky-200 border border-white/15 transition btn-hover-lift"
                title="Smart Weather Alerts & Preferences"
              >
                <Bell className="w-4 h-4" />
                {activeAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {activeAlertsCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onToggleUnit}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-sky-200 font-bold text-xs border border-white/15 transition btn-hover-lift"
            >
              °{unit}
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Dashboard & Weather Map) */}
        {onSelectTab && (
          <nav aria-label="Main Navigation" className="flex items-center p-1 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-inner">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2 btn-hover-lift ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20 border border-sky-400/30'
                  : 'text-sky-200/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => onSelectTab('map')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2 btn-hover-lift ${
                activeTab === 'map'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20 border border-sky-400/30'
                  : 'text-sky-200/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>
          </nav>
        )}

        {/* Search Bar */}
        <div ref={searchRef} className="relative w-full max-w-md">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-sky-300 pointer-events-none z-10" />
            
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
              className="w-full pl-10 pr-10 py-2.5 bg-white/10 hover:bg-white/15 focus:bg-slate-900/90 text-white text-sm rounded-2xl border border-white/20 focus:border-sky-400/60 focus:outline-none transition-all duration-300 shadow-inner"
            />

            {!searchTerm && !isInputFocused && (
              <span className={`absolute left-10 text-sm text-sky-200/60 pointer-events-none transition-opacity duration-300 ${isFadingOut ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'}`}>
                {PLACEHOLDER_MESSAGES[placeholderIndex]}
              </span>
            )}

            <button
              type="button"
              onClick={onGetCurrentLocation}
              disabled={isLoading}
              className="absolute right-2 p-1.5 rounded-xl hover:bg-white/20 text-sky-300 transition"
              title="Use current location"
            >
              <NavigationIcon isLoading={isLoading} />
            </button>
          </form>

          {/* Search Dropdown */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto backdrop-blur-xl">
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
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white text-sm flex items-center justify-between transition group border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-medium group-hover:text-sky-300 transition">{city.name}</span>
                    {city.admin1 && <span className="text-[11px] text-white/50">{city.admin1}</span>}
                  </div>
                  <span className="text-xs text-sky-200/70 font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
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
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white text-sm flex items-center justify-between transition group"
                >
                  <span className="font-medium group-hover:text-sky-300 transition">{city.name}</span>
                  <span className="text-xs text-white/50">{city.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-2.5">
          <PWAInstallButton />

          {/* Smart Alerts Bell Icon */}
          {onOpenAlertsModal && (
            <button
              onClick={onOpenAlertsModal}
              className="relative p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-sky-200 transition shadow-md backdrop-blur-md active:scale-95"
              title="Smart Weather Alerts & Preferences"
            >
              <Bell className="w-4 h-4" />
              {activeAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {activeAlertsCount}
                </span>
              )}
            </button>
          )}

          {/* Temperature Unit Toggle */}
          <button
            onClick={onToggleUnit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-sky-200 text-xs font-bold transition shadow-md backdrop-blur-md"
            title="Toggle Temperature Unit"
          >
            <span>°{unit}</span>
            <span className="text-white/40">|</span>
            <span className="text-white/70 font-normal">°{unit === 'C' ? 'F' : 'C'}</span>
          </button>

          {/* Compact RODEX AI Trigger */}
          <button
            onClick={onOpenAssistant}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-sky-500/20 border border-sky-400/30 group"
            title="Open RODEX AI Voice & Chat Assistant"
          >
            <Sparkles className="w-4 h-4 text-sky-200 group-hover:rotate-12 transition-transform" />
            <span>AI Assistant</span>
          </button>

          {/* Account / Profile Button */}
          <button
            onClick={onOpenAuth}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition shadow-lg border ${
              user 
                ? isVerified 
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/40' 
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title={user ? 'Account Settings & Privacy' : 'Sign In or Create Account'}
          >
            <User className="w-4 h-4" />
            <span>{user ? (user.email ? user.email.split('@')[0] : user.phoneNumber || 'Account') : 'Account'}</span>
            {user && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase ${isVerified ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'}`}>
                {isVerified ? 'Verified' : 'Pending'}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
};

function NavigationIcon({ isLoading }: { isLoading: boolean }) {
  return isLoading ? (
    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
  ) : (
    <Navigation className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
  );
}
