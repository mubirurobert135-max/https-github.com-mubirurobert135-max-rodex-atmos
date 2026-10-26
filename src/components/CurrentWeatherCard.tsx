import React from 'react';
import { 
  Wind, Droplets, Gauge, Sun,
  ArrowUp, ArrowDown, Clock, Navigation, RefreshCw, Globe, MapPin 
} from 'lucide-react';
import { WeatherData, LocationMode } from '../types';
import { formatTemp, formatWind, getWeatherCondition, getWindDirectionLabel } from '../utils/weatherUtils';
import { DimensionalWeatherSculpture } from './DimensionalWeatherSculpture';

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
    ? 'Humid air' 
    : current.relative_humidity_2m < 30 
      ? 'Dry air' 
      : 'Optimal balance';

  return (
    <section 
      aria-label="Current Weather Conditions"
      className="w-full glass-panel-elevated rounded-3xl p-6 sm:p-8 lg:p-10 relative overflow-hidden transition-all duration-300"
    >
      {/* Refined ambient atmospheric lighting bloom */}
      <div 
        className="absolute -top-24 -right-24 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true" 
      />
      <div 
        className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true" 
      />

      <div className="relative z-10 flex flex-col gap-8">
        
        {/* Top Header: Unboxed Metadata & Location Actions */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pb-3 border-b border-white/8">
          
          {/* Metadata Row: Anti-slop unboxed text with · separators */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200/80">
            <span className="font-semibold text-white tracking-wide">Live Atmospheric Observation</span>
            <span aria-hidden="true" className="text-white/30">·</span>
            <span className="flex items-center gap-1.5 text-white/70">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Updated {updateTimeFormatted}</span>
            </span>
            <span aria-hidden="true" className="text-white/30">·</span>
            <span className="flex items-center gap-1.5 font-medium text-sky-300">
              {locationMode === 'gps' ? (
                <>
                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GPS Sensor Verified</span>
                </>
              ) : locationMode === 'network' ? (
                <>
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span>Network Position</span>
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5 text-amber-300" />
                  <span>Selected Station</span>
                </>
              )}
            </span>
          </div>

          {/* Quick GPS Geolocation Action */}
          {onGetCurrentLocation && (
            <button
              onClick={onGetCurrentLocation}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-200 text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50 self-start sm:self-auto touch-target btn-hover-lift"
              title="Detect physical device coordinates via GPS"
              aria-label="Detect My Physical Location"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 text-emerald-400" />
              )}
              <span>My Location</span>
            </button>
          )}
        </div>

        {/* Centerpiece Hero Split: Architectural Weather Data & 3D Sculpture */}
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          
          {/* Left Column (7 cols): Location, Giant Display Temp & Atmospheric Context */}
          <div className="w-full lg:col-span-7 flex flex-col justify-center space-y-4">
            
            {/* Location Title & Mobile Sculpture Lockup */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight font-heading break-words text-balance">
                  {location.name}
                </h2>
                <p className="text-xs sm:text-sm text-sky-200/70 font-medium mt-1">
                  {location.admin1 ? `${location.admin1}, ` : ''}{location.country || 'Global Station'}
                </p>
              </div>

              {/* On mobile devices (<1024px), display sculpture immediately alongside title */}
              <div className="lg:hidden shrink-0">
                <DimensionalWeatherSculpture 
                  theme={condition.theme}
                  isDay={Boolean(current.is_day)}
                  size="md"
                  interactive={true}
                />
              </div>
            </div>

            {/* Giant Architectural Temperature Display & Condition Description */}
            <div className="flex flex-wrap items-baseline gap-4 pt-1 sm:pt-2">
              <div className="flex items-start">
                <span className="text-6xl sm:text-8xl lg:text-9xl font-black text-white tracking-tighter tabular-nums font-heading leading-none">
                  {formatTemp(current.temperature_2m, unit).replace('°C', '').replace('°F', '')}
                </span>
                <span className="text-2xl sm:text-4xl font-bold text-sky-300 ml-1.5 font-heading">
                  °{unit}
                </span>
              </div>

              <div className="flex flex-col justify-center pl-2 sm:pl-4 border-l border-white/15 my-auto">
                <div className="text-xl sm:text-2xl font-bold text-white font-heading">
                  {condition.label}
                </div>
                <div className="text-xs sm:text-sm text-sky-200/80 mt-1">
                  Feels like <strong className="text-white tabular-nums">{formatTemp(current.apparent_temperature, unit)}</strong>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="flex items-center gap-1 text-sky-300 font-semibold tabular-nums">
                    <ArrowUp className="w-3.5 h-3.5 text-sky-400" /> High {formatTemp(maxTemp, unit)}
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="flex items-center gap-1 text-indigo-300 font-semibold tabular-nums">
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-400" /> Low {formatTemp(minTemp, unit)}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (5 cols, Desktop showcase): Majestic 3D Weather Sculpture */}
          <div className="hidden lg:flex lg:col-span-5 flex-col items-center justify-center py-2 sm:py-4">
            <div className="relative flex items-center justify-center p-4">
              {/* Backlight halo glow */}
              <div 
                className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-90 pointer-events-none"
                style={{
                  background: condition.theme === 'sunny' 
                    ? 'radial-gradient(circle, #f59e0b 0%, transparent 70%)'
                    : condition.theme === 'rainy'
                      ? 'radial-gradient(circle, #0284c7 0%, transparent 70%)'
                      : condition.theme === 'thunder'
                        ? 'radial-gradient(circle, #a855f7 0%, transparent 70%)'
                        : 'radial-gradient(circle, #38bdf8 0%, transparent 70%)'
                }}
                aria-hidden="true"
              />

              {/* 3D Interactive Weather Sculpture */}
              <DimensionalWeatherSculpture 
                theme={condition.theme}
                isDay={Boolean(current.is_day)}
                size="hero"
                interactive={true}
              />
            </div>
            
            <p className="text-[11px] text-sky-200/50 text-center font-medium mt-1">
              Interactive 3D Atmospheric Element
            </p>
          </div>

        </div>

        {/* Bottom Atmospheric Vitals Shelf (4 Disciplined Metrics) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-4 border-t border-white/8">
          
          {/* 1. Humidity */}
          <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all">
            <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
              <span>Humidity</span>
              <Droplets className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums font-heading">
                {current.relative_humidity_2m}%
              </div>
              <div className="text-[11px] text-sky-200/60 mt-0.5 truncate">
                {airComfort}
              </div>
            </div>
          </div>

          {/* 2. Wind Dynamics */}
          <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all">
            <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
              <span>Wind Velocity</span>
              <Wind className="w-4 h-4 text-teal-300" />
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums font-heading">
                {formatWind(current.wind_speed_10m, unit)}
              </div>
              <div className="text-[11px] text-sky-200/60 mt-0.5 truncate tabular-nums">
                {getWindDirectionLabel(current.wind_direction_10m)} · {current.wind_direction_10m}°
              </div>
            </div>
          </div>

          {/* 3. UV Radiation */}
          <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all">
            <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
              <span>UV Index</span>
              <Sun className="w-4 h-4 text-amber-300" />
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums font-heading">
                {uvMax}
              </div>
              <div className="text-[11px] text-sky-200/60 mt-0.5 truncate">
                {uvDescription} Exposure
              </div>
            </div>
          </div>

          {/* 4. Barometric Pressure */}
          <div className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-all">
            <div className="flex items-center justify-between text-sky-200/70 text-xs font-medium">
              <span>Pressure</span>
              <Gauge className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums font-heading">
                {current.surface_pressure} <span className="text-xs font-normal text-white/50">hPa</span>
              </div>
              <div className="text-[11px] text-sky-200/60 mt-0.5 truncate">
                Atmospheric Sea Level
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
