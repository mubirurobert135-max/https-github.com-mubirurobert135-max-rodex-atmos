/**
 * RODEX Atmos weather grounding and response utilities.
 * Keep direct weather answers deterministic and never invent missing measurements.
 */

export interface WeatherObservationInput {
  location?: {
    name?: string;
    country?: string;
  };
  current?: {
    temperature_2m?: number | null;
    apparent_temperature?: number | null;
    relative_humidity_2m?: number | null;
    weather_code?: number | null;
    is_day?: number | null;
    wind_speed_10m?: number | null;
    precipitation?: number | null;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isDirectCurrentWeatherQuery(query: string, currentCityName?: string): boolean {
  if (!query) return false;
  let clean = query.trim().toLowerCase();

  // Advice, comparisons and future forecasts need the full assistant flow.
  if (/\b(wear|clothes|dress|jacket|umbrella|should i|compare|versus|vs|tomorrow|later|tonight|next week|explain|why|how come|forecast)\b/i.test(clean)) {
    return false;
  }

  if (currentCityName) {
    const safeCityName = escapeRegExp(currentCityName.toLowerCase());
    clean = clean.replace(new RegExp(`\\b(?:in|for|at)\\s+${safeCityName}\\b`, 'gi'), '');
    clean = clean.replace(/\\s+([?!.,])/g, '$1').trim();
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

export function getWeatherConditionDescription(code?: number | null, isDay: number = 1): string {
  switch (code) {
    case 0:
      return isDay ? 'sunny and clear' : 'clear';
    case 1:
      return 'mainly clear';
    case 2:
      return 'partly cloudy';
    case 3:
      return 'overcast';
    case 45:
      return 'foggy';
    case 48:
      return 'foggy with depositing rime';
    case 51:
      return 'light drizzle';
    case 53:
      return 'moderate drizzle';
    case 55:
      return 'dense drizzle';
    case 56:
      return 'light freezing drizzle';
    case 57:
      return 'dense freezing drizzle';
    case 61:
      return 'light rain';
    case 63:
      return 'moderate rain';
    case 65:
      return 'heavy rain';
    case 66:
      return 'light freezing rain';
    case 67:
      return 'heavy freezing rain';
    case 71:
      return 'light snowfall';
    case 73:
      return 'moderate snowfall';
    case 75:
      return 'heavy snowfall';
    case 77:
      return 'snow grains';
    case 80:
      return 'light rain showers';
    case 81:
      return 'moderate rain showers';
    case 82:
      return 'intense rain showers';
    case 85:
      return 'light snow showers';
    case 86:
      return 'heavy snow showers';
    case 95:
      return 'thunderstorms';
    case 96:
      return 'thunderstorms with hail';
    case 99:
      return 'severe thunderstorms with hail';
    default:
      return 'conditions unavailable';
  }
}

function isRainCode(code: number | null | undefined): boolean {
  return isFiniteNumber(code) &&
    ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99));
}

export function buildGroundedWeatherReply(
  weather: WeatherObservationInput,
  userQuery?: string
): string {
  const loc = weather.location;
  const locName = [loc?.name, loc?.country].filter(Boolean).join(', ') || 'your area';
  const current = weather.current || {};
  const tempKnown = isFiniteNumber(current.temperature_2m);
  const feelsLikeKnown = isFiniteNumber(current.apparent_temperature);
  const humidityKnown = isFiniteNumber(current.relative_humidity_2m);
  const windKnown = isFiniteNumber(current.wind_speed_10m);
  const precipKnown = isFiniteNumber(current.precipitation);
  const codeKnown = isFiniteNumber(current.weather_code) && current.weather_code >= 0;
  const temp = tempKnown ? Math.round(current.temperature_2m as number) : null;
  const feelsLike = feelsLikeKnown ? Math.round(current.apparent_temperature as number) : null;
  const humidity = humidityKnown ? Math.round(current.relative_humidity_2m as number) : null;
  const wind = windKnown ? Math.round(current.wind_speed_10m as number) : null;
  const condition = codeKnown
    ? getWeatherConditionDescription(current.weather_code, isFiniteNumber(current.is_day) ? current.is_day : 1)
    : null;

  const isRainQuery = Boolean(userQuery && /\b(rain|raining|rainy|precipitation)\b/i.test(userQuery));
  if (isRainQuery) {
    if (!precipKnown && !codeKnown) {
      return `I can’t verify current rainfall in ${locName} because the latest precipitation data is unavailable.`;
    }

    const raining = (precipKnown && (current.precipitation as number) > 0) || isRainCode(current.weather_code);
    if (raining) {
      const tempPart = tempKnown ? ` at about ${temp}°C` : '';
      const evidence = precipKnown && (current.precipitation as number) > 0
        ? 'The latest data reports measurable precipitation'
        : 'The reported weather condition indicates rain or a thunderstorm';
      return `${evidence} in ${locName}${tempPart}. Forecast rain probability is different from a direct observation.`;
    }

    if (precipKnown && (current.precipitation as number) === 0) {
      const conditionPart = condition && condition !== 'conditions unavailable' ? ` Conditions are ${condition}.` : '';
      return `The latest reading reports no measurable precipitation in ${locName} right now.${conditionPart}`;
    }

    if (condition && condition !== 'conditions unavailable') {
      return `The current weather data for ${locName} reports ${condition}, but it does not provide a measurable precipitation reading.`;
    }
    return `I can’t confirm whether rain is falling in ${locName} from the available data.`;
  }

  if (!tempKnown && (!condition || condition === 'conditions unavailable') && !humidityKnown && !windKnown) {
    return `I can’t provide a reliable current-weather reading for ${locName} because the latest measurements are incomplete. Please refresh the forecast and try again.`;
  }

  const facts: string[] = [];
  if (tempKnown) facts.push(`about ${temp}°C`);
  if (condition && condition !== 'conditions unavailable') facts.push(condition);
  if (tempKnown && feelsLikeKnown && Math.abs((feelsLike as number) - (temp as number)) >= 2) {
    facts.push(`feels like ${feelsLike}°C`);
  }

  let reply = `In ${locName}, current conditions are ${facts.length ? facts.join(', ') : 'partly unavailable'}.`;
  const details: string[] = [];
  if (humidityKnown) details.push(`${humidity}% humidity`);
  if (windKnown) details.push(`wind at ${wind} km/h`);
  if (details.length) reply += ` ${details.join(' with ')}.`;
  if (!tempKnown) reply += ' The current temperature is not available in the latest data.';
  if (!condition || condition === 'conditions unavailable') reply += ' The exact weather condition is not available in the latest data.';
  return reply;
}

export function boundConversationHistory<T>(messages: T[], maxTurns: number = 6): T[] {
  if (!Array.isArray(messages) || messages.length <= maxTurns) {
    return messages || [];
  }
  return messages.slice(messages.length - maxTurns);
}
