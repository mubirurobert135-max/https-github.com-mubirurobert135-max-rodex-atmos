import React from 'react';
import { Calendar, Sun, Moon, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { DailyWeather } from '../types';
import { formatTemp, getWeatherCondition } from '../utils/weatherUtils';

interface WeeklyForecastProps {
  daily: DailyWeather;
  unit: 'C' | 'F';
}

export const WeeklyForecast: React.FC<WeeklyForecastProps> = ({ daily, unit }) => {
  const { time, weather_code, temperature_2m_max, temperature_2m_min } = daily;

  // Calculate global min and max for temperature range bars
  const allMax = Math.max(...temperature_2m_max);
  const allMin = Math.min(...temperature_2m_min);
  const rangeSpan = allMax - allMin || 1;

  const renderConditionIcon = (code: number) => {
    const cond = getWeatherCondition(code, 1);
    switch (cond.icon) {
      case 'Sun': return <Sun className="w-5 h-5 text-amber-300" />;
      case 'CloudSun': return <CloudSun className="w-5 h-5 text-sky-200" />;
      case 'CloudRain': return <CloudRain className="w-5 h-5 text-blue-300" />;
      case 'CloudSnow': return <CloudSnow className="w-5 h-5 text-sky-100" />;
      case 'CloudLightning': return <CloudLightning className="w-5 h-5 text-amber-300" />;
      default: return <Cloud className="w-5 h-5 text-slate-200" />;
    }
  };

  return (
    <div className="w-full bg-white/10 dark:bg-slate-900/45 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-8 shadow-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="w-5 h-5 text-sky-300" />
        <h3 className="text-lg font-bold text-white tracking-wide">
          7-Day Atmospheric Outlook
        </h3>
      </div>

      <div className="space-y-4">
        {time.map((dateStr, idx) => {
          const date = new Date(dateStr);
          const isToday = idx === 0;
          const dayName = isToday ? 'Today' : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
          const code = weather_code[idx];
          const cond = getWeatherCondition(code, 1);
          const maxT = temperature_2m_max[idx];
          const minT = temperature_2m_min[idx];

          // Calculate percentage width for visual temperature range bar
          const leftPercent = Math.max(0, Math.min(100, ((minT - allMin) / rangeSpan) * 100));
          const widthPercent = Math.max(15, Math.min(100 - leftPercent, ((maxT - minT) / rangeSpan) * 100));

          return (
            <div
              key={dateStr}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition group"
            >
              {/* Day & Icon */}
              <div className="flex items-center gap-4 w-1/3 sm:w-1/4">
                <div className="p-2 rounded-xl bg-white/10 group-hover:scale-110 transition-transform">
                  {renderConditionIcon(code)}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{dayName}</div>
                  <div className="text-xs text-sky-200/70">{cond.label}</div>
                </div>
              </div>

              {/* Min - Max Range Bar (Desktop) */}
              <div className="hidden sm:flex items-center gap-3 w-1/2 px-4">
                <span className="text-xs font-semibold text-white/70 w-10 text-right">
                  {formatTemp(minT, unit)}
                </span>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 shadow-sm"
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-white w-10">
                  {formatTemp(maxT, unit)}
                </span>
              </div>

              {/* Temperatures (Mobile/Tablet) */}
              <div className="flex sm:hidden items-center gap-2">
                <span className="text-xs text-white/70">{formatTemp(minT, unit)}</span>
                <span className="text-xs text-white/40">/</span>
                <span className="text-xs font-bold text-white">{formatTemp(maxT, unit)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
