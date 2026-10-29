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
