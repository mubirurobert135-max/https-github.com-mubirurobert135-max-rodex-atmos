import React from 'react';
import { 
  Wind, Droplets, Gauge, Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle,
  CloudRain, CloudSnow, CloudLightning, ArrowUp, ArrowDown, Clock, Navigation, RefreshCw, Globe, MapPin 
} from 'lucide-react';
import { WeatherData, LocationMode } from '../types';
import { formatTemp, formatWind, getWeatherCondition, getWindDirectionLabel } from '../utils/weatherUtils';

interface CurrentWeatherCardProps {
  data: WeatherData;
  unit: 'C' | 'F';
  onGetCurrentLocation?: () => void;
  locationMode?: LocationMode;
  isLoading?: boolean;
}

export const CurrentWeatherCard: React.FC<CurrentWeatherCardProps> = ({ 
  data, 
  unit,
  onGetCurrentLocation,
  locationMode = 'gps',
  isLoading = false
}) => {
  const { location, weather } = data;
  const current = weather.current;
  const daily = weather.daily;

  const condition = getWeatherCondition(current.weather_code, current.is_day);
  const maxTemp = daily?.temperature_2m_max?.[0] ?? current.temperature_2m + 3;
  const minTemp = daily?.temperature_2m_min?.[0] ?? current.temperature_2m - 3;
  const uvMax = daily?.uv_index_max?.[0] ?? 5;

  const updateTimeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // UV risk description
  const uvDescription = uvMax >= 8 ? 'Very High' : uvMax >= 6 ? 'High' : uvMax >= 3 ? 'Moderate' : 'Low';

  // Air comfort description
  const airComfort = current.relative_humidity_2m > 70 
    ? 'Humid & damp' 
    : current.relative_humidity_2m < 30 
      ? 'Dry air' 
      : 'Optimal balance';

  // Condition Icon with rich aesthetic presentation matching reference
  const renderConditionIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sun':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-amber-400/25 rounded-full blur-lg animate-pulse" />
            <Sun className="w-10 h-10 sm:w-12 sm:h-12 text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)] transition-transform duration-500 hover:scale-105" />
          </div>
        );
      case 'Moon':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-indigo-500/25 rounded-full blur-lg" />
            <Moon className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-200 drop-shadow-[0_0_12px_rgba(199,210,254,0.5)]" />
          </div>
        );
      case 'CloudSun':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-sky-400/20 rounded-full blur-lg" />
            <CloudSun className="w-10 h-10 sm:w-12 sm:h-12 text-sky-200 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]" />
          </div>
        );
      case 'CloudMoon':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-indigo-400/20 rounded-full blur-lg" />
            <CloudMoon className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-200 drop-shadow-[0_0_12px_rgba(165,180,252,0.5)]" />
          </div>
        );
      case 'CloudRain':
      case 'CloudDrizzle':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-sky-500/25 rounded-full blur-lg" />
            <CloudRain className="w-10 h-10 sm:w-12 sm:h-12 text-sky-300 drop-shadow-[0_0_12px_rgba(56,189,248,0.6)] animate-pulse" />
          </div>
        );
      case 'CloudSnow':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-cyan-300/25 rounded-full blur-lg" />
            <CloudSnow className="w-10 h-10 sm:w-12 sm:h-12 text-sky-100 drop-shadow-[0_0_12px_rgba(224,242,254,0.7)]" />
          </div>
        );
      case 'CloudLightning':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-lg animate-pulse" />
            <CloudLightning className="w-10 h-10 sm:w-12 sm:h-12 text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.7)]" />
          </div>
        );
      case 'CloudFog':
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-slate-400/20 rounded-full blur-lg" />
            <CloudFog className="w-10 h-10 sm:w-12 sm:h-12 text-slate-200 drop-shadow-[0_0_12px_rgba(226,232,240,0.5)]" />
          </div>
        );
      default:
        return (
          <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
            <div className="absolute inset-0 bg-slate-400/20 rounded-full blur-lg" />
            <Cloud className="w-10 h-10 sm:w-12 sm:h-12 text-slate-200 drop-shadow-[0_0_12px_rgba(226,232,240,0.5)]" />
          </div>
        );
    }
  };

  return (
    <section 
      aria-label="Current Weather Conditions"
      className="w-full glass-panel-elevated rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300 shadow-2xl"
    >
      {/* Decorative ambient atmospheric lighting bloom */}
      <div 
        className="absolute -top-24 -right-24 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true" 
      />
      <div 
        className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true" 
      />

      <div className="relative z-10 flex flex-col gap-6 sm:gap-7">
        
        {/* Top Header: Metadata Badges & Verification Status */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
          {/* Live Conditions Pill */}
          <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white font-semibold shadow-sm">
            Live Conditions
          </span>

          {/* Timestamp */}
          <span className="flex items-center gap-1.5 text-white/70 font-medium">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Updated {updateTimeFormatted}</span>
          </span>

          {/* Verification Pill */}
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border">
            {locationMode === 'gps' ? (
              <span className="bg-emerald-500/20 border-emerald-400/30 text-emerald-300 flex items-center gap-1 px-2 py-0.5 rounded-full">
                <Navigation className="w-3 h-3 text-emerald-400" />
                <span>GPS SENSOR</span>
              </span>
            ) : locationMode === 'network' ? (
              <span className="bg-sky-500/20 border-sky-400/30 text-sky-300 flex items-center gap-1 px-2 py-0.5 rounded-full">
                <Globe className="w-3 h-3 text-sky-400" />
                <span>IP APPROX</span>
              </span>
            ) : (
              <span className="bg-amber-500/20 border-amber-400/30 text-amber-300 flex items-center gap-1 px-2 py-0.5 rounded-full">
                <MapPin className="w-3 h-3 text-amber-300" />
                <span>SEARCHED</span>
              </span>
            )}
          </span>
        </div>

        {/* Main Body Split: Left Info & Right 2x2 Metric Grid */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
          
          {/* Left Column: Location, "My Location" Button, Large Temperature & Condition */}
          <div className="flex flex-col justify-center space-y-3.5 flex-1 min-w-0">
            
            {/* City Title & "My Location" Action Button */}
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight font-heading break-words">
                {location.name}
              </h2>

              {onGetCurrentLocation && (
                <button
                  onClick={onGetCurrentLocation}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 btn-hover-lift shadow-sm"
                  title="Detect physical device coordinates via GPS"
                  aria-label="Detect My Physical Location"
                >
                  {isLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>My Location</span>
                </button>
              )}
            </div>

            {/* Subtitle / Region */}
            <p className="text-xs sm:text-sm text-sky-200/70 font-medium">
              {location.admin1 ? `${location.admin1}, ` : ''}{location.country || 'Coordinates View'}
            </p>

            {/* Main Temperature & Weather Condition Row */}
            <div className="flex items-center gap-5 sm:gap-6 pt-2 flex-wrap sm:flex-nowrap">
              {/* Giant Temperature */}
              <div className="flex items-start">
                <span className="text-6xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter tabular-nums font-heading leading-none">
                  {formatTemp(current.temperature_2m, unit).replace('°C', '').replace('°F', '')}
                </span>
                <span className="text-2xl sm:text-3xl font-bold text-sky-300 ml-1 font-heading">
                  °{unit}
                </span>
              </div>

              {/* Condition Block with subtle vertical divider */}
              <div className="flex items-center gap-3.5 pl-4 sm:pl-5 border-l border-white/15 my-auto">
                <div className="shrink-0">
                  {renderConditionIcon(condition.icon)}
                </div>

                <div className="flex flex-col justify-center">
                  <div className="text-xl sm:text-2xl font-bold text-white font-heading leading-tight">
                    {condition.label}
                  </div>
                  <div className="text-xs sm:text-sm text-sky-200/80 mt-0.5">
                    Feels like <strong className="text-white tabular-nums">{formatTemp(current.apparent_temperature, unit)}</strong>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="flex items-center gap-1 text-sky-300 font-semibold tabular-nums">
                      <ArrowUp className="w-3.5 h-3.5 text-sky-400" /> {formatTemp(maxTemp, unit)}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-300 font-semibold tabular-nums">
                      <ArrowDown className="w-3.5 h-3.5 text-indigo-400" /> {formatTemp(minTemp, unit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: 2x2 Metric Grid matching reference screenshot */}
          <div className="grid grid-cols-2 gap-3 w-full lg:w-80 shrink-0">
            
            {/* 1. Humidity */}
            <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
                <span>Humidity</span>
                <Droplets className="w-4 h-4 text-sky-400" />
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums font-heading">
                  {current.relative_humidity_2m}%
                </div>
                <div className="text-xs text-sky-200/60 mt-0.5 truncate">
                  {airComfort}
                </div>
              </div>
            </div>

            {/* 2. Wind */}
            <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
                <span>Wind</span>
                <Wind className="w-4 h-4 text-teal-300" />
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums font-heading">
                  {formatWind(current.wind_speed_10m, unit)}
                </div>
                <div className="text-xs text-sky-200/60 mt-0.5 truncate tabular-nums">
                  {getWindDirectionLabel(current.wind_direction_10m)} ({current.wind_direction_10m}°)
                </div>
              </div>
            </div>

            {/* 3. UV Index */}
            <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
                <span>UV Index</span>
                <Sun className="w-4 h-4 text-amber-300" />
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums font-heading">
                  {uvMax}
                </div>
                <div className="text-xs text-sky-200/60 mt-0.5 truncate">
                  {uvDescription}
                </div>
              </div>
            </div>

            {/* 4. Pressure */}
            <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
                <span>Pressure</span>
                <Gauge className="w-4 h-4 text-indigo-300" />
              </div>
              <div className="mt-2.5">
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums font-heading">
                  {current.surface_pressure} <span className="text-xs font-normal text-white/50">hPa</span>
                </div>
                <div className="text-xs text-sky-200/60 mt-0.5 truncate">
                  Barometric
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
