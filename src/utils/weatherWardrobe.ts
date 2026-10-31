import { CurrentWeather, DailyWeather, HourlyWeather } from '../types';
import { getMaxUpcomingPrecipitationProbability } from './weatherUtils';

export interface WeatherWardrobeAdvice {
  outfit: string;
  items: string[];
  reason: string;
  weatherNotes: string[];
  dataStatus: 'good' | 'limited';
}

/** Create concise outfit guidance using only measured and forecast weather fields. */
export function buildWeatherWardrobeAdvice(input: {
  current: CurrentWeather;
  daily?: DailyWeather;
  hourly?: HourlyWeather;
  unit?: 'C' | 'F';
}): WeatherWardrobeAdvice {
  const { current, daily, hourly } = input;
  const unit = input.unit || 'C';
  const formatDisplayedTemp = (celsius: number) =>
    unit === 'F' ? `${Math.round((celsius * 9) / 5 + 32)}°F` : `${Math.round(celsius)}°C`;
  const feelsLike = typeof current.apparent_temperature === 'number' && Number.isFinite(current.apparent_temperature)
    ? current.apparent_temperature
    : typeof current.temperature_2m === 'number' && Number.isFinite(current.temperature_2m)
      ? current.temperature_2m
      : null;
  const code = typeof current.weather_code === 'number' && Number.isFinite(current.weather_code)
    ? current.weather_code
    : null;
  const wind = typeof current.wind_speed_10m === 'number' && Number.isFinite(current.wind_speed_10m)
    ? current.wind_speed_10m
    : null;
  const uv = typeof daily?.uv_index_max?.[0] === 'number' && Number.isFinite(daily.uv_index_max[0])
    ? daily.uv_index_max[0]
    : null;
  const rainChance = getMaxUpcomingPrecipitationProbability(
    hourly?.time,
    hourly?.precipitation_probability,
    current.time,
    hourly?.intervalHours ?? 1,
    8
  );

  let outfit: string;
  let items: string[];
  let reason: string;
  if (feelsLike == null) {
    outfit = 'Check the latest temperature before choosing layers';
    items = ['Keep a light layer available'];
    reason = 'The current temperature reading is unavailable, so a specific warmth recommendation would be unreliable.';
  } else if (feelsLike <= 10) {
    outfit = 'Warm layers with a proper jacket';
    items = ['Long-sleeve base layer', 'Warm sweater', 'Insulated jacket', 'Closed shoes'];
    reason = `It feels like ${formatDisplayedTemp(feelsLike)}, so extra layers will help keep you comfortable.`;
  } else if (feelsLike <= 17) {
    outfit = 'A light sweater or jacket';
    items = ['Comfortable top', 'Light sweater or jacket', 'Full-length trousers', 'Comfortable shoes'];
    reason = `It feels like ${formatDisplayedTemp(feelsLike)}, making a light outer layer a sensible choice.`;
  } else if (feelsLike <= 24) {
    outfit = 'Comfortable light layers';
    items = ['T-shirt or breathable shirt', 'Light trousers or jeans', 'Comfortable everyday shoes'];
    reason = `It feels like ${formatDisplayedTemp(feelsLike)}, so comfortable light layers should work well.`;
  } else if (feelsLike <= 29) {
    outfit = 'Breathable, lightweight clothing';
    items = ['Loose breathable shirt', 'Lightweight trousers or shorts', 'Breathable footwear'];
    reason = `It feels like ${formatDisplayedTemp(feelsLike)}, so lightweight fabrics can help you stay comfortable.`;
  } else {
    outfit = 'Loose, airy clothing';
    items = ['Loose light-coloured clothing', 'Breathable footwear', 'A cap or wide-brimmed hat'];
    reason = `It feels like ${formatDisplayedTemp(feelsLike)}, so choose airy clothing and limit direct sun exposure.`;
  }

  const weatherNotes: string[] = [];
  const isThunderstorm = code != null && code >= 95 && code <= 99;
  const isRainCondition = code != null && (
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
  );
  if (isThunderstorm) {
    weatherNotes.push('Thunderstorms are indicated; stay indoors and avoid exposed outdoor areas until conditions pass.');
  } else if (isRainCondition || (rainChance != null && rainChance >= 50)) {
    items.push('Compact umbrella or light rain shell');
    if (rainChance != null) {
      weatherNotes.push(`Rain probability reaches ${Math.round(rainChance)}% over the next 8 hours.`);
    } else {
      weatherNotes.push('Rain is indicated by the current weather condition; take rain protection.');
    }
  }
  if (wind != null && wind >= 30) {
    items.push('A light wind-resistant outer layer');
    weatherNotes.push(`Wind is around ${Math.round(wind)} km/h, so a light outer layer may help.`);
  }
  if (uv != null && uv >= 6) {
    items.push('Sunglasses and sun protection');
    weatherNotes.push(`The forecast UV index reaches ${Math.round(uv)}; use shade and suitable sun protection.`);
  }

  if (feelsLike == null) {
    weatherNotes.push('The current temperature is unavailable.');
  }
  if (rainChance != null && rainChance < 50 && !isRainCondition) {
    weatherNotes.push(`Rain probability stays below 50% over the next 8 hours (peak ${Math.round(rainChance)}%).`);
  }

  return {
    outfit,
    items: [...new Set(items)],
    reason,
    weatherNotes,
    dataStatus: feelsLike == null ? 'limited' : 'good'
  };
}
