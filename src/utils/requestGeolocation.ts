type HeaderValue = string | string[] | undefined;
type HeaderRecord = Record<string, HeaderValue>;

export interface VercelRequestGeo {
  latitude: number;
  longitude: number;
  city: string;
  countryCode: string;
  timezone: string | null;
}

function readHeader(headers: HeaderRecord, name: string): string | undefined {
  const value = headers[name.toLowerCase()] ?? headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.trim() ? first.trim() : undefined;
}

function decodeCity(value: string | undefined): string {
  if (!value) return '';
  const clean = (raw: string) => raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  try {
    return clean(decodeURIComponent(value));
  } catch {
    return clean(value);
  }
}

export function getVercelRequestGeo(headers: HeaderRecord): VercelRequestGeo | null {
  const latitude = Number(readHeader(headers, 'x-vercel-ip-latitude'));
  const longitude = Number(readHeader(headers, 'x-vercel-ip-longitude'));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) return null;

  const rawCountry = readHeader(headers, 'x-vercel-ip-country') || '';
  const countryCode = /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : '';
  const rawTimezone = readHeader(headers, 'x-vercel-ip-timezone');
  let timezone: string | null = null;
  if (rawTimezone && rawTimezone.length <= 80) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: rawTimezone });
      timezone = rawTimezone;
    } catch {
      timezone = null;
    }
  }

  return {
    latitude,
    longitude,
    city: decodeCity(readHeader(headers, 'x-vercel-ip-city')) || 'Network Location',
    countryCode,
    timezone
  };
}
