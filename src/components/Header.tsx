import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Compass, Sparkles, AlertCircle, RefreshCw, Navigation, Globe, Check, User, ShieldCheck } from 'lucide-react';
import { SAMPLE_CITIES } from '../utils/weatherUtils';
import { LocationMode } from '../types';
import { useAuth } from '../context/AuthContext';

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
  onOpenAuth
}) => {
  const { user, isVerified } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [liveSearchResults, setLiveSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
        
        {/* Brand Logo & Location Mode Label */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/30 text-white font-bold text-xl">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wider text-white flex items-center gap-2">
                RODEX <span className="text-sky-300 font-light">Atmos</span>
              </h1>
              <div className="text-xs text-sky-200/90 flex items-center gap-1.5 font-medium">
                {locationMode === 'gps' ? (
                  <Navigation className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : locationMode === 'network' ? (
                  <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-[300px]">
                  {currentLocationName}
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase border ${
                  locationMode === 'gps' 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' 
                    : locationMode === 'network'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-400/30'
                    : locationMode === 'search'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}>
                  {locationMode === 'gps' ? 'GPS Local' : locationMode === 'network' ? 'IP Approx' : locationMode === 'search' ? 'Searched' : 'Default'}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onOpenAuth}
              className={`p-2 rounded-lg border transition ${user ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : 'bg-white/10 text-white border-white/20'}`}
              title={user ? (isVerified ? 'Verified Account' : 'Account Pending Verification') : 'Sign In or Register'}
            >
              <User className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenAssistant}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-xs shadow-md border border-sky-400/30 transition animate-pulse"
              title="Open RODEX AI Voice & Chat"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI</span>
            </button>
            <button
              onClick={onToggleUnit}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition"
            >
              °{unit}
            </button>
            <button
              onClick={onGetCurrentLocation}
              disabled={isLoading}
              title="Use My Current Location"
              className="p-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30 transition disabled:opacity-50"
            >
              <NavigationIcon isLoading={isLoading} />
            </button>
          </div>
        </div>

        {/* Search Bar with Global Geocoding Autocomplete */}
        <div className="w-full md:w-96 relative" ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-white/60 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search city globally (e.g. Kampala, Tokyo, Paris)..."
              className="w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/50 text-sm rounded-xl pl-10 pr-24 py-2.5 border border-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 backdrop-blur-md transition shadow-inner"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow transition flex items-center gap-1"
            >
              {isSearchingLive ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
              <span>Search</span>
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-slate-900/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto divide-y divide-white/10">
              
              {/* Option 1: Use Current Location */}
              <button
                onClick={() => {
                  onGetCurrentLocation();
                  setSearchTerm('');
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-sky-500/20 text-sky-300 font-semibold text-xs flex items-center gap-2 transition group"
              >
                <Navigation className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Use Current Device Location (GPS / Network)</span>
              </button>

              <div className="p-2 text-[10px] uppercase font-bold text-sky-400 tracking-wider bg-white/5 px-3 flex items-center justify-between">
                <span>Global Cities & Districts</span>
                {isSearchingLive && <span className="text-sky-300 animate-pulse">Searching...</span>}
              </div>

              {/* Live Geocoding Results */}
              {liveSearchResults.length > 0 && liveSearchResults.map((city, idx) => (
                <button
                  key={`live-${city.name}-${city.lat}-${idx}`}
                  onClick={() => {
                    onSelectCoordinates(city.lat, city.lon, city.name);
                    setSearchTerm('');
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-white text-sm flex items-center justify-between transition group"
                >
                  <div className="flex flex-col">
                    <span className="font-medium group-hover:text-sky-300 transition">{city.name}</span>
                    {city.admin1 && <span className="text-[11px] text-white/50">{city.admin1}</span>}
                  </div>
                  <span className="text-xs text-sky-200/70 font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                    {city.country}
                  </span>
                </button>
              ))}

              {/* Fallback Cities when search term is empty or live search returned 0 results */}
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

              {searchTerm.length >= 2 && liveSearchResults.length === 0 && !isSearchingLive && (
                <div className="p-4 text-center text-xs text-white/60">
                  Press <strong>Search</strong> or Enter to find "{searchTerm}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-3">

          <button
            onClick={onOpenAuth}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-lg border ${
              user 
                ? isVerified 
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/40' 
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/40'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title={user ? 'Manage Account' : 'Sign In or Create Account'}
          >
            <User className="w-4 h-4" />
            <span>{user ? (user.email ? user.email.split('@')[0] : user.phoneNumber || 'Account') : 'Account'}</span>
            {user && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase ${isVerified ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'}`}>
                {isVerified ? 'Verified' : 'Pending'}
              </span>
            )}
          </button>

          <button
            onClick={onOpenAssistant}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-sky-500/25 border border-sky-400/40 group"
          >
            <Sparkles className="w-4 h-4 text-sky-200 group-hover:rotate-12 transition-transform" />
            <span>RODEX AI (Voice & Chat)</span>
          </button>

          <button
            onClick={onGetCurrentLocation}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium transition shadow-lg backdrop-blur-md disabled:opacity-50 group"
            title="Use My Current Location"
          >
            <NavigationIcon isLoading={isLoading} />
            <span>My Location</span>
          </button>

          <button
            onClick={onToggleUnit}
            className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-bold transition shadow-lg backdrop-blur-md"
            title="Toggle Temperature Unit"
          >
            <span>°{unit}</span>
            <span className="text-sky-400/60 font-normal">|</span>
            <span className="text-white/70 font-normal">°{unit === 'C' ? 'F' : 'C'}</span>
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
