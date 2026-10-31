import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeatherWardrobeAdvice } from './weatherWardrobe';

function fixture(overrides: Record<string, unknown> = {}) {
  const current = {
    time: '2026-10-31T10:00',
    temperature_2m: 22,
    relative_humidity_2m: 58,
    apparent_temperature: 23,
    is_day: 1,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 12,
    wind_direction_10m: 120,
    surface_pressure: 1013,
    ...overrides
  };
  return {
    current: current as any,
    daily: { uv_index_max: [3] } as any,
    hourly: {
      time: Array.from({ length: 12 }, (_, i) => `2026-10-31T${String(10 + i).padStart(2, '0')}:00`),
      precipitation_probability: [10, 10, 20, 30, 40, 65, 70, 20, 10, 10, 0, 0]
    } as any
  };
}

test('recommends light layers for mild feels-like temperature', () => {
  const advice = buildWeatherWardrobeAdvice(fixture());
  assert.equal(advice.dataStatus, 'good');
  assert.match(advice.outfit, /light layers/i);
  assert.match(advice.reason, /23°C/);
});

test('adds an umbrella when rain is likely in upcoming hours', () => {
  const advice = buildWeatherWardrobeAdvice(fixture());
  assert.ok(advice.items.some(item => /umbrella/i.test(item)));
  assert.ok(advice.weatherNotes.some(note => /70%/.test(note)));
});

test('adds sun protection when UV is high', () => {
  const input = fixture();
  input.daily = { uv_index_max: [8] } as any;
  const advice = buildWeatherWardrobeAdvice(input);
  assert.ok(advice.items.some(item => /sunglasses/i.test(item)));
});

test('does not invent temperature advice when the reading is missing', () => {
  const advice = buildWeatherWardrobeAdvice(fixture({ apparent_temperature: null, temperature_2m: null }));
  assert.equal(advice.dataStatus, 'limited');
  assert.match(advice.reason, /temperature reading is unavailable/i);
  assert.doesNotMatch(advice.reason, /feels like 0°C/i);
});

test('adds a wind-resistant layer only when measured wind is strong', () => {
  const advice = buildWeatherWardrobeAdvice(fixture({ wind_speed_10m: 36 }));
  assert.ok(advice.items.some(item => /wind-resistant/i.test(item)));
});


test('uses the selected Fahrenheit unit when explaining feels-like temperature', () => {
  const input = { ...fixture(), unit: 'F' as const };
  const advice = buildWeatherWardrobeAdvice(input);
  assert.match(advice.reason, /73°F/);
});

test('does not recommend carrying an umbrella into a thunderstorm', () => {
  const advice = buildWeatherWardrobeAdvice(fixture({ weather_code: 95 }));
  assert.ok(!advice.items.some(item => /umbrella/i.test(item)));
  assert.ok(advice.weatherNotes.some(note => /stay indoors/i.test(note)));
});
