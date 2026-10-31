import { WeatherData } from '../types';

export type AtmosphericTheme = 'sunny' | 'night' | 'rainy' | 'snowy' | 'cloudy' | 'overcast' | 'thunder' | 'fog' | 'twilight';

export function getWeatherCondition(code: number, isDay: number = 1): { label: string; icon: string; theme: AtmosphericTheme } {
  switch (code) {
    case 0:
      return isDay 
        ? { label: 'Sunny & Clear', icon: 'Sun', theme: 'sunny' }
        : { label: 'Clear Night', icon: 'Moon', theme: 'night' };
    case 1:
    case 2:
      return isDay 
        ? { label: 'Partly Cloudy', icon: 'CloudSun', theme: 'cloudy' }
        : { label: 'Partly Cloudy', icon: 'CloudMoon', theme: 'night' };
    case 3:
      return { label: 'Overcast Clouds', icon: 'Cloud', theme: 'overcast' };
    case 45:
    case 48:
      return { label: 'Foggy & Misty', icon: 'CloudFog', theme: 'fog' };
    case 51:
      return { label: 'Light Drizzle', icon: 'CloudDrizzle', theme: 'rainy' };
    case 53:
      return { label: 'Moderate Drizzle', icon: 'CloudDrizzle', theme: 'rainy' };
    case 55:
      return { label: 'Dense Drizzle', icon: 'CloudDrizzle', theme: 'rainy' };
    case 56:
      return { label: 'Light Freezing Drizzle', icon: 'CloudDrizzle', theme: 'rainy' };
    case 57:
      return { label: 'Dense Freezing Drizzle', icon: 'CloudDrizzle', theme: 'rainy' };
    case 61:
      return { label: 'Light Rain', icon: 'CloudRain', theme: 'rainy' };
    case 63:
      return { label: 'Moderate Rain', icon: 'CloudRain', theme: 'rainy' };
    case 65:
      return { label: 'Heavy Rain', icon: 'CloudRain', theme: 'rainy' };
    case 66:
      return { label: 'Light Freezing Rain', icon: 'CloudRain', theme: 'rainy' };
    case 67:
      return { label: 'Heavy Freezing Rain', icon: 'CloudRain', theme: 'rainy' };
    case 71:
      return { label: 'Light Snowfall', icon: 'CloudSnow', theme: 'snowy' };
    case 73:
      return { label: 'Moderate Snowfall', icon: 'CloudSnow', theme: 'snowy' };
    case 75:
      return { label: 'Heavy Snowfall', icon: 'CloudSnow', theme: 'snowy' };
    case 77:
      return { label: 'Snow Grains', icon: 'CloudSnow', theme: 'snowy' };
    case 80:
      return { label: 'Light Rain Showers', icon: 'CloudRain', theme: 'rainy' };
    case 81:
      return { label: 'Moderate Rain Showers', icon: 'CloudRain', theme: 'rainy' };
    case 82:
      return { label: 'Intense Rain Showers', icon: 'CloudRain', theme: 'rainy' };
    case 85:
      return { label: 'Light Snow Showers', icon: 'CloudSnow', theme: 'snowy' };
    case 86:
      return { label: 'Heavy Snow Showers', icon: 'CloudSnow', theme: 'snowy' };
    case 95:
      return { label: 'Thunderstorm', icon: 'CloudLightning', theme: 'thunder' };
    case 96:
      return { label: 'Thunderstorm with Hail', icon: 'CloudLightning', theme: 'thunder' };
    case 99:
      return { label: 'Severe Thunderstorm with Hail', icon: 'CloudLightning', theme: 'thunder' };
    default:
      return { label: 'Conditions Unavailable', icon: 'Cloud', theme: 'overcast' };
  }
}

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function formatTemp(c: number | null | undefined, unit: 'C' | 'F'): string {
  if (typeof c !== 'number' || !Number.isFinite(c)) return '—';
  if (unit === 'F') {
    return `${cToF(c)}°F`;
  }
  return `${Math.round(c)}°C`;
}

export function formatWind(speedKmH: number | null | undefined, unit: 'C' | 'F'): string {
  if (typeof speedKmH !== 'number' || !Number.isFinite(speedKmH)) return '—';
  if (unit === 'F') {
    const mph = Math.round(speedKmH * 0.621371);
    return `${mph} mph`;
  }
  return `${Math.round(speedKmH)} km/h`;
}

export function getWindDirectionLabel(degrees: number | null | undefined): string {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return '—';
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5);
  return directions[index % 16];
}

export const SAMPLE_CITIES = [
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'New York', country: 'United States', lat: 40.7128, lon: -74.0060 },
  { name: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
  { name: 'Reykjavik', country: 'Iceland', lat: 64.1466, lon: -21.9426 },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 }
];

export const SAMPLE_WEATHER_DATA: WeatherData = {
  location: {
    name: 'Tokyo',
    country: 'Japan',
    admin1: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo'
  },
  weather: {
    timezone: 'Asia/Tokyo',
    current: {
      time: new Date().toISOString(),
      temperature_2m: 22.4,
      relative_humidity_2m: 58,
      apparent_temperature: 23.1,
      is_day: 1,
      precipitation: 0,
      weather_code: 0,
      wind_speed_10m: 12.5,
      wind_direction_10m: 140,
      surface_pressure: 1016
    },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => {
        const d = new Date();
        d.setHours(d.getHours() + i);
        return d.toISOString();
      }),
      temperature_2m: [21, 20, 19, 18, 17, 17, 18, 20, 22, 24, 25, 26, 26, 25, 24, 23, 22, 21, 20, 19, 19, 18, 18, 18],
      precipitation_probability: [0, 0, 0, 0, 10, 10, 20, 10, 0, 0, 0, 0, 0, 0, 0, 10, 10, 20, 10, 5, 0, 0, 0, 0],
      weather_code: [0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 0, 0, 2, 3, 2, 1, 0, 0, 0, 0, 0],
      is_day: [1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      }),
      weather_code: [0, 1, 2, 61, 0, 3, 1],
      temperature_2m_max: [26, 25, 23, 20, 24, 22, 25],
      temperature_2m_min: [17, 16, 15, 14, 15, 14, 16],
      sunrise: ['05:42', '05:43', '05:44', '05:45', '05:47', '05:48', '05:49'],
      sunset: ['17:51', '17:50', '17:48', '17:47', '17:45', '17:44', '17:42'],
      uv_index_max: [7.2, 6.5, 4.1, 3.0, 6.8, 5.2, 7.0]
    }
  },
  providerInfo: {
    name: 'WeatherAPI.com',
    credit: 'Powered by WeatherAPI.com',
    disclaimer: 'Weather data provided by WeatherAPI.com.'
  },
  source: 'live'
};


/**
 * Weather providers return hourly timestamps in the forecast location's local
 * clock (often without an offset). Compare these wall-clock values as strings
 * instead of parsing them in the viewer's device timezone.
 */
export function normalizeForecastLocalTime(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  const match = value.trim().replace(' ', 'T').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match?.[1] || '';
}

/** First hourly slot at or after the current observation time for that location. */
export function findNextHourlyIndex(times: string[] | undefined, currentTime?: string): number {
  if (!Array.isArray(times) || times.length === 0) return 0;
  const current = normalizeForecastLocalTime(currentTime);
  if (!current) return 0;

  const index = times.findIndex((time) => normalizeForecastLocalTime(time) >= current);
  return index < 0 ? Math.max(0, times.length - 1) : index;
}

/** Find the hourly slot covering the current location-local observation time. */
export function findCurrentHourlyIndex(times: string[] | undefined, currentTime?: string): number {
  if (!Array.isArray(times) || times.length === 0) return 0;
  const current = normalizeForecastLocalTime(currentTime);
  if (!current) return 0;

  const nextIndex = times.findIndex((time) => normalizeForecastLocalTime(time) >= current);
  if (nextIndex < 0) return Math.max(0, times.length - 1);
  const nextTime = normalizeForecastLocalTime(times[nextIndex]);
  return nextIndex > 0 && nextTime > current ? nextIndex - 1 : nextIndex;
}

/**
 * Select the nearest hourly forecast slot for a local-clock offset from current
 * observation. Uses UTC arithmetic only as a timezone-neutral calendar calculator.
 */
export function findHourlyIndexForOffset(
  times: string[] | undefined,
  currentTime: string | undefined,
  offsetHours: number
): number {
  if (!Array.isArray(times) || times.length === 0) return 0;
  const current = normalizeForecastLocalTime(currentTime);
  if (!current || !Number.isFinite(offsetHours)) {
    return findNextHourlyIndex(times, currentTime);
  }
  if (offsetHours <= 0) return findCurrentHourlyIndex(times, currentTime);

  const [datePart, timePart] = current.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const target = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute));
  const targetLocal = [
    target.getUTCFullYear().toString().padStart(4, '0'),
    (target.getUTCMonth() + 1).toString().padStart(2, '0'),
    target.getUTCDate().toString().padStart(2, '0')
  ].join('-') + 'T' + [
    target.getUTCHours().toString().padStart(2, '0'),
    target.getUTCMinutes().toString().padStart(2, '0')
  ].join(':');

  const index = times.findIndex((time) => normalizeForecastLocalTime(time) >= targetLocal);
  return index < 0 ? Math.max(0, times.length - 1) : index;
}

/** Format a provider's location-local timestamp without applying the device timezone twice. */
export function formatForecastLocalHour(value: string, hour12 = true): string {
  const local = normalizeForecastLocalTime(value);
  if (!local) return '—';
  const [datePart, timePart] = local.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: minute === 0 ? undefined : '2-digit',
    hour12,
    timeZone: 'UTC'
  }).format(date);
}

/** Format the calendar day in the forecast location's local clock. */
export function formatForecastLocalDate(value?: string): string {
  if (typeof value !== 'string' || !value.trim()) return 'Forecast date unavailable';
  const raw = value.trim();
  // Daily provider dates are commonly YYYY-MM-DD, while current observations may be full timestamps.
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : normalizeForecastLocalTime(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return 'Forecast date unavailable';
  const date = new Date(datePart + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime())) return 'Forecast date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

/** Sunrise/sunset values may be local-clock strings or full provider timestamps. */
export function formatForecastClock(value?: string): string {
  if (!value) return '—';
  if (/^\d{1,2}:\d{2}(?:\s?[AP]M)?$/i.test(value.trim())) return value.trim();
  const local = normalizeForecastLocalTime(value);
  if (!local) return value;
  const timePart = local.split('T')[1];
  return formatForecastLocalHour('2000-01-01T' + timePart, true);
}


function parseClockMinutes(value?: string | null): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const twelveHour = text.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AP]M)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]) % 12 + (twelveHour[3].toUpperCase() === 'PM' ? 12 : 0);
    return hour * 60 + Number(twelveHour[2]);
  }
  const twentyFourHour = text.match(/^(?:([01]?\d|2[0-3])):([0-5]\d)(?::[0-5]\d)?$/);
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);

  const local = normalizeForecastLocalTime(text);
  if (local) return parseClockMinutes(local.split('T')[1]);
  return null;
}

function formatClockFromInstant(
  instant: Date,
  timezone?: string,
  timezoneOffsetSeconds?: number
): string {
  if (Number.isFinite(timezoneOffsetSeconds)) {
    const shifted = new Date(instant.getTime() + (timezoneOffsetSeconds as number) * 1000);
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC'
    }).format(shifted);
  }
  if (timezone && timezone !== 'auto') {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      }).format(instant);
    } catch {
      // Fall through to the browser's local time only when no usable location zone exists.
    }
  }
  return instant.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Format a real instant in the forecast location's timezone (or known UTC offset). */
export function formatLocationLocalTime(
  instant: Date | string | number = new Date(),
  timezone?: string,
  timezoneOffsetSeconds?: number
): string {
  const parsed = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return formatClockFromInstant(parsed, timezone, timezoneOffsetSeconds);
}

/**
 * Current observations from Open-Meteo and WeatherAPI are often wall-clock
 * timestamps without a UTC designator. Preserve those values as location-local
 * clock time; convert actual UTC/offset timestamps through the location zone.
 */
export function formatProviderObservationTime(
  value?: string | null,
  timezone?: string,
  timezoneOffsetSeconds?: number
): string {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const text = value.trim();
  const hasExplicitOffset = /[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  if (hasExplicitOffset) {
    const instant = new Date(text);
    return Number.isFinite(instant.getTime())
      ? formatClockFromInstant(instant, timezone, timezoneOffsetSeconds)
      : '—';
  }
  return formatForecastLocalHour(text);
}

/** True when the location-local clock is within the threshold of sunrise or sunset. */
export function isWithinLocalSolarWindow(
  sunrise?: string | null,
  sunset?: string | null,
  timezone?: string,
  timezoneOffsetSeconds?: number,
  thresholdMinutes = 45,
  now: Date = new Date()
): boolean {
  const sunriseMinutes = parseClockMinutes(sunrise);
  const sunsetMinutes = parseClockMinutes(sunset);
  if (sunriseMinutes == null && sunsetMinutes == null) return false;

  let currentMinutes: number;
  if (Number.isFinite(timezoneOffsetSeconds)) {
    const shifted = new Date(now.getTime() + (timezoneOffsetSeconds as number) * 1000);
    currentMinutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  } else {
    try {
      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      };
      if (timezone && timezone !== 'auto') options.timeZone = timezone;
      const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(now);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
      currentMinutes = hour * 60 + minute;
    } catch {
      return false;
    }
  }

  const isNear = (solarMinutes: number | null) => {
    if (solarMinutes == null) return false;
    const difference = Math.abs(currentMinutes - solarMinutes);
    return Math.min(difference, 1440 - difference) <= thresholdMinutes;
  };
  return isNear(sunriseMinutes) || isNear(sunsetMinutes);
}


/** Maximum rain probability over the next N forecast slots, starting at the current local hour. */
export function getMaxUpcomingPrecipitationProbability(
  times: string[] | undefined,
  probabilities: number[] | undefined,
  currentTime?: string,
  intervalHours = 1,
  periodHours = 12
): number | null {
  if (
    !Array.isArray(probabilities) ||
    probabilities.length === 0 ||
    !Number.isFinite(intervalHours) || intervalHours <= 0 ||
    !Number.isFinite(periodHours) || periodHours <= 0
  ) return null;
  const startIndex = findCurrentHourlyIndex(times, currentTime);
  const sampleCount = Math.max(1, Math.ceil(periodHours / intervalHours));
  const upcoming = probabilities.slice(startIndex, startIndex + sampleCount)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return upcoming.length ? Math.max(...upcoming) : null;
}
