export type LocationMode = 'gps' | 'network' | 'search' | 'fallback';

export interface WeatherLocation {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isApproximateNetwork?: boolean;
  detectedIP?: string;
}

export interface CurrentWeather {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  surface_pressure: number;
}

export interface HourlyWeather {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  weather_code: number[];
  is_day: number[];
}

export interface DailyWeather {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
}

export interface ProviderInfo {
  name: string;
  credit: string;
  disclaimer: string;
}

export interface WeatherData {
  location: WeatherLocation;
  weather: {
    current: CurrentWeather;
    hourly: HourlyWeather;
    daily: DailyWeather;
    timezone: string;
  };
  providerInfo: ProviderInfo;
  source: 'live' | 'setup_required';
}

export interface AIInsights {
  summary: string;
  clothing: string;
  activities: string;
  health: string;
}
