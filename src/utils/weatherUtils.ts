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
      return { label: 'Clear Skies', icon: 'Sun', theme: 'sunny' };
  }
}

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function formatTemp(c: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${cToF(c)}°F`;
  }
  return `${Math.round(c)}°C`;
}

export function formatWind(speedKmH: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    const mph = Math.round(speedKmH * 0.621371);
    return `${mph} mph`;
  }
  return `${Math.round(speedKmH)} km/h`;
}

export function getWindDirectionLabel(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((degrees % 360) / 22.5);
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
