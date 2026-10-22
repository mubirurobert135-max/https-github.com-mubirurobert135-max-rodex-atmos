import React from 'react';
import { Sunrise, Sunset, Wind, Droplets, Sun, Compass, Eye, Gauge } from 'lucide-react';
import { WeatherData } from '../types';
import { formatWind, getWindDirectionLabel } from '../utils/weatherUtils';

interface WeatherDetailsGridProps {
  data: WeatherData;
  unit: 'C' | 'F';
}

export const WeatherDetailsGrid: React.FC<WeatherDetailsGridProps> = ({ data, unit }) => {
  const { current, daily } = data.weather;

  const sunriseStr = daily?.sunrise?.[0] ? new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '05:45 AM';
  const sunsetStr = daily?.sunset?.[0] ? new Date(daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:50 PM';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      
      {/* Sunrise & Sunset */}
      <div className="bg-white/10 dark:bg-slate-900/45 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
        <div className="flex items-center gap-2 text-sky-300 text-sm font-heading font-bold uppercase tracking-wider mb-4">
          <Sunrise className="w-4 h-4" />
          <span>Solar Schedule</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-400/20 text-amber-300">
                <Sunrise className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/60 font-medium">Sunrise</div>
                <div className="text-base font-heading font-bold text-white tabular-nums">{sunriseStr}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-400/20 text-purple-300">
                <Sunset className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/60 font-medium">Sunset</div>
                <div className="text-base font-heading font-bold text-white tabular-nums">{sunsetStr}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wind & Direction Compass */}
      <div className="bg-white/10 dark:bg-slate-900/45 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
        <div className="flex items-center gap-2 text-sky-300 text-sm font-heading font-bold uppercase tracking-wider mb-4">
          <Wind className="w-4 h-4" />
          <span>Wind Dynamics</span>
        </div>

        <div className="flex items-center justify-between my-auto py-4">
          <div>
            <div className="text-3xl font-heading font-black text-white tabular-nums">{formatWind(current.wind_speed_10m, unit)}</div>
            <div className="text-sm text-sky-200 mt-1 font-medium tabular-nums">
              Direction: {getWindDirectionLabel(current.wind_direction_10m)} ({current.wind_direction_10m}°)
            </div>
          </div>

          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center relative shadow-inner">
            <div 
              className="absolute w-1.5 h-10 bg-gradient-to-t from-sky-400 to-indigo-500 rounded-full transition-transform duration-500 origin-bottom"
              style={{ transform: `rotate(${current.wind_direction_10m}deg)` }}
            />
            <Compass className="w-10 h-10 text-white/40" />
          </div>
        </div>
      </div>

      {/* Precipitation & Air Quality */}
      <div className="bg-white/10 dark:bg-slate-900/45 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col justify-between sm:col-span-2 lg:col-span-1">
        <div className="flex items-center gap-2 text-sky-300 text-sm font-heading font-bold uppercase tracking-wider mb-4">
          <Droplets className="w-4 h-4" />
          <span>Precipitation & Moisture</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-400/20 text-blue-300">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/60 font-medium">Precipitation Volume</div>
                <div className="text-base font-heading font-bold text-white tabular-nums">{current.precipitation} mm</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-400/20 text-sky-300">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/60 font-medium">Surface Pressure</div>
                <div className="text-base font-heading font-bold text-white tabular-nums">{current.surface_pressure} hPa</div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
