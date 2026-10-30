import React from 'react';
import { Clock, Sun, Moon, CloudSun, CloudMoon, Cloud, CloudRain, CloudSnow, CloudLightning, Droplets, ChevronRight } from 'lucide-react';
import { HourlyWeather } from '../types';
import { formatTemp, getWeatherCondition, findNextHourlyIndex, normalizeForecastLocalTime, formatForecastLocalHour } from '../utils/weatherUtils';

interface HourlyForecastProps {
  hourly: HourlyWeather;
  unit: 'C' | 'F';
  currentTime?: string;
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({ hourly, unit, currentTime }) => {
  // Provider hourly values use the forecast location's local clock. Do not compare
  // them with the viewer device clock, which may be in a different timezone.
  const localNow = normalizeForecastLocalTime(currentTime);
  const firstFutureIndex = localNow
    ? hourly.time.findIndex((time) => normalizeForecastLocalTime(time) > localNow)
    : findNextHourlyIndex(hourly.time, currentTime);
  const nowIndex = firstFutureIndex >= 0 ? firstFutureIndex : Math.max(0, hourly.time.length - 1);
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
      case 'CloudLightning': return <CloudLightning className="w-5 h-5 text-amber-300" />;
      default: return <Cloud className="w-5 h-5 text-slate-300" />;
    }
  };

  return (
    <section 
      aria-label="24-Hour Forecast"
      className="w-full glass-panel-elevated rounded-3xl p-6 sm:p-7 relative overflow-hidden transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-sky-400" />
          <h3 className="text-base sm:text-lg font-heading font-bold text-white tracking-wide">
            Hourly Atmospheric Forecast
          </h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-sky-200/60 font-medium">
          <span>24-Hour Horizon</span>
          <ChevronRight className="w-3.5 h-3.5 text-sky-400/80" />
        </div>
      </div>

      {/* Horizontal Scroll Rail */}
      <div className="forecast-rail flex gap-3 overflow-x-auto pb-3 pt-1">
        {times.map((timeStr, idx) => {
          const isNow = idx === 0;
          const timeLabel = isNow ? 'Next' : formatForecastLocalHour(timeStr);

          return (
            <div
              key={timeStr}
              className={`flex flex-col items-center justify-between min-w-[78px] sm:min-w-[86px] py-4 px-3 rounded-2xl transition-all select-none ${
                isNow
                  ? 'bg-sky-500/20 border border-sky-400/40 shadow-lg shadow-sky-500/10'
                  : 'bg-white/[0.03] hover:bg-white/[0.07] border border-white/6'
              }`}
            >
              <span className={`text-xs font-semibold tabular-nums ${isNow ? 'text-sky-300 font-bold' : 'text-white/70'}`}>
                {timeLabel}
              </span>

              <div className="my-3 flex items-center justify-center h-7 drop-shadow-sm">
                {renderMiniIcon(codes[idx], isDays[idx])}
              </div>

              <div className="text-base sm:text-lg font-heading font-bold text-white tabular-nums">
                {formatTemp(temps[idx], unit)}
              </div>

              {precipProbs[idx] > 10 ? (
                <div className="flex items-center gap-1 mt-2 text-[11px] text-sky-300 font-semibold tabular-nums">
                  <Droplets className="w-3 h-3 text-sky-400" />
                  <span>{precipProbs[idx]}%</span>
                </div>
              ) : (
                <div className="h-4 mt-2" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
