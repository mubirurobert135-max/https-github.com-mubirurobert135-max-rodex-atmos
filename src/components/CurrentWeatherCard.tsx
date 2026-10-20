import React from 'react';
import { 
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, 
  CloudRain, CloudSnow, CloudLightning, Wind, Droplets, Thermometer, 
  Compass, Gauge, Eye, ArrowUp, ArrowDown, Clock
} from 'lucide-react';
import { WeatherData } from '../types';
import { formatTemp, formatWind, getWeatherCondition, getWindDirectionLabel } from '../utils/weatherUtils';

interface CurrentWeatherCardProps {
  data: WeatherData;
  unit: 'C' | 'F';
}

export const CurrentWeatherCard: React.FC<CurrentWeatherCardProps> = ({ data, unit }) => {
  const { location, weather } = data;
  const current = weather.current;
  const daily = weather.daily;

  const condition = getWeatherCondition(current.weather_code, current.is_day);
  const maxTemp = daily?.temperature_2m_max?.[0] ?? current.temperature_2m + 3;
  const minTemp = daily?.temperature_2m_min?.[0] ?? current.temperature_2m - 3;
  const uvMax = daily?.uv_index_max?.[0] ?? 5;

  // Icon selector
  const renderWeatherIcon = (iconName: string, className: string = "w-16 h-16") => {
    switch (iconName) {
      case 'Sun': return <Sun className={`${className} text-amber-300 animate-spin-slow`} />;
      case 'Moon': return <Moon className={`${className} text-indigo-200`} />;
      case 'CloudSun': return <CloudSun className={`${className} text-sky-200`} />;
      case 'CloudMoon': return <CloudMoon className={`${className} text-indigo-200`} />;
      case 'Cloud': return <Cloud className={`${className} text-slate-200`} />;
      case 'CloudFog': return <CloudFog className={`${className} text-slate-300`} />;
      case 'CloudDrizzle': return <CloudDrizzle className={`${className} text-sky-300`} />;
      case 'CloudRain': return <CloudRain className={`${className} text-blue-300`} />;
      case 'CloudSnow': return <CloudSnow className={`${className} text-sky-100`} />;
      case 'CloudLightning': return <CloudLightning className={`${className} text-amber-300`} />;
      default: return <Sun className={`${className} text-amber-300`} />;
    }
  };

  const updateTimeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-full bg-white/10 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all">
      {/* Decorative glass glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-sky-400/20 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
        
        {/* Left: Location & Main Temperature */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-semibold tracking-wide backdrop-blur-md">
              Live Conditions
            </span>
            <span className="text-xs text-white/60 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Updated {updateTimeFormatted}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mt-1">
            {location.name}
          </h2>
          <p className="text-sm sm:text-base text-sky-200 font-medium">
            {location.admin1 ? `${location.admin1}, ` : ''}{location.country || 'Coordinates View'}
          </p>

          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-start">
              <span className="text-6xl sm:text-7xl lg:text-8xl font-black text-white tracking-tighter">
                {formatTemp(current.temperature_2m, unit).replace('°C', '').replace('°F', '')}
              </span>
              <span className="text-3xl sm:text-4xl font-bold text-sky-300 mt-2">
                °{unit}
              </span>
            </div>

            <div className="flex flex-col justify-center pl-4 border-l border-white/20">
              <div className="flex items-center gap-2 text-white font-semibold text-lg sm:text-xl">
                {renderWeatherIcon(condition.icon, "w-8 h-8")}
                <span>{condition.label}</span>
              </div>
              <p className="text-xs sm:text-sm text-sky-200/80 mt-1">
                Feels like {formatTemp(current.apparent_temperature, unit)}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-white/70">
                <span className="flex items-center gap-1 text-sky-300 font-medium">
                  <ArrowUp className="w-3.5 h-3.5" /> {formatTemp(maxTemp, unit)}
                </span>
                <span className="flex items-center gap-1 text-blue-300 font-medium">
                  <ArrowDown className="w-3.5 h-3.5" /> {formatTemp(minTemp, unit)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quick Atmospheric Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 w-full lg:w-auto">
          
          {/* Humidity */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md transition group">
            <div className="flex items-center justify-between text-white/70 text-xs font-medium">
              <span>Humidity</span>
              <Droplets className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white">{current.relative_humidity_2m}%</div>
              <div className="text-[11px] text-white/60 mt-0.5">
                {current.relative_humidity_2m > 70 ? 'Humid & damp' : current.relative_humidity_2m < 30 ? 'Dry air' : 'Comfortable'}
              </div>
            </div>
          </div>

          {/* Wind */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md transition group">
            <div className="flex items-center justify-between text-white/70 text-xs font-medium">
              <span>Wind</span>
              <Wind className="w-4 h-4 text-sky-300 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white">{formatWind(current.wind_speed_10m, unit)}</div>
              <div className="text-[11px] text-white/60 mt-0.5">
                {getWindDirectionLabel(current.wind_direction_10m)} ({current.wind_direction_10m}°)
              </div>
            </div>
          </div>

          {/* UV Index */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md transition group">
            <div className="flex items-center justify-between text-white/70 text-xs font-medium">
              <span>UV Index</span>
              <Sun className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white">{uvMax}</div>
              <div className="text-[11px] text-white/60 mt-0.5">
                {uvMax > 8 ? 'Very High' : uvMax > 5 ? 'High' : 'Moderate'}
              </div>
            </div>
          </div>

          {/* Pressure */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md transition group">
            <div className="flex items-center justify-between text-white/70 text-xs font-medium">
              <span>Pressure</span>
              <Gauge className="w-4 h-4 text-indigo-300 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white">{current.surface_pressure} <span className="text-xs font-normal text-white/60">hPa</span></div>
              <div className="text-[11px] text-white/60 mt-0.5">Barometric</div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
