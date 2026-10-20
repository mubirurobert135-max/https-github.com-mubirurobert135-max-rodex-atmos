import React from 'react';
import { Clock, Sun, Moon, CloudSun, CloudMoon, Cloud, CloudRain, CloudSnow, Droplets } from 'lucide-react';
import { HourlyWeather } from '../types';
import { formatTemp, getWeatherCondition } from '../utils/weatherUtils';

interface HourlyForecastProps {
  hourly: HourlyWeather;
  unit: 'C' | 'F';
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({ hourly, unit }) => {
  // Get next 24 hours starting from current time or index 0
  const nowIndex = Math.max(
    0,
    hourly.time.findIndex(t => new Date(t).getTime() >= Date.now()) - 1
  );
  const hoursToShow = 24;
  const startIndex = Math.max(0, nowIndex);
  const endIndex = Math.min(hourly.time.length, startIndex + hoursToShow);

  const times = hourly.time.slice(startIndex, endIndex);
  const temps = hourly.temperature_2m.slice(startIndex, endIndex);
  const codes = hourly.weather_code.slice(startIndex, endIndex);
  const isDays = hourly.is_day.slice(startIndex, endIndex);
  const precipProbs = hourly.precipitation_probability.slice(startIndex, endIndex);

  const renderMiniIcon = (code: number, isDay: number) => {
    const cond = getWeatherCondition(code, isDay);
    switch (cond.icon) {
      case 'Sun': return <Sun className="w-5 h-5 text-amber-300" />;
      case 'Moon': return <Moon className="w-5 h-5 text-indigo-200" />;
      case 'CloudSun': return <CloudSun className="w-5 h-5 text-sky-200" />;
      case 'CloudMoon': return <CloudMoon className="w-5 h-5 text-indigo-200" />;
      case 'CloudRain': return <CloudRain className="w-5 h-5 text-blue-300" />;
      case 'CloudSnow': return <CloudSnow className="w-5 h-5 text-sky-100" />;
      default: return <Cloud className="w-5 h-5 text-slate-200" />;
    }
  };

  return (
    <div className="w-full bg-white/10 dark:bg-slate-900/45 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-sky-300" />
        <h3 className="text-lg font-bold text-white tracking-wide">
          Hourly Atmospheric Forecast
        </h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 pt-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {times.map((timeStr, idx) => {
          const date = new Date(timeStr);
          const isNow = idx === 0;
          const timeLabel = isNow ? 'Now' : date.toLocaleTimeString([], { hour: 'numeric', hour12: true });

          return (
            <div
              key={timeStr}
              className={`flex flex-col items-center justify-between min-w-[84px] py-4 px-3 rounded-2xl transition-all ${
                isNow
                  ? 'bg-sky-500/25 border-2 border-sky-400/50 shadow-lg shadow-sky-500/20'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10'
              }`}
            >
              <span className="text-xs font-semibold text-white/80">{timeLabel}</span>

              <div className="my-3">
                {renderMiniIcon(codes[idx], isDays[idx])}
              </div>

              <div className="text-base font-bold text-white">
                {formatTemp(temps[idx], unit)}
              </div>

              {precipProbs[idx] > 15 ? (
                <div className="flex items-center gap-1 mt-2 text-[10px] text-sky-300 font-medium">
                  <Droplets className="w-3 h-3" />
                  <span>{precipProbs[idx]}%</span>
                </div>
              ) : (
                <div className="h-4 mt-2" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
