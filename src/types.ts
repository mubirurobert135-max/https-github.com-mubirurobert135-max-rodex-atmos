export type LocationMode = 'gps' | 'network' | 'search' | 'fallback';

export interface WeatherLocation {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneOffsetSeconds?: number;
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
  /** Hours between provider forecast samples (e.g. 1 for hourly or 3 for OpenWeather's 3-hour feed). */
  intervalHours?: number;
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  weather_code: number[];
  is_day: number[];
  /** Hours between consecutive forecast samples (1 for hourly feeds, 3 for OpenWeather's standard feed). */
  intervalHours?: number;
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

export type AlertType = 'official' | 'forecast';
export type AlertSeverity = 'extreme' | 'severe' | 'moderate' | 'minor' | 'info';

export interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  type: AlertType;
  locationName: string;
  issuingAuthority?: string;
  effective?: string;
  expires?: string;
  officialUrl?: string;
  category?: string;
  instruction?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  dailyBriefing: boolean;
  dailyBriefingTime: string; // e.g. "07:00"
  alertCategories: {
    severeWeather: boolean;
    rainThunderstorms: boolean;
    strongWinds: boolean;
    extremeTemps: boolean;
    uvWarning: boolean;
  };
  browserPush: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // e.g. "22:00"
  quietHoursEnd: string; // e.g. "07:00"
}

export interface DailyBriefing {
  greeting: string;
  locationName: string;
  summary: string;
  highTemp: number | null;
  lowTemp: number | null;
  rainLikelihood: string;
  windCondition: string;
  headlineAlert?: string;
  recommendations: string[];
  generatedAt: string;
}

export interface WeatherData {
  location: WeatherLocation;
  weather: {
    current: CurrentWeather;
    hourly: HourlyWeather;
    daily: DailyWeather;
    timezone: string;
  };
  alerts?: WeatherAlert[];
  briefing?: DailyBriefing;
  providerInfo: ProviderInfo;
  source: 'live' | 'setup_required';
}

export interface AIInsights {
  summary: string;
  clothing: string;
  activities: string;
  health: string;
}

