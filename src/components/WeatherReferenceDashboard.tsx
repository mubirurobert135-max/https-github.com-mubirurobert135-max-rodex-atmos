import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain,
  CloudSnow, CloudSun, Droplets, Gauge, MapPinned, Mic, Moon, Navigation,
  ShieldCheck, Sun, Thermometer, UserRound, Wind
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
  onOpenAlerts: () => void;
  onSelectCoordinates: (lat: number, lon: number, name: string) => void;
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

function citiesForCountry(country: string): string[] {
  const key = country.trim().toLowerCase();
  if (key === 'uganda') return ['Entebbe', 'Jinja', 'Mbarara'];
  if (key === 'kenya') return ['Nairobi', 'Mombasa', 'Kisumu'];
  if (key === 'tanzania' || key === 'united republic of tanzania') return ['Dar es Salaam', 'Arusha', 'Dodoma'];
  if (key === 'rwanda') return ['Kigali', 'Musanze', 'Huye'];
  if (key === 'united kingdom' || key === 'uk') return ['London', 'Manchester', 'Edinburgh'];
  if (key === 'japan') return ['Tokyo', 'Osaka', 'Sapporo'];
  return ['Nairobi', 'London', 'Tokyo'];
}

export const WeatherReferenceDashboard: React.FC<WeatherReferenceDashboardProps> = ({
  data, unit, locationMode, isLoading, onGetCurrentLocation, onOpenAssistant, onOpenMap,
  onOpenAccount, onOpenPrivacy, onOpenAlerts, onSelectCoordinates
}) => {
  const { location, weather } = data;
  const current = weather.current;
  const daily = weather.daily;
  const hourly = weather.hourly;
  const condition = getWeatherCondition(current.weather_code, current.is_day);
  const timezone = weather.timezone || location.timezone || 'UTC';
  const high = daily.temperature_2m_max?.[0] ?? current.temperature_2m;
  const low = daily.temperature_2m_min?.[0] ?? current.temperature_2m;
  const nearbyNames = useMemo(() => citiesForCountry(location.country || ''), [location.country]);
  const [nearbyWeather, setNearbyWeather] = useState<WeatherData[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNearbyLoading(true);
    Promise.all(nearbyNames.map(async (city) => {
      try {
        const query = encodeURIComponent(`${city}, ${location.country}`);
        const response = await fetch(`/api/weather/search?query=${query}`);
        if (!response.ok) return null;
        const result: WeatherData = await response.json();
        return result?.weather?.current && result?.location?.name ? result : null;
      } catch {
        return null;
      }
    })).then((results) => {
      if (!cancelled) setNearbyWeather(results.filter((item): item is WeatherData => item !== null));
    }).finally(() => {
      if (!cancelled) setNearbyLoading(false);
    });
    return () => { cancelled = true; };
  }, [location.country, nearbyNames]);

  const nextHours = (hourly.time || []).slice(0, 6).map((time, index) => ({
    time,
    temperature: hourly.temperature_2m?.[index] ?? current.temperature_2m,
    probability: hourly.precipitation_probability?.[index] ?? 0,
    code: hourly.weather_code?.[index] ?? current.weather_code,
    isDay: hourly.is_day?.[index] ?? current.is_day
  }));
  const temps = nextHours.map((item) => item.temperature);
  const minTemperature = temps.length ? Math.min(...temps) : current.temperature_2m;
  const maxTemperature = temps.length ? Math.max(...temps) : current.temperature_2m;
  const temperatureRange = maxTemperature - minTemperature || 1;
  const points = nextHours.map((item, index) => ({
    x: nextHours.length <= 1 ? 220 : 12 + (index * 396) / (nextHours.length - 1),
    y: 74 - ((item.temperature - minTemperature) / temperatureRange) * 46
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x} 94 ${points.map((point) => `L ${point.x} ${point.y}`).join(' ')} L ${points[points.length - 1].x} 94 Z`
    : '';
  const statusLabel = locationMode === 'gps' ? 'GPS location'
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
  const heroTitle = current.weather_code >= 95
    ? 'Storm with Heavy Rain'
    : current.weather_code >= 61 && current.weather_code <= 82
      ? 'Storm with Heavy Rain'
      : condition.label;
  const rainChance = Math.max(0, ...nextHours.map((item) => item.probability));
  const maxTempText = formatTemp(maxTemperature, unit);
  const minTempText = formatTemp(minTemperature, unit);

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
        <button className="wx-reference-rail-button" type="button" onClick={onOpenAlerts} aria-label="Weather alerts" title="Weather alerts">
          <Bell className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={onGetCurrentLocation} disabled={isLoading} aria-label="Refresh current device location" title="My location">
          <Navigation className={`h-5 w-5 ${isLoading ? 'animate-pulse' : ''}`} />
        </button>
        <div className="wx-reference-rail-spacer" />
        <button className="wx-reference-rail-button" type="button" onClick={onOpenAccount} aria-label="Open account and sign-in" title="Account">
          <UserRound className="h-5 w-5" />
        </button>
        <button className="wx-reference-rail-button" type="button" onClick={onOpenPrivacy} aria-label="Open privacy portal" title="Privacy and account controls">
          <ShieldCheck className="h-5 w-5" />
        </button>
        <div className="wx-reference-rail-status" title={statusLabel}>
          <span className={`wx-status-dot ${locationMode === 'gps' ? 'is-live' : ''}`} />
          <span className="sr-only">{statusLabel}</span>
        </div>
      </aside>

      <div className="wx-reference-content">
        <header className="wx-reference-heading">
          <div className="wx-reference-title-group">
            <div className="wx-welcome-line">Welcome to <strong>RODEX Atmos</strong></div>
            <div className="wx-reference-kicker">Weather forecast <span>·</span> {dateLabel}</div>
          </div>
          <div className="wx-reference-heading-right">
            <div className="wx-live-status">
              <span className="wx-live-pulse" />
              <span>{location.name}{location.country ? `, ${location.country}` : ''}</span>
              <span className="wx-live-divider" />
              <span>{formatHour(current.time, timezone)} local</span>
            </div>
            <button type="button" className="wx-reference-quick-location" onClick={onGetCurrentLocation} disabled={isLoading} aria-label="Refresh current device location" title="Use my current location">
              <Navigation className={`h-3.5 w-3.5 ${isLoading ? 'animate-pulse' : ''}`} />
              <span>My location</span>
            </button>
          </div>
        </header>

        <div className="wx-reference-layout">
          <div className="wx-reference-main">
            <div className="wx-story-label">WEATHER FORECAST</div>
            <h1 className="wx-reference-title wx-storm-title">{heroTitle}</h1>
            <p className="wx-story-copy">
              {condition.label} conditions in <strong>{location.name}</strong>. Current temperature is {formatTemp(current.temperature_2m, unit)}, with feels-like temperature of {formatTemp(current.apparent_temperature, unit)}. Follow the forecast and local atmospheric changes below.
            </p>

            <div className="wx-hourly-heading">
              <span>Hourly weather forecast</span>
              <span className="wx-hourly-heading-note">{`${maxTempText} high · ${minTempText} low`}</span>
            </div>
            <div className="wx-hourly-temperatures">
              {nextHours.map((item) => (
                <div key={item.time} className="wx-hourly-temperature">
                  <span>{formatHour(item.time, timezone)}</span>
                  <WeatherSymbol code={item.code} isDay={item.isDay} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                  <strong>{formatTemp(item.temperature, unit)}</strong>
                  {item.probability > 0 && <small>{Math.round(item.probability)}% rain</small>}
                </div>
              ))}
            </div>

            <div className="wx-weather-curve-panel">
              <div className="wx-curve-topline">
                <span>Temperature through the day</span>
                <span className="wx-curve-badge"><Droplets className="h-3 w-3" /> {Math.round(rainChance)}% peak rain chance</span>
              </div>
              <svg className="wx-trend-chart" viewBox="0 0 420 104" role="img" aria-label="Hourly temperature trend" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="wxTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d7f8ff" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#d7f8ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[22, 50, 78, 94].map((y) => <line key={y} x1="7" y1={y} x2="413" y2={y} stroke="rgba(255,255,255,.18)" strokeDasharray="3 6" />)}
                {areaPath && <path d={areaPath} fill="url(#wxTrendFill)" />}
                {linePath && <path d={linePath} fill="none" stroke="#e5faff" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />}
                {points.map((point, index) => (
                  <g key={index}>
                    <circle cx={point.x} cy={point.y} r="4" fill="#eafaff" stroke="#8fd7e9" strokeWidth="2" />
                    {nextHours[index]?.probability >= 40 && <circle cx={point.x} cy={point.y - 13} r="3" fill="#d8f4ff" opacity=".86" />}
                  </g>
                ))}
              </svg>
              <div className="wx-curve-axis">
                {nextHours.map((item) => <span key={item.time}>{formatHour(item.time, timezone)}</span>)}
              </div>
            </div>

            <div className="wx-weekly-strip">
              <div className="wx-weekly-strip-title">Weekly forecast</div>
              <div className="wx-weekly-days">
                {(daily.time || []).slice(0, 6).map((day, index) => {
                  const code = daily.weather_code?.[index] ?? current.weather_code;
                  const max = daily.temperature_2m_max?.[index] ?? current.temperature_2m;
                  const min = daily.temperature_2m_min?.[index] ?? current.temperature_2m;
                  return (
                    <div className={`wx-weekly-day ${index === 0 ? 'is-today' : ''}`} key={day}>
                      <span>{formatDay(day, timezone, index)}</span>
                      <WeatherSymbol code={code} isDay={1} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                      <strong>{formatTemp(max, unit)}</strong>
                      <small>{formatTemp(min, unit)}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="wx-reference-aside" aria-label="Current weather and nearby locations">
            <section className="wx-live-weather-card">
              <div className="wx-live-weather-top">
                <div className="wx-live-weather-location"><MapPinned className="h-3.5 w-3.5" /><span>{location.name}</span></div>
                <span className="wx-location-status">{statusLabel}</span>
              </div>
              <div className="wx-live-weather-temp-row">
                <div>
                  <div className="wx-live-weather-temp">{formatTemp(current.temperature_2m, unit)}</div>
                  <div className="wx-live-weather-condition">{condition.label}</div>
                  <div className="wx-live-weather-feels"><Thermometer className="h-3 w-3" /> Feels like {formatTemp(current.apparent_temperature, unit)}</div>
                </div>
                <div className={`wx-live-weather-symbol wx-symbol-${condition.theme}`}>
                  <WeatherSymbol code={current.weather_code} isDay={current.is_day} className="h-12 w-12 sm:h-14 sm:w-14" />
                </div>
              </div>
              <div className="wx-live-weather-metrics">
                <div><Droplets /><span>Humidity</span><strong>{Math.round(current.relative_humidity_2m)}%</strong></div>
                <div><Wind /><span>Wind</span><strong>{formatWind(current.wind_speed_10m, unit)}</strong></div>
                <div><Gauge /><span>Pressure</span><strong>{Math.round(current.surface_pressure)} hPa</strong></div>
                <div><CloudRain /><span>Rainfall</span><strong>{Number(current.precipitation || 0).toFixed(1)} mm</strong></div>
              </div>
            </section>

            <section className="wx-nearby-panel">
              <div className="wx-nearby-heading">
                <div><span>Nearby forecast</span><small>Live conditions around the region</small></div>
                <MapPinned className="h-4 w-4" />
              </div>
              {nearbyLoading && nearbyWeather.length === 0 ? (
                <div className="wx-nearby-loading"><span className="wx-status-dot is-live" /> Loading nearby weather…</div>
              ) : nearbyWeather.length > 0 ? nearbyWeather.map((item) => {
                const local = item.weather.current;
                const nearbyCondition = getWeatherCondition(local.weather_code, local.is_day);
                return (
                  <button type="button" className="wx-nearby-city" key={`${item.location.name}-${item.location.latitude}`} onClick={() => onSelectCoordinates(item.location.latitude, item.location.longitude, item.location.name)} title={`View ${item.location.name} weather`}>
                    <div className="wx-nearby-city-left">
                      <span className="wx-nearby-city-name">{item.location.name}</span>
                      <span className="wx-nearby-city-condition">{nearbyCondition.label}</span>
                    </div>
                    <WeatherSymbol code={local.weather_code} isDay={local.is_day} className="h-5 w-5" />
                    <strong>{formatTemp(local.temperature_2m, unit)}</strong>
                  </button>
                );
              }) : (
                <div className="wx-nearby-empty">Nearby forecasts are temporarily unavailable.</div>
              )}
              <button type="button" onClick={onOpenMap} className="wx-nearby-map-link"><MapPinned className="h-3.5 w-3.5" /> Explore all locations</button>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
};
