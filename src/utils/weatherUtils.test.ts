import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeatherCondition } from './weatherUtils';

test('rain and drizzle codes report their actual intensity', () => {
  const expected = new Map<number, string>([
    [51, 'Light Drizzle'],
    [53, 'Moderate Drizzle'],
    [55, 'Dense Drizzle'],
    [56, 'Light Freezing Drizzle'],
    [57, 'Dense Freezing Drizzle'],
    [61, 'Light Rain'],
    [63, 'Moderate Rain'],
    [65, 'Heavy Rain'],
    [66, 'Light Freezing Rain'],
    [67, 'Heavy Freezing Rain'],
    [80, 'Light Rain Showers'],
    [81, 'Moderate Rain Showers'],
    [82, 'Intense Rain Showers']
  ]);

  for (const [code, label] of expected) {
    assert.equal(getWeatherCondition(code).label, label, `weather code ${code}`);
  }
});

test('snow and thunderstorm codes are not mislabeled as heavy rain', () => {
  assert.equal(getWeatherCondition(71).label, 'Light Snowfall');
  assert.equal(getWeatherCondition(73).label, 'Moderate Snowfall');
  assert.equal(getWeatherCondition(75).label, 'Heavy Snowfall');
  assert.equal(getWeatherCondition(77).label, 'Snow Grains');
  assert.equal(getWeatherCondition(85).label, 'Light Snow Showers');
  assert.equal(getWeatherCondition(86).label, 'Heavy Snow Showers');
  assert.equal(getWeatherCondition(95).label, 'Thunderstorm');
  assert.equal(getWeatherCondition(96).label, 'Thunderstorm with Hail');
  assert.equal(getWeatherCondition(99).label, 'Severe Thunderstorm with Hail');
});

test('night-time clear and partly cloudy conditions use night themes', () => {
  assert.equal(getWeatherCondition(0, 0).theme, 'night');
  assert.equal(getWeatherCondition(1, 0).theme, 'night');
  assert.equal(getWeatherCondition(2, 0).theme, 'night');
});

test('unknown weather codes are not presented as clear skies', () => {
  const condition = getWeatherCondition(999);
  assert.equal(condition.label, 'Conditions Unavailable');
  assert.equal(condition.theme, 'overcast');
});


import {
  formatLocationLocalTime,
  formatProviderObservationTime,
  isWithinLocalSolarWindow
} from './weatherUtils';

test('formats location-local current time instead of the viewer device time', () => {
  const instant = new Date('2026-10-31T05:30:00.000Z');
  assert.equal(formatLocationLocalTime(instant, 'Asia/Kolkata'), '11:00 AM');
  assert.equal(formatLocationLocalTime(instant, 'Africa/Kampala'), '8:30 AM');
});

test('keeps provider wall-clock observation times in the forecast location', () => {
  assert.equal(formatProviderObservationTime('2026-10-31 14:25', 'Asia/Tokyo'), '2:25 PM');
  assert.equal(formatProviderObservationTime('2026-10-31T14:25', 'Asia/Tokyo'), '2:25 PM');
});

test('converts UTC observations into the location timezone', () => {
  assert.equal(formatProviderObservationTime('2026-10-31T05:30:00Z', 'Asia/Kolkata'), '11:00 AM');
  assert.equal(formatProviderObservationTime('2026-10-31T05:30:00Z', 'UTC', 19800), '11:00 AM');
});

test('evaluates sunrise and sunset windows using the forecast location clock', () => {
  const now = new Date('2026-06-01T03:30:00.000Z'); // 06:30 in Kampala
  assert.equal(isWithinLocalSolarWindow('06:00', '18:30', 'Africa/Kampala', undefined, 45, now), true);
  assert.equal(isWithinLocalSolarWindow('06:00', '18:30', 'America/Los_Angeles', undefined, 45, now), false);
  assert.equal(isWithinLocalSolarWindow('Unavailable', 'Unavailable', 'Africa/Kampala', undefined, 45, now), false);
});


import { getMaxUpcomingPrecipitationProbability } from './weatherUtils';

test('rain probability window begins at the current forecast hour, not midnight', () => {
  const times = Array.from({ length: 24 }, (_, hour) => `2026-10-31T${String(hour).padStart(2, '0')}:00`);
  const probabilities = Array.from({ length: 24 }, (_, hour) => hour < 12 ? 95 : hour === 18 ? 78 : 10);
  assert.equal(getMaxUpcomingPrecipitationProbability(times, probabilities, '2026-10-31T13:25', 1, 12), 78);
});

test('returns unavailable when no finite upcoming rain probabilities exist', () => {
  assert.equal(getMaxUpcomingPrecipitationProbability([], [], undefined, 1, 12), null);
  assert.equal(getMaxUpcomingPrecipitationProbability(['2026-10-31T13:00'], [Number.NaN], '2026-10-31T13:00', 1, 12), null);
});


import { formatForecastLocalDate } from './weatherUtils';

test('formats daily forecast date-only values without requiring an hourly timestamp', () => {
  assert.notEqual(formatForecastLocalDate('2026-10-31'), 'Forecast date unavailable');
  assert.notEqual(formatForecastLocalDate('2026-10-31T13:00'), 'Forecast date unavailable');
  assert.equal(formatForecastLocalDate('not-a-date'), 'Forecast date unavailable');
});


test('converts a requested 12-hour rain window to four samples for a 3-hour provider', () => {
  const times = Array.from({ length: 12 }, (_, i) => {
    const hour = i * 3;
    return `2026-10-31T${String(hour).padStart(2, '0')}:00`;
  });
  const probabilities = [10, 20, 85, 30, 95, 10, 10, 10, 10, 10, 10, 10];
  assert.equal(getMaxUpcomingPrecipitationProbability(times, probabilities, '2026-10-31T03:30', 3, 12), 95);
});

test('converts an eight-hour wardrobe window to three samples for a 3-hour provider', () => {
  const times = Array.from({ length: 12 }, (_, i) => {
    const hour = i * 3;
    return `2026-10-31T${String(hour).padStart(2, '0')}:00`;
  });
  const probabilities = [5, 10, 25, 95, 20, 10, 0, 0, 0, 0, 0, 0];
  assert.equal(getMaxUpcomingPrecipitationProbability(times, probabilities, '2026-10-31T00:20', 3, 8), 25);
});
