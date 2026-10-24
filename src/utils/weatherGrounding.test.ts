import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  buildGroundedWeatherReply, 
  isDirectCurrentWeatherQuery, 
  boundConversationHistory 
} from './weatherGrounding';

test('isDirectCurrentWeatherQuery detects simple current condition queries', () => {
  assert.equal(isDirectCurrentWeatherQuery("What's the weather like right now?"), true);
  assert.equal(isDirectCurrentWeatherQuery("What is the temperature?"), true);
  assert.equal(isDirectCurrentWeatherQuery("Is it raining right now?"), true);
  assert.equal(isDirectCurrentWeatherQuery("How's the weather outside?"), true);
  assert.equal(isDirectCurrentWeatherQuery("What are current conditions?"), true);
  
  // Complex or lifestyle queries should NOT be marked as direct simple queries
  assert.equal(isDirectCurrentWeatherQuery("What should I wear tomorrow?"), false);
  assert.equal(isDirectCurrentWeatherQuery("Compare Kampala and Entebbe"), false);
  assert.equal(isDirectCurrentWeatherQuery("Why is the wind blowing so fast?"), false);
  assert.equal(isDirectCurrentWeatherQuery("Will it rain in 4 hours?"), false);
});

test('buildGroundedWeatherReply generates accurate observation without claiming rain when precipitation is zero', () => {
  const weather = {
    location: { name: 'Kampala', country: 'Uganda' },
    current: {
      temperature_2m: 24.2,
      apparent_temperature: 24.5,
      relative_humidity_2m: 65,
      weather_code: 1, // Mainly clear
      is_day: 1,
      wind_speed_10m: 9.3,
      precipitation: 0
    }
  };

  const reply = buildGroundedWeatherReply(weather, "Is it raining right now?");
  assert.ok(reply.includes('Kampala'));
  assert.ok(reply.includes('24°C'));
  assert.ok(reply.includes('No rain is falling'));
  assert.ok(!reply.includes('heavy rain'));
});

test('buildGroundedWeatherReply detects active rainfall when precipitation > 0 or rain WMO code', () => {
  const rainyWeather = {
    location: { name: 'Entebbe', country: 'Uganda' },
    current: {
      temperature_2m: 21.0,
      apparent_temperature: 21.0,
      relative_humidity_2m: 92,
      weather_code: 61, // Rain showers
      is_day: 1,
      wind_speed_10m: 14.5,
      precipitation: 2.4
    }
  };

  const reply = buildGroundedWeatherReply(rainyWeather, "Is it raining?");
  assert.ok(reply.includes('Entebbe'));
  assert.ok(reply.includes('21°C'));
  assert.ok(reply.includes('rain') || reply.includes('Rain'));
});

test('boundConversationHistory preserves last N turns while retaining message integrity', () => {
  const longHistory = [
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

  const bounded = boundConversationHistory(longHistory, 4);
  assert.equal(bounded.length, 4);
  assert.equal(bounded[bounded.length - 1].content, 'Msg 5');
  assert.equal(bounded[0].content, 'Reply 3');
});
