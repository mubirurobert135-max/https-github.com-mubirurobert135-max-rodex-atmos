import React from 'react';
import {
  Bell, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain,
  CloudSnow, CloudSun, Clock3, Compass, Droplets, MapPin, MapPinned,
  Mic, Moon, Navigation, ShieldCheck, Sparkles, Sun, Sunrise, Sunset,
  Thermometer, UserRound, Wind, ChevronRight
} from 'lucide-react';
import { WeatherData, LocationMode } from '../types';
import { formatTemp, formatWind, getWeatherCondition, findNextHourlyIndex, findCurrentHourlyIndex, formatForecastLocalHour, formatForecastClock, normalizeForecastLocalTime } from '../utils/weatherUtils';

interface WeatherReferenceDashboardProps {
// Track the pointer inside a navigation control so its highlight follows the cursor.
const updateNavPointer = (event: React.PointerEvent<HTMLElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', (event.clientX - bounds.left) + 'px');
  event.currentTarget.style.setProperty('--pointer-y', (event.clientY - bounds.top) + 'px');
};

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

function formatDay(value: string, index: number): string {
  if (index === 0) return 'Today';
  const date = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(date);
}

function formatLocalDateLabel(value: string): string {
  const local = normalizeForecastLocalTime(value);
  const datePart = local ? local.slice(0, 10) : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'Local forecast';
  const date = new Date(datePart + 'T12:00:00Z');
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(date);
}


function getUvLabel(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  if (value < 3) return 'Low';
  if (value < 6) return 'Moderate';
  if (value < 8) return 'High';
  if (value < 11) return 'Very high';
  return 'Extreme';
}

export const WeatherReferenceDashboard: React.FC<WeatherReferenceDashboardProps> = ({
  data, unit, locationMode, isLoading, onGetCurrentLocation, onOpenAssistant, onOpenMap,
  onOpenAccount, onOpenPrivacy, onOpenAlerts
}) => {
  const { location, weather } = data;
  const current = weather.current;
  const daily = weather.daily;
  const hourly = weather.hourly;
  const condition = getWeatherCondition(current.weather_code, current.is_day);
  const timezone = weather.timezone || location.timezone || 'UTC';
  const todayHigh = daily.temperature_2m_max?.[0] ?? current.temperature_2m;
  const todayLow = daily.temperature_2m_min?.[0] ?? current.temperature_2m;
  const todaySunrise = daily.sunrise?.[0];
  const todaySunset = daily.sunset?.[0];
  const todayUv = daily.uv_index_max?.[0];
  const firstCurrentHourIndex = findCurrentHourlyIndex(hourly.time, current.time);
  const currentLocalTime = normalizeForecastLocalTime(current.time);
  const nextFutureIndex = (hourly.time || []).findIndex((time) =>
    normalizeForecastLocalTime(time) > currentLocalTime
  );
  const futureStartIndex = nextFutureIndex >= 0 ? nextFutureIndex : firstCurrentHourIndex;
  const nextHours = [
    {
      time: current.time,
      temperature: current.temperature_2m,
      probability: hourly.precipitation_probability?.[firstCurrentHourIndex] ?? 0,
      code: current.weather_code,
      isDay: current.is_day
    },
    ...(hourly.time || []).slice(futureStartIndex, futureStartIndex + 5).map((time, offset) => {
      const index = futureStartIndex + offset;
      return {
        time,
        temperature: hourly.temperature_2m?.[index] ?? current.temperature_2m,
        probability: hourly.precipitation_probability?.[index] ?? 0,
        code: hourly.weather_code?.[index] ?? current.weather_code,
        isDay: hourly.is_day?.[index] ?? current.is_day
      };
    })
  ];

  const nextDays = (daily.time || []).slice(0, 7).map((day, index) => ({
    day,
    index,
    code: daily.weather_code?.[index] ?? current.weather_code,
    high: daily.temperature_2m_max?.[index] ?? current.temperature_2m,
    low: daily.temperature_2m_min?.[index] ?? current.temperature_2m
  }));

  const statusLabel = locationMode === 'gps' ? 'GPS location'
    : locationMode === 'network' ? 'Approximate location'
    : locationMode === 'search' ? 'Selected location' : 'Default location';

  const dateLabel = formatLocalDateLabel(current.time);
  const localTime = formatForecastLocalHour(current.time);
  const rainChance = Math.max(0, ...nextHours.map((item) => item.probability));

  return (
    <section className="wx-reference-shell" aria-label="RODEX Atmos weather dashboard">
      <aside className="wx-reference-rail" aria-label="RODEX Atmos navigation">
        <div className="wx-brand-lockup">
          <div className="wx-reference-mark" aria-hidden="true">R</div>
          <div className="wx-brand-copy">
            <strong>RODEX <span>Atmos</span></strong>
            <small>Understand your day</small>
          </div>
        </div>

        <div className="wx-reference-rail-divider" />
        <div className="wx-rail-navigation">
          <button className="wx-reference-rail-button is-active rodex-pointer-spotlight" onPointerMove={updateNavPointer} type="button" aria-label="Weather dashboard" title="Weather dashboard">
            <Compass className="h-4 w-4" /><span>Dashboard</span>
          </button>
          <button className="wx-reference-rail-button rodex-pointer-spotlight" onPointerMove={updateNavPointer} type="button" onClick={onOpenMap} aria-label="Open interactive weather map" title="Interactive weather map">
            <MapPin className="h-4 w-4" /><span>Map</span>
          </button>
          <button className="wx-reference-rail-button" type="button" onClick={onOpenAlerts} aria-label="Weather alerts" title="Weather alerts">
            <Bell className="h-4 w-4" /><span>Alerts</span>
            {data.alerts?.length ? <span className="wx-rail-alert-count">{data.alerts.length}</span> : null}
          </button>
          <button className="wx-reference-rail-button" type="button" onClick={onGetCurrentLocation} disabled={isLoading} aria-label="Refresh current device location" title="My location">
            <Navigation className={'h-4 w-4 ' + (isLoading ? 'animate-pulse' : '')} /><span>My location</span>
          </button>
        </div>

        <div className="wx-rail-bottom">
          <button type="button" className="wx-rail-assistant-card" onClick={() => onOpenAssistant()}>
            <span className="wx-rail-assistant-orb"><Mic className="h-5 w-5" /></span>
            <strong>Hey Atmos</strong>
            <small>I'm listening...</small>
            <span className="wx-assistant-wave" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
            </span>
          </button>
          <button className="wx-reference-rail-button" type="button" onClick={onOpenAccount} aria-label="Open account and sign-in" title="Account">
            <UserRound className="h-4 w-4" /><span>Account</span>
          </button>
          <button className="wx-reference-rail-button is-ai rodex-pointer-spotlight" type="button" onClick={() => onOpenAssistant()} onPointerMove={updateNavPointer} aria-label="Open RODEX AI voice and chat assistant" title="RODEX AI">
            <Sparkles className="h-4 w-4" /><span>RODEX AI</span>
          </button>
          <button className="wx-reference-rail-button" type="button" onClick={onOpenPrivacy} aria-label="Open privacy portal" title="Privacy and account controls">
            <ShieldCheck className="h-4 w-4" /><span>Privacy</span>
          </button>
          <div className="wx-reference-rail-status" title={statusLabel}>
            <span className={'wx-status-dot ' + (locationMode === 'gps' ? 'is-live' : '')} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </aside>

      <div className="wx-reference-content">
        <header className="wx-reference-heading">
          <div className="wx-reference-title-group">
            <div className="wx-welcome-line">Welcome back to <strong>RODEX Atmos</strong></div>
            <div className="wx-reference-kicker">{dateLabel} <span>·</span> Live weather update</div>
          </div>
          <div className="wx-reference-heading-right">
            <div className="wx-live-status">
              <span className="wx-live-pulse" />
              <span>{location.name}{location.country ? ', ' + location.country : ''}</span>
              <span className="wx-live-divider" />
              <span>{localTime} local</span>
            </div>
            <button type="button" className="wx-reference-quick-location" onClick={onGetCurrentLocation} disabled={isLoading} aria-label="Refresh current device location" title="Use my current location">
              <Navigation className={'h-3.5 w-3.5 ' + (isLoading ? 'animate-pulse' : '')} />
              <span>My location</span>
            </button>
          </div>
        </header>

        <section className="wx-dashboard-hero" aria-label="Current weather">
          <div className="wx-hero-copy">
            <div className="wx-hero-eyebrow"><span /> CURRENT WEATHER</div>
            <div className="wx-hero-location"><MapPin className="h-4 w-4" /> {location.name}{location.country ? ', ' + location.country : ''}</div>
            <h1 className="wx-reference-title wx-storm-title">{formatTemp(current.temperature_2m, unit)}</h1>
            <div className="wx-hero-condition">{condition.label}</div>
            <div className="wx-hero-feels"><Thermometer className="h-3.5 w-3.5" /> Feels like {formatTemp(current.apparent_temperature, unit)}</div>
            <div className="wx-hero-range">
              <span><Sun className="h-3.5 w-3.5" /> High {formatTemp(todayHigh, unit)}</span>
              <span><Moon className="h-3.5 w-3.5" /> Low {formatTemp(todayLow, unit)}</span>
            </div>
          </div>

          <div className="wx-hero-weather-art" aria-hidden="true">
            <span className="wx-hero-weather-glow" />
            <WeatherSymbol code={current.weather_code} isDay={current.is_day} className="wx-hero-weather-icon" />
            <span className="wx-hero-weather-caption">{condition.label}</span>
          </div>

          <div className="wx-hero-metrics">
            <div className="wx-hero-metric">
              <span className="wx-hero-metric-icon"><Droplets /></span>
              <span className="wx-hero-metric-copy"><small>Humidity</small><strong>{Math.round(current.relative_humidity_2m)}%</strong></span>
            </div>
            <div className="wx-hero-metric">
              <span className="wx-hero-metric-icon"><Wind /></span>
              <span className="wx-hero-metric-copy"><small>Wind speed</small><strong>{formatWind(current.wind_speed_10m, unit)}</strong></span>
            </div>
            <div className="wx-hero-metric">
              <span className="wx-hero-metric-icon"><Sunrise /></span>
              <span className="wx-hero-metric-copy"><small>Sunrise</small><strong>{formatForecastClock(todaySunrise)}</strong></span>
            </div>
            <div className="wx-hero-metric">
              <span className="wx-hero-metric-icon"><Sunset /></span>
              <span className="wx-hero-metric-copy"><small>Sunset</small><strong>{formatForecastClock(todaySunset)}</strong></span>
            </div>
          </div>
        </section>

        <div className="wx-dashboard-forecast-grid">
          <section className="wx-dashboard-panel wx-dashboard-hourly" aria-label="Hourly weather forecast">
            <div className="wx-dashboard-panel-heading">
              <div>
                <h2>Hourly forecast</h2>
                <p>Conditions over the next 6 hours</p>
              </div>
              <span className="wx-panel-link"><Clock3 className="h-4 w-4" /> Live</span>
            </div>
            <div className="wx-dashboard-hourly-list">
              {nextHours.map((item, index) => (
                <div className={'wx-dashboard-hour ' + (index === 0 ? 'is-current' : '')} key={item.time}>
                  <span className="wx-dashboard-hour-time">{index === 0 ? 'Now' : formatForecastLocalHour(item.time)}</span>
                  <WeatherSymbol code={item.code} isDay={item.isDay} className="wx-dashboard-hour-icon" />
                  <strong>{formatTemp(item.temperature, unit)}</strong>
                  <small>{Math.round(item.probability)}% rain</small>
                </div>
              ))}
            </div>
            <div className="wx-dashboard-hourly-foot">
              <span>Peak rain chance</span><strong>{Math.round(rainChance)}%</strong>
            </div>
          </section>

          <section className="wx-dashboard-panel wx-dashboard-daily" aria-label="Seven day weather forecast">
            <div className="wx-dashboard-panel-heading">
              <div>
                <h2>Daily forecast</h2>
                <p>Next 7 days</p>
              </div>
              <span className="wx-panel-link">7 days <ChevronRight className="h-4 w-4" /></span>
            </div>
            <div className="wx-dashboard-daily-list">
              {nextDays.map((day) => (
                <div className={'wx-dashboard-day ' + (day.index === 0 ? 'is-today' : '')} key={day.day}>
                  <span className="wx-dashboard-day-name">{formatDay(day.day, day.index)}</span>
                  <WeatherSymbol code={day.code} isDay={1} className="wx-dashboard-day-icon" />
                  <span className="wx-dashboard-day-condition">{getWeatherCondition(day.code, 1).label}</span>
                  <strong>{formatTemp(day.high, unit)}</strong>
                  <small>{formatTemp(day.low, unit)}</small>
                </div>
              ))}
            </div>
            <div className="wx-dashboard-daily-foot">
              <span>UV index</span>
              <strong>{typeof todayUv === 'number' && Number.isFinite(todayUv) ? todayUv.toFixed(0) + ' · ' + getUvLabel(todayUv) : 'Unavailable'}</strong>
            </div>
          </section>
        </div>

        <section className="wx-nearby-panel wx-regional-panel wx-map-discovery" aria-label="Explore more weather locations">
          <div className="wx-nearby-heading">
            <div>
              <span>Explore weather nearby</span>
              <small>Search places and inspect live conditions on the map</small>
            </div>
            <MapPinned className="h-4 w-4" />
          </div>
          <p className="wx-map-discovery-copy">Open the interactive map to explore local areas, compare weather layers and select another location.</p>
          <button type="button" onClick={onOpenMap} className="wx-nearby-map-link">
            <MapPinned className="h-3.5 w-3.5" /> Explore weather map
          </button>
        </section>
      </div>
    </section>
  );
};
