import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Compass, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { SAMPLE_CITIES } from '../utils/weatherUtils';

interface HeaderProps {
  onSearch: (query: string) => void;
  onSelectCoordinates: (lat: number, lon: number, name: string) => void;
  onGetCurrentLocation: () => void;
  unit: 'C' | 'F';
  onToggleUnit: () => void;
  isSampleData: boolean;
  isLoading: boolean;
  currentLocationName: string;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  onSelectCoordinates,
  onGetCurrentLocation,
  unit,
  onToggleUnit,
  isSampleData,
  isLoading,
  currentLocationName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const filteredCities = SAMPLE_CITIES.filter(c => 
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
        
        {/* Brand Logo & Current Location Label */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/30 text-white font-bold text-xl">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wider text-white flex items-center gap-2">
                RODEX <span className="text-sky-300 font-light">Atmos</span>
              </h1>
              <p className="text-xs text-sky-200/70 flex items-center gap-1 font-medium">
                <MapPin className="w-3 h-3 text-sky-400" /> {currentLocationName}
              </p>
            </div>
          </div>

          {/* Mobile Unit Switch */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onToggleUnit}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition"
            >
              °{unit}
            </button>
            <button
              onClick={onGetCurrentLocation}
              disabled={isLoading}
              title="Use Current Location"
              className="p-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30 transition disabled:opacity-50"
            >
              <NavigationIcon isLoading={isLoading} />
            </button>
          </div>
        </div>

        {/* Search Bar with Autocomplete */}
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
              placeholder="Search city (e.g. Tokyo, London, Paris)..."
              className="w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/50 text-sm rounded-xl pl-10 pr-24 py-2.5 border border-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 backdrop-blur-md transition shadow-inner"
            />
            <button
              type="submit"
              className="absolute right-1.5 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow transition"
            >
              Search
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-slate-900/90 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto divide-y divide-white/10">
              <div className="p-2 text-[10px] uppercase font-bold text-sky-400 tracking-wider bg-white/5 px-3">
                Suggested Cities
              </div>
              {filteredCities.map((city) => (
                <button
                  key={`${city.name}-${city.country}`}
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
              {filteredCities.length === 0 && (
                <div className="p-4 text-center text-sm text-white/60">
                  Press search to look up "{searchTerm}" globally
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Controls (Current Location & Unit Switch) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Sample Data Banner indicator */}
          {isSampleData && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Sample Mode</span>
            </div>
          )}

          <button
            onClick={onGetCurrentLocation}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium transition shadow-lg backdrop-blur-md disabled:opacity-50 group"
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

      {/* Mobile Sample Notice */}
      {isSampleData && (
        <div className="flex md:hidden items-center justify-center gap-1.5 mt-2 py-1 px-3 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-medium text-center">
          <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Showing sample weather data. Search any city for live weather.</span>
        </div>
      )}
    </header>
  );
};

function NavigationIcon({ isLoading }: { isLoading: boolean }) {
  return isLoading ? (
    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
  ) : (
    <MapPin className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
  );
}
