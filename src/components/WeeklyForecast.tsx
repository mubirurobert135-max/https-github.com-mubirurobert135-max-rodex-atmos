import React from 'react';
import { Calendar, Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
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
    <section 
      aria-label="7-Day Atmospheric Outlook"
      className="w-full glass-panel-elevated rounded-3xl p-6 sm:p-7 relative overflow-hidden transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Calendar className="w-4 h-4 text-sky-400" />
          <h3 className="text-base sm:text-lg font-heading font-bold text-white tracking-wide">
            7-Day Atmospheric Outlook
          </h3>
        </div>
        <span className="text-xs text-sky-200/60 font-medium">
          Extended Model
        </span>
      </div>

      <div className="space-y-2.5">
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
          const widthPercent = Math.max(16, Math.min(100 - leftPercent, ((maxT - minT) / rangeSpan) * 100));

          return (
            <div
              key={dateStr}
              className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl transition-all ${
                isToday 
                  ? 'bg-sky-500/15 border border-sky-400/30 shadow-sm' 
                  : 'bg-white/[0.03] hover:bg-white/[0.07] border border-white/6'
              }`}
            >
              {/* Day & Condition Label */}
              <div className="flex items-center gap-3.5 w-2/5 sm:w-1/3 min-w-0">
                <div className="p-2 rounded-xl bg-white/[0.06] shrink-0">
                  {renderConditionIcon(code)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-heading font-bold text-white truncate">
                    {dayName}
                  </div>
                  <div className="text-[11px] text-sky-200/70 truncate">
                    {cond.label}
                  </div>
                </div>
              </div>

              {/* Min-Max Range Bar (Tablets & Desktop) */}
              <div className="hidden sm:flex items-center gap-3 flex-1 px-4 max-w-md">
                <span className="text-xs font-semibold text-white/60 w-10 text-right tabular-nums">
                  {formatTemp(minT, unit)}
                </span>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-indigo-400 shadow-sm"
                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-white w-10 tabular-nums">
                  {formatTemp(maxT, unit)}
                </span>
              </div>

              {/* Min/Max (Mobile View) */}
              <div className="flex sm:hidden items-center gap-1.5 tabular-nums text-xs font-semibold shrink-0">
                <span className="text-indigo-300">{formatTemp(minT, unit)}</span>
                <span className="text-white/30">/</span>
                <span className="text-white font-bold">{formatTemp(maxT, unit)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
