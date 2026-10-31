import React from 'react';
import { Sunrise, Sunset, Wind, Droplets, Compass, Gauge } from 'lucide-react';
import { WeatherData } from '../types';
import { formatWind, getWindDirectionLabel, formatForecastClock } from '../utils/weatherUtils';

interface WeatherDetailsGridProps {
  data: WeatherData;
  unit: 'C' | 'F';
}

export const WeatherDetailsGrid: React.FC<WeatherDetailsGridProps> = ({ data, unit }) => {
  const { current, daily } = data.weather;

  // Provider solar times are already local to the forecast location; don't
  // convert them using the viewing device's timezone or invent fallback times.
  const sunriseStr = formatForecastClock(daily?.sunrise?.[0]);
  const sunsetStr = formatForecastClock(daily?.sunset?.[0]);

  return (
    <section 
      aria-label="Atmospheric Details"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
    >
      {/* 1. Solar Schedule (Sunrise & Sunset) */}
      <div className="glass-panel-elevated rounded-3xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sky-300 text-xs font-heading font-semibold tracking-wide">
            <Sunrise className="w-4 h-4 text-amber-300" />
            <span>Solar Schedule</span>
          </div>
          <span className="text-[11px] text-white/40">Astronomical Cycle</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5 mt-auto">
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/8 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-amber-300 mb-2">
              <Sunrise className="w-4 h-4" />
              <span className="text-xs text-white/70 font-medium">Sunrise</span>
            </div>
            <div className="text-lg sm:text-xl font-heading font-black text-white tabular-nums">
              {sunriseStr}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/8 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-rose-300 mb-2">
              <Sunset className="w-4 h-4" />
              <span className="text-xs text-white/70 font-medium">Sunset</span>
            </div>
            <div className="text-lg sm:text-xl font-heading font-black text-white tabular-nums">
              {sunsetStr}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Wind Dynamics & Direction Dial */}
      <div className="glass-panel-elevated rounded-3xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sky-300 text-xs font-heading font-semibold tracking-wide">
            <Wind className="w-4 h-4 text-teal-300" />
            <span>Wind Dynamics</span>
          </div>
          <span className="text-[11px] text-white/40 tabular-nums">10m Altitude</span>
        </div>

        <div className="flex items-center justify-between my-auto py-2">
          <div>
            <div className="text-2xl sm:text-3xl font-heading font-black text-white tabular-nums">
              {formatWind(current.wind_speed_10m, unit)}
            </div>
            <div className="text-xs text-sky-200/80 mt-1 font-medium tabular-nums">
              {getWindDirectionLabel(current.wind_direction_10m)} · {current.wind_direction_10m}°
            </div>
          </div>

          <div 
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/[0.05] border border-white/15 flex items-center justify-center relative shadow-inner shrink-0"
            aria-label={`Wind direction ${current.wind_direction_10m} degrees`}
          >
            <div 
              className="absolute w-1.5 h-8 sm:h-9 bg-gradient-to-t from-sky-400 to-teal-300 rounded-full transition-transform duration-500 origin-bottom"
              style={{ transform: `rotate(${current.wind_direction_10m}deg)` }}
            />
            <Compass className="w-8 h-8 text-white/20" />
          </div>
        </div>
      </div>

      {/* 3. Precipitation & Barometric Pressure */}
      <div className="glass-panel-elevated rounded-3xl p-6 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sky-300 text-xs font-heading font-semibold tracking-wide">
            <Droplets className="w-4 h-4 text-sky-400" />
            <span>Precipitation & Pressure</span>
          </div>
          <span className="text-[11px] text-white/40">Surface Gauges</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5 mt-auto">
          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/8 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 mb-2">
              <Droplets className="w-4 h-4" />
              <span className="text-xs text-white/70 font-medium">Accumulation</span>
            </div>
            <div className="text-lg sm:text-xl font-heading font-black text-white tabular-nums">
              {Number.isFinite(current.precipitation) ? current.precipitation.toFixed(1) : '—'} <span className="text-xs font-normal text-white/60">mm</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/8 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-indigo-300 mb-2">
              <Gauge className="w-4 h-4" />
              <span className="text-xs text-white/70 font-medium">Sea Level</span>
            </div>
            <div className="text-lg sm:text-xl font-heading font-black text-white tabular-nums">
              {Number.isFinite(current.surface_pressure) ? Math.round(current.surface_pressure) : '—'} <span className="text-xs font-normal text-white/60">hPa</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
