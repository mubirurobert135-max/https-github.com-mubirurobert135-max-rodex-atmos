import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroundedWeatherReply,
  isDirectCurrentWeatherQuery,
  getWeatherConditionDescription,
  boundConversationHistory
} from './weatherGrounding';

test('isDirectCurrentWeatherQuery detects simple current condition queries', () => {
  assert.equal(isDirectCurrentWeatherQuery("What's the weather like right now?"), true);
  assert.equal(isDirectCurrentWeatherQuery('What is the temperature?'), true);
  assert.equal(isDirectCurrentWeatherQuery('Is it raining right now?'), true);
  assert.equal(isDirectCurrentWeatherQuery("How's the weather outside?"), true);
  assert.equal(isDirectCurrentWeatherQuery('What are current conditions?'), true);

  assert.equal(isDirectCurrentWeatherQuery('What should I wear tomorrow?'), false);
  assert.equal(isDirectCurrentWeatherQuery('Compare Kampala and Entebbe'), false);
  assert.equal(isDirectCurrentWeatherQuery('Why is the wind blowing so fast?'), false);
  assert.equal(isDirectCurrentWeatherQuery('Will it rain in 4 hours?'), false);
});

test('city names containing regular-expression characters do not break direct-query detection', () => {
  assert.equal(isDirectCurrentWeatherQuery("What's the weather right now in St. John's?", "St. John's"), true);
});

test('direct weather answers distinguish no rain from a rain condition', () => {
  const dryWeather = {
    location: { name: 'Kampala', country: 'Uganda' },
    current: {
      temperature_2m: 24.2,
      apparent_temperature: 24.5,
      relative_humidity_2m: 65,
      weather_code: 1,
      is_day: 1,
      wind_speed_10m: 9.3,
      precipitation: 0
    }
  };
  const reply = buildGroundedWeatherReply(dryWeather, 'Is it raining right now?');
  assert.ok(reply.includes('Kampala'));
  // A rainfall question should answer the precipitation question directly; temperature is not required.
  assert.ok(reply.includes('no measurable precipitation'));
  assert.ok(!reply.includes('heavy rain'));

  const rainyWeather = {
    location: { name: 'Entebbe', country: 'Uganda' },
    current: {
      temperature_2m: 21,
      apparent_temperature: 21,
      relative_humidity_2m: 92,
      weather_code: 61,
      is_day: 1,
      wind_speed_10m: 14.5,
      precipitation: 0
    }
  };
  const rainyReply = buildGroundedWeatherReply(rainyWeather, 'Is it raining?');
  assert.ok(rainyReply.includes('Entebbe'));
  assert.ok(rainyReply.includes('condition indicates rain'));
});

test('missing weather measurements are never replaced with plausible-looking numbers', () => {
  const reply = buildGroundedWeatherReply(
    { location: { name: 'Kampala', country: 'Uganda' }, current: {} },
    "What's the weather like right now?"
  );
  assert.match(reply, /measurements are incomplete/i);
  assert.doesNotMatch(reply, /22°C|60% humidity|8 km\/h/i);
});

test('unknown weather codes are described as unavailable, not fair or clear', () => {
  assert.equal(getWeatherConditionDescription(999), 'conditions unavailable');
  assert.equal(getWeatherConditionDescription(-1), 'conditions unavailable');
});

test('weather condition descriptions preserve meaningful intensity distinctions', () => {
  assert.equal(getWeatherConditionDescription(51), 'light drizzle');
  assert.equal(getWeatherConditionDescription(55), 'dense drizzle');
  assert.equal(getWeatherConditionDescription(56), 'light freezing drizzle');
  assert.equal(getWeatherConditionDescription(65), 'heavy rain');
  assert.equal(getWeatherConditionDescription(67), 'heavy freezing rain');
  assert.equal(getWeatherConditionDescription(77), 'snow grains');
  assert.equal(getWeatherConditionDescription(82), 'intense rain showers');
  assert.equal(getWeatherConditionDescription(99), 'severe thunderstorms with hail');
});

test('boundConversationHistory preserves the most recent messages', () => {
  const messages = [
    { role: 'user', content: 'Msg 1' },
    { role: 'assistant', content: 'Reply 1' },
    { role: 'user', content: 'Msg 2' },
    { role: 'assistant', content: 'Reply 2' },
    { role: 'user', content: 'Msg 3' },
    { role: 'assistant', content: 'Reply 3' },
    { role: 'user', content: 'Msg 4' },
    { role: 'assistant', content: 'Reply 4' },
    { role: 'user', content: 'Msg 5' }
  ];
  const bounded = boundConversationHistory(messages, 4);
  assert.equal(bounded.length, 4);
  assert.equal(bounded[bounded.length - 1].content, 'Msg 5');
  assert.equal(bounded[0].content, 'Reply 3');
});
