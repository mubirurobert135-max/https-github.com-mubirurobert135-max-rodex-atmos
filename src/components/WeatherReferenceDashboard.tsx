import React from 'react';
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun,
  Droplets, Gauge, MapPinned, Mic, Moon, Navigation, ShieldCheck, Sun, Thermometer, User, Wind
} from 'lucide-react';
import { WeatherData, LocationMode } from '../types';
import { formatTemp, formatWind, getWeatherCondition } from '../utils/weatherUtils';

interface WeatherReferenceDashboardProps {
  data: WeatherData;
  unit: 'C' | 'F';
  locationMode: LocationMode;
  isLoading: boolean;
  onGetCurrentLocation: () => void;
  onOpenAssistant: (prompt?: string) => void;
  onOpenMap: () => void;
  onOpenAccount: () => void;
  onOpenPrivacy: () => void;
}

const WeatherSymbol: React.FC<{ code: number; isDay: number; className?: string }> = ({
  code, isDay, className = 'h-6 w-6'
}) => {
  if (code >= 95) return <CloudLightning className={className} aria-hidden="true" />;
  if (code >= 80) return <CloudRain className={className} aria-hidden="true" />;
  if (code >= 71 && code <= 77) return <CloudSnow className={className} aria-hidden="true" />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} aria-hidden="true" />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} aria-hidden="true" />;
  if (code === 45 || code === 48) return <CloudFog className={className} aria-hidden="true" />;
  if (code === 0) return isDay ? <Sun className={className} aria-hidden="true" /> : <Moon className={className} aria-hidden="true" />;
  if (code <= 2) return isDay ? <CloudSun className={className} aria-hidden="true" /> : <CloudMoon className={className} aria-hidden="true" />;
  return <Cloud className={className} aria-hidden="true" />;
};

function formatHour(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: timezone || 'UTC' }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleTimeString([], { hour: 'numeric' });
  }
}

function formatDay(value: string, timezone: string, index: number): string {
  if (index === 0) return 'Today';
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: timezone || 'UTC' }).format(new Date(value + 'T12:00:00'));
  } catch {
    return new Date(value + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
  }
}

export const WeatherReferenceDashboard: React.FC<WeatherReferenceDashboardProps> = ({
  data, unit, locationMode, isLoading, onGetCurrentLocation, onOpenAssistant, onOpenMap, onOpenAccount, onOpenPrivacy
}) => {
  const { location, weather } = data;
  const current = weather.current;
  const daily = weather.daily;
  const hourly = weather.hourly;
  const condition = getWeatherCondition(current.weather_code, current.is_day);
  const timezone = weather.timezone || location.timezone || 'UTC';
  const high = daily.temperature_2m_max?.[0] ?? current.temperature_2m;
  const low = daily.temperature_2m_min?.[0] ?? current.temperature_2m;
  const nextHours = (hourly.time || []).slice(0, 6).map((time, index) => ({
    time,
    temperature: hourly.temperature_2m?.[index] ?? current.temperature_2m,
    probability: hourly.precipitation_probability?.[index] ?? 0
  }));
  const temperatures = nextHours.map((item) => item.temperature);
  const minTemperature = temperatures.length ? Math.min(...temperatures) : current.temperature_2m;
  const maxTemperature = temperatures.length ? Math.max(...temperatures) : current.temperature_2m;
  const temperatureRange = maxTemperature - minTemperature || 1;
  const coordinates = nextHours.map((item, index) => ({
    x: nextHours.length <= 1 ? 160 : 12 + (index * 296) / (nextHours.length - 1),
    y: 48 - ((item.temperature - minTemperature) / temperatureRange) * 29
  }));
  const chartLine = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const chartArea = coordinates.length
    ? `M ${coordinates[0].x} 62 ${coordinates.map((point) => `L ${point.x} ${point.y}`).join(' ')} L ${coordinates[coordinates.length - 1].x} 62 Z`
    : '';
  const locationStatus = locationMode === 'gps' ? 'Device location'
    : locationMode === 'network' ? 'Approximate location'
    : locationMode === 'search' ? 'Selected location' : 'Default location';
  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
  })();

  return (
    <section className="wx-reference-shell" aria-label="RODEX Atmos weather dashboard">
      <aside className="wx-reference-rail" aria-label="Weather tools">
        <div className="wx-reference-mark" aria-label="RODEX Atmos">R</div>
        <div className="wx-reference-rail-divider" />
        <button className="wx-reference-rail-button is-active" type="button" aria-label="Weather dashboard" title="Weather dashboard">
          <Sun className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={onOpenMap} aria-label="Open interactive weather map" title="Interactive weather map">
          <MapPinned className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={() => onOpenAssistant()} aria-label="Open Atmos voice assistant" title="Ask Atmos">
          <Mic className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={onGetCurrentLocation} disabled={isLoading} aria-label="Refresh current device location" title="My location">
          <Navigation className={`h-5 w-5 ${isLoading ? 'animate-pulse' : ''}`} />
        </button>
        <div className="wx-reference-rail-divider wx-reference-rail-divider-lower" />
        <button className="wx-reference-rail-button" type="button" onClick={onOpenAccount} aria-label="Open account and sign-in" title="Account">
          <User className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={onOpenPrivacy} aria-label="Open privacy portal" title="Privacy and account controls">
          <ShieldCheck className="h-5 w-5" />
        </button>
        <div className="wx-reference-rail-spacer" />
        <div className="wx-reference-rail-status" title={locationStatus}>
          <span className={`wx-status-dot ${locationMode === 'gps' ? 'is-live' : ''}`} />
          <span className="sr-only">{locationStatus}</span>
        </div>
      </aside>

      <div className="wx-reference-content">
        <header className="wx-reference-heading">
          <div className="wx-reference-title-group">
            <div className="wx-eyebrow"><span className="wx-eyebrow-dot" /> RODEX ATMOS <span className="wx-eyebrow-separator">/</span> WEATHER INTELLIGENCE</div>
            <h1 className="wx-reference-title">Understand your day.</h1>
            <div className="wx-reference-date">{dateLabel} <span>·</span> {location.name}{location.country ? `, ${location.country}` : ''}</div>
          </div>
          <div className="wx-live-status">
            <span className="wx-live-pulse" />
            <span>Live conditions</span>
            <span className="wx-live-divider" />
            <span>{formatHour(current.time, timezone)} local</span>
          </div>
        </header>

        <div className="wx-reference-hero-grid">
          <div className="wx-reference-story">
            <div className="wx-story-label">CURRENT ATMOSPHERIC CONDITIONS</div>
            <h2>{condition.label}</h2>
            <p className="wx-story-copy">
              A live view of the atmosphere above <strong>{location.name}</strong>, with your current conditions and the forecast ahead.
            </p>

            <div className="wx-temperature-trend">
              <div className="wx-trend-heading">
                <div>
                  <span className="wx-panel-kicker">Temperature trend</span>
                  <span className="wx-panel-subtitle">Next available hours</span>
                </div>
                <span className="wx-trend-range">{formatTemp(minTemperature, unit)} – {formatTemp(maxTemperature, unit)}</span>
              </div>
              <svg className="wx-trend-chart" viewBox="0 0 320 72" role="img" aria-label="Temperature trend for the next available hours" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wxTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#92d9ec" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#92d9ec" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[18, 40, 62].map((y) => <line key={y} x1="8" y1={y} x2="312" y2={y} stroke="rgba(255,255,255,.1)" strokeDasharray="3 5" />)}
                {chartArea && <path d={chartArea} fill="url(#wxTrendFill)" />}
                {chartLine && <path d={chartLine} fill="none" stroke="#9de4ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                {coordinates.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3" fill="#e5fbff" stroke="#5dc7df" strokeWidth="1.5" />)}
              </svg>
              <div className="wx-trend-labels">
                {nextHours.map((item) => (
                  <div key={item.time} className="wx-trend-label">
                    <span>{formatHour(item.time, timezone)}</span>
                    <strong>{formatTemp(item.temperature, unit)}</strong>
                    {item.probability > 0 && <small>{Math.round(item.probability)}% rain</small>}
                  </div>
                ))}
              </div>
            </div>

            <div className="wx-hero-actions">
              <button type="button" onClick={() => onOpenAssistant(`Explain the current weather and forecast for ${location.name}`)} className="wx-action-primary">
                <Mic className="h-4 w-4" /> Ask Atmos
              </button>
              <button type="button" onClick={onOpenMap} className="wx-action-secondary">
                <MapPinned className="h-4 w-4" /> Explore weather map
              </button>
            </div>
          </div>

          <div className={`wx-current-panel wx-theme-${condition.theme}`}>
            <div className="wx-current-panel-top">
              <div className="wx-current-location"><MapPinned className="h-4 w-4" /><span>{location.name}</span></div>
              <span className="wx-location-status">{locationStatus}</span>
            </div>
            <div className="wx-current-condition">
              <div className="wx-current-temp-wrap">
                <div className="wx-current-temp">{formatTemp(current.temperature_2m, unit)}</div>
                <div className="wx-current-condition-label">{condition.label}</div>
                <div className="wx-feels-like"><Thermometer className="h-3.5 w-3.5" /> Feels like {formatTemp(current.apparent_temperature, unit)}</div>
              </div>
              <div className={`wx-current-weather-icon wx-icon-${condition.theme}`}>
                <WeatherSymbol code={current.weather_code} isDay={current.is_day} className="h-16 w-16 sm:h-20 sm:w-20" />
              </div>
            </div>
            <div className="wx-current-range">
              <span><Sun className="h-3.5 w-3.5" /> High <strong>{formatTemp(high, unit)}</strong></span>
              <span><Moon className="h-3.5 w-3.5" /> Low <strong>{formatTemp(low, unit)}</strong></span>
            </div>
            <div className="wx-metric-grid">
              <div className="wx-metric-cell"><Droplets className="h-4 w-4" /><span>Humidity</span><strong>{Math.round(current.relative_humidity_2m)}%</strong></div>
              <div className="wx-metric-cell"><Wind className="h-4 w-4" /><span>Wind speed</span><strong>{formatWind(current.wind_speed_10m, unit)}</strong></div>
              <div className="wx-metric-cell"><Gauge className="h-4 w-4" /><span>Pressure</span><strong>{Math.round(current.surface_pressure)} hPa</strong></div>
              <div className="wx-metric-cell"><Droplets className="h-4 w-4" /><span>Precipitation</span><strong>{Number(current.precipitation || 0).toFixed(1)} mm</strong></div>
            </div>
          </div>
        </div>

        <div className="wx-forecast-strip">
          <div className="wx-forecast-strip-heading">
            <div><div className="wx-panel-kicker">Seven-day forecast</div><div className="wx-panel-subtitle">The week ahead</div></div>
            <span className="wx-forecast-location">{location.name}</span>
          </div>
          <div className="wx-forecast-days">
            {(daily.time || []).slice(0, 7).map((day, index) => {
              const code = daily.weather_code?.[index] ?? current.weather_code;
              const dayHigh = daily.temperature_2m_max?.[index] ?? current.temperature_2m;
              const dayLow = daily.temperature_2m_min?.[index] ?? current.temperature_2m;
              return (
                <div className={`wx-forecast-day ${index === 0 ? 'is-today' : ''}`} key={day}>
                  <span className="wx-forecast-day-name">{formatDay(day, timezone, index)}</span>
                  <WeatherSymbol code={code} isDay={1} className="h-5 w-5 sm:h-6 sm:w-6" />
                  <strong>{formatTemp(dayHigh, unit)}</strong>
                  <span className="wx-forecast-low">{formatTemp(dayLow, unit)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
