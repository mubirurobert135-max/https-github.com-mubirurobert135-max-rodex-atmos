/**
 * RODEX Atmos Weather Grounding and Response Utilities
 * Provides deterministic observation generation and conversational bounding.
 */

export interface WeatherObservationInput {
  location?: {
    name?: string;
    country?: string;
  };
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    is_day?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
}

export function isDirectCurrentWeatherQuery(query: string, currentCityName?: string): boolean {
  if (!query) return false;
  let clean = query.trim().toLowerCase();

  // If query asks for advice, comparisons, future forecast, or explanations, it's not a direct simple observation query
  if (/\b(wear|clothes|dress|jacket|umbrella|should i|compare|versus|vs|tomorrow|later|tonight|next week|explain|why|how come)\b/i.test(clean)) {
    return false;
  }

  if (currentCityName) {
    clean = clean.replace(new RegExp(`\\b(?:in|for|at)\\s+${currentCityName.toLowerCase()}\\b`, 'gi'), '').trim();
  }

  const directPatterns = [
    /^(?:what(?:'s| is) the weather(?: like)?(?: (?:right )?now| currently| today| outside)?\??)$/i,
    /^(?:what(?:'s| is) (?:the )?(?:current )?temp(?:erature)?(?: (?:right )?now| currently| today| outside)?\??)$/i,
    /^(?:is it raining(?: (?:right )?now| currently| today| outside)?\??)$/i,
    /^(?:is it sunny(?: (?:right )?now| currently| today| outside)?\??)$/i,
    /^(?:how(?:'s| is) the weather(?: (?:right )?now| currently| today| outside)?\??)$/i,
    /^(?:what are (?:the )?current conditions\??)$/i,
    /^(?:how hot is it|how cold is it|how warm is it)(?: (?:right )?now| outside)?\??$/i
  ];

  return directPatterns.some((pattern) => pattern.test(clean));
}

export function getWeatherConditionDescription(code?: number, isDay: number = 1): string {
  switch (code) {
    case 0:
      return isDay ? 'sunny and clear' : 'clear';
    case 1:
    case 2:
      return isDay ? 'partly cloudy' : 'partly cloudy';
    case 3:
      return 'overcast';
    case 45:
    case 48:
      return 'foggy and misty';
    case 51:
    case 53:
    case 55:
      return 'light drizzle';
    case 61:
    case 63:
    case 65:
      return 'rain showers';
    case 71:
    case 73:
    case 75:
      return 'snowfall';
    case 80:
    case 81:
    case 82:
      return 'heavy rain';
    case 95:
    case 96:
    case 99:
      return 'thunderstorms';
    default:
      return 'fair';
  }
}

export function buildGroundedWeatherReply(
  weather: WeatherObservationInput,
  userQuery?: string
): string {
  const locName = weather.location?.name || 'your area';
  const current = weather.current || {};
  const temp = current.temperature_2m != null ? Math.round(current.temperature_2m) : 22;
  const feelsLike = current.apparent_temperature != null ? Math.round(current.apparent_temperature) : temp;
  const humidity = current.relative_humidity_2m != null ? Math.round(current.relative_humidity_2m) : 60;
  const wind = current.wind_speed_10m != null ? Math.round(current.wind_speed_10m) : 8;
  const precip = current.precipitation ?? 0;
  const code = current.weather_code ?? 0;
  const isDay = current.is_day ?? 1;
  const condition = getWeatherConditionDescription(code, isDay);

  const isRainQuery = userQuery && /\b(rain|raining|rainy)\b/i.test(userQuery);
  const isActivelyRaining = precip > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95;

  if (isRainQuery) {
    if (isActivelyRaining) {
      return `In ${locName}, it is currently raining at ${temp}°C with ${humidity}% humidity.`;
    } else {
      return `In ${locName}, No rain is falling right now. Conditions are ${condition} at ${temp}°C with ${humidity}% humidity.`;
    }
  }

  const feelsLikePart = Math.abs(feelsLike - temp) >= 2 ? ` (feels like ${feelsLike}°C)` : '';
  const rainPart = isActivelyRaining ? ' with rain falling' : '';

  return `In ${locName}, it's currently ${temp}°C${feelsLikePart} and ${condition}${rainPart}. Humidity is ${humidity}%, with gentle winds at ${wind} km/h.`;
}

export function boundConversationHistory<T>(messages: T[], maxTurns: number = 6): T[] {
  if (!Array.isArray(messages) || messages.length <= maxTurns) {
    return messages || [];
  }
  return messages.slice(messages.length - maxTurns);
}
