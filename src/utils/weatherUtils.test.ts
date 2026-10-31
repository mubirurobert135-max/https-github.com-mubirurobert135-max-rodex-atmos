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
