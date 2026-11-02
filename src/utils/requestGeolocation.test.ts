import test from 'node:test';
import assert from 'node:assert/strict';
import { getVercelRequestGeo } from './requestGeolocation';

test('reads visitor coordinates and metadata from Vercel headers', () => {
  assert.deepEqual(getVercelRequestGeo({
    'x-vercel-ip-latitude': '0.31628',
    'x-vercel-ip-longitude': '32.58219',
    'x-vercel-ip-city': 'Kampala',
    'x-vercel-ip-country': 'ug',
    'x-vercel-ip-timezone': 'Africa/Kampala'
  }), {
    latitude: 0.31628,
    longitude: 32.58219,
    city: 'Kampala',
    countryCode: 'UG',
    timezone: 'Africa/Kampala'
  });
});

test('decodes percent-encoded city names and safely defaults missing metadata', () => {
  assert.equal(getVercelRequestGeo({
    'x-vercel-ip-latitude': '48.8566',
    'x-vercel-ip-longitude': '2.3522',
    'x-vercel-ip-city': 'Paris%20Centre'
  })?.city, 'Paris Centre');
  const fallback = getVercelRequestGeo({
    'x-vercel-ip-latitude': '0',
    'x-vercel-ip-longitude': '0',
    'x-vercel-ip-timezone': 'Invalid/Timezone'
  });
  assert.equal(fallback?.city, 'Network Location');
  assert.equal(fallback?.timezone, null);
});

test('rejects missing, invalid and out-of-range visitor coordinates', () => {
  assert.equal(getVercelRequestGeo({}), null);
  assert.equal(getVercelRequestGeo({
    'x-vercel-ip-latitude': 'invalid',
    'x-vercel-ip-longitude': '0'
  }), null);
  assert.equal(getVercelRequestGeo({
    'x-vercel-ip-latitude': '91',
    'x-vercel-ip-longitude': '0'
  }), null);
  assert.equal(getVercelRequestGeo({
    'x-vercel-ip-latitude': '0',
    'x-vercel-ip-longitude': '181'
  }), null);
});
