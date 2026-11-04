import React, { useState, useEffect, useRef } from 'react';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { Header } from './components/Header';
import { CurrentWeatherCard } from './components/CurrentWeatherCard';
import { DailyBriefingCard } from './components/DailyBriefingCard';
import { AuthModal } from './components/AuthModal';
import { PrivacyPortalModal } from './components/PrivacyPortalModal';
import { AlertCenterModal } from './components/AlertCenterModal';
import { WeatherReferenceDashboard } from './components/WeatherReferenceDashboard';
import { WeatherWardrobeCard } from './components/WeatherWardrobeCard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MobileNavBar } from './components/MobileNavBar';
import { WeatherData, LocationMode } from './types';
import { getWeatherCondition, isWithinLocalSolarWindow } from './utils/weatherUtils';
import { useAuth } from './context/AuthContext';
import { AlertCircle, RefreshCw, ShieldCheck, KeyRound, Sparkles, Mic, Navigation, Globe, MapPin, ExternalLink, X, Map, ChevronDown } from 'lucide-react';


// Load feature-heavy screens only when the user opens them, keeping first visit lighter.
const AiInsightsCard = React.lazy(() => import('./components/AiInsightsCard').then((module) => ({ default: module.AiInsightsCard })));
const HourlyForecast = React.lazy(() => import('./components/HourlyForecast').then((module) => ({ default: module.HourlyForecast })));
const WeatherDetailsGrid = React.lazy(() => import('./components/WeatherDetailsGrid').then((module) => ({ default: module.WeatherDetailsGrid })));
const AssistantModal = React.lazy(() => import('./components/AssistantModal').then((module) => ({ default: module.AssistantModal })));
const WeatherMap = React.lazy(() => import('./components/WeatherMap').then((module) => ({ default: module.WeatherMap })));
const Interactive3DGlobe = React.lazy(() => import('./components/Interactive3DGlobe').then((module) => ({ default: module.Interactive3DGlobe })));

interface CurrentDevicePlace {
  name: string;
  country: string;
  admin1: string;
}

/**
 * BigDataCloud's free client-side endpoint is called only with fresh device GPS
 * coordinates after the browser grants location permission. It is not used for
 * arbitrary map clicks, searches, stored coordinates or server-side lookups.
 */
async function resolveCurrentDevicePlace(latitude: number, longitude: number): Promise<CurrentDevicePlace | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: 'en'
    });
    const response = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?' + params.toString(), {
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    const city = typeof data.city === 'string' ? data.city.trim() : '';
    const locality = typeof data.locality === 'string' ? data.locality.trim() : '';
    const principalSubdivision = typeof data.principalSubdivision === 'string' ? data.principalSubdivision.trim() : '';
    const country = typeof data.countryName === 'string' ? data.countryName.trim() : '';
    const name = locality && city && locality.toLowerCase() !== city.toLowerCase()
      ? locality + ', ' + city
      : city || locality || principalSubdivision;
    if (!name) return null;
    return { name, country, admin1: principalSubdivision };
  } catch (error) {
    console.warn('[RODEX Atmos] Device place-name lookup unavailable; keeping coordinate-based weather.', error);
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function App() {
  const { userPreferences, updateUserPreferences, notificationPreferences, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map'>('dashboard');
  const [showMoreWeather, setShowMoreWeather] = useState(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'map' | 'globe'>('map');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [deviceLocationData, setDeviceLocationData] = useState<WeatherData | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>('gps');
  const [locationNotice, setLocationNotice] = useState<{ type: 'info' | 'message' | 'warning'; message: string } | null>(null);
  const [unit, setUnit] = useState<'C' | 'F'>(userPreferences?.temperatureUnit || 'C');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState<boolean>(false);
  const [hasOpenedAssistant, setHasOpenedAssistant] = useState<boolean>(false);
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isPrivacyPortalOpen, setIsPrivacyPortalOpen] = useState<boolean>(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState<boolean>(false);
  const [mapContextLocation, setMapContextLocation] = useState<WeatherData | null>(null);
  const [activeMapLayer, setActiveMapLayer] = useState<'temperature' | 'precipitation' | 'wind'>('temperature');
  const weatherRequestIdRef = useRef(0);

  const handleOpenAssistant = (prompt?: string) => {
    if (prompt) setAssistantPrompt(prompt);
    setHasOpenedAssistant(true);
    setIsAssistantOpen(true);
  };

  // Sync temperature unit with user privacy preferences
  useEffect(() => {
    if (userPreferences?.temperatureUnit) {
      setUnit(userPreferences.temperatureUnit);
    }
  }, [userPreferences?.temperatureUnit]);

  // Progressive Location Strategy on App Startup
  const initializeStartupLocation = async (forceGPS = false) => {
    const requestId = ++weatherRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setLocationNotice(null);

    // Respect Privacy Preference for Auto Location
    if (!forceGPS && userPreferences && userPreferences.autoLocationEnabled === false) {
      try {
        const res = await fetch('/api/weather/search?query=Kampala,Uganda');
        const data = await res.json().catch(() => null);
        if (requestId !== weatherRequestIdRef.current) return;
        if (!res.ok) {
          setErrorMessage(data?.message || data?.error || `Weather service returned HTTP ${res.status}. Check the deployment API and try again.`);
        } else if (data?.weather?.current && data?.location?.name) {
          setWeatherData(data as WeatherData);
          setDeviceLocationData(data as WeatherData);
          setLocationMode('fallback');
          setLocationNotice({
            type: 'info',
            message: 'Automatic location lookup is disabled in Privacy Preferences. Search any city or tap "My Location" to fetch weather.'
          });
        } else {
          setErrorMessage('The weather service returned an incomplete forecast. Please retry or search for a city.');
        }
      } catch (e) {
        if (requestId === weatherRequestIdRef.current) {
          console.warn('Auto location disabled fallback error:', e);
          setErrorMessage('Unable to reach the weather API. The preview may be missing its API route or the service may be temporarily unavailable.');
        }
      } finally {
        if (requestId === weatherRequestIdRef.current) setIsLoading(false);
      }
      return;
    }

    const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

    // Helper for Step 2: Approximate Network IP Geolocation
    const tryNetworkIpLocation = async (gpsErrorReason?: string) => {
      try {
        const res = await fetch('/api/weather/ip-location');
        if (requestId !== weatherRequestIdRef.current) return;
        if (res.ok) {
          const data: WeatherData = await res.json();
          setWeatherData(data);
          setDeviceLocationData(data);
          setLocationMode('network');
          setLocationNotice({
            type: 'info',
            message: `Approximate network location detected (${data.location.name}${data.location.country ? ', ' + data.location.country : ''}). Enable device location for exact local weather.`
          });
          return;
        }
      } catch (e) {
        console.warn('IP geolocation fetch failed:', e);
      }

      // Step 3: Default Fallback Location (Kampala, Uganda)
      try {
        const res = await fetch('/api/weather/search?query=Kampala,Uganda');
        const data = await res.json().catch(() => null);
        if (requestId !== weatherRequestIdRef.current) return;
        if (res.ok && data?.weather?.current && data?.location?.name) {
          setWeatherData(data as WeatherData);
          setDeviceLocationData(data as WeatherData);
          setLocationMode('fallback');
          setErrorMessage(null);
          setLocationNotice({
            type: 'warning',
            message: gpsErrorReason
              ? `${gpsErrorReason} Displaying default location (Kampala, Uganda). Search any city or tap "My Location" to retry.`
              : 'Device location unavailable. Displaying default location (Kampala, Uganda).'
          });
        } else {
          const serviceMessage = data?.message || data?.error || `Weather API returned HTTP ${res.status}.`;
          setErrorMessage(`Unable to load the forecast. ${serviceMessage} Check the deployment API and retry, or search for a city.`);
        }
      } catch (fallbackErr) {
        if (requestId === weatherRequestIdRef.current) {
          console.error('Default weather fallback failed:', fallbackErr);
          setErrorMessage('Unable to reach the weather API. Check the deployed backend/API routing and your network, then retry.');
        }
      }
    };

    // Step 1: Check Physical Geolocation API
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      await tryNetworkIpLocation('Geolocation is not supported by your browser.');
      if (requestId === weatherRequestIdRef.current) setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Run place-name resolution and the weather request together to avoid adding latency.
          const placePromise = resolveCurrentDevicePlace(latitude, longitude);
          // Show weather as soon as the weather API responds. A slow third-party
          // reverse-geocoder must never hold the forecast screen hostage.
          const res = await fetch(`/api/weather/coordinates?lat=${latitude}&lon=${longitude}&name=My%20Location`);
          if (requestId !== weatherRequestIdRef.current) return;
          if (res.ok) {
            const data: WeatherData = await res.json();
            if (requestId !== weatherRequestIdRef.current) return;
            setWeatherData(data);
            setDeviceLocationData(data);
            setLocationMode('gps');
            setLocationNotice(null);

            void placePromise.then((place) => {
              if (!place || requestId !== weatherRequestIdRef.current) return;
              const namedData: WeatherData = {
                ...data,
                location: {
                  ...data.location,
                  name: place.name,
                  country: place.country || data.location.country,
                  admin1: place.admin1 || data.location.admin1
                }
              };
              setWeatherData(namedData);
              setDeviceLocationData(namedData);
            });
          } else {
            await tryNetworkIpLocation('Unable to resolve GPS coordinates.');
          }
        } catch (err) {
          if (requestId === weatherRequestIdRef.current) await tryNetworkIpLocation('GPS coordinate lookup failed.');
        } finally {
          if (requestId === weatherRequestIdRef.current) setIsLoading(false);
        }
      },
      async (error) => {
        let reason = 'Location access was unavailable.';
        if (error.code === error.PERMISSION_DENIED) {
          if (inIframe) {
            reason = 'Location access is restricted by the preview frame policy.';
          } else {
            reason = 'Location permission was denied in browser settings.';
          }
        } else if (error.code === error.TIMEOUT) {
          reason = 'GPS location request timed out.';
        }
        if (requestId !== weatherRequestIdRef.current) return;
        await tryNetworkIpLocation(reason);
        if (requestId === weatherRequestIdRef.current) setIsLoading(false);
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 300000 }
    );
  };

  useEffect(() => {
    if (!authLoading) {
      void initializeStartupLocation();
    }
  }, [authLoading]);

  // Move to the selected place on the street map after a successful search.
  const openSelectedLocationOnMap = () => {
    setActiveTab('map');
    setMapDisplayMode('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch live weather by search query (preserves deviceLocationData!)
  const handleSearch = async (query: string) => {
    const requestId = ++weatherRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setSetupRequired(false);
    try {
      const res = await fetch(`/api/weather/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (requestId !== weatherRequestIdRef.current) return;
      
      if (!res.ok) {
        if (data.error === 'SETUP_REQUIRED') {
          setSetupRequired(true);
          setErrorMessage(data.message || 'Setup required: Weather API key not configured.');
        } else {
          throw new Error(data.error || `City "${query}" not found`);
        }
        return;
      }
      setWeatherData(data);
      setLocationMode('search');
      openSelectedLocationOnMap();
    } catch (err: any) {
      if (requestId === weatherRequestIdRef.current) {
        console.error('Search error:', err);
        setErrorMessage(err.message || 'Could not fetch live weather for the requested city.');
      }
    } finally {
      if (requestId === weatherRequestIdRef.current) setIsLoading(false);
    }
  };

  // Fetch live weather by exact coordinates
  const handleSelectCoordinates = async (lat: number, lon: number, name: string) => {
    const requestId = ++weatherRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setSetupRequired(false);
    try {
      const res = await fetch(`/api/weather/coordinates?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (requestId !== weatherRequestIdRef.current) return;
      
      if (!res.ok) {
        if (data.error === 'SETUP_REQUIRED') {
          setSetupRequired(true);
          setErrorMessage(data.message || 'Setup required: Weather API key not configured.');
        } else {
          throw new Error(data.error || 'Failed to fetch weather');
        }
        return;
      }
      setWeatherData(data);
      setLocationMode('search');
      openSelectedLocationOnMap();
    } catch (err: any) {
      if (requestId === weatherRequestIdRef.current) {
        console.error('Coordinates error:', err);
        setErrorMessage('Failed to fetch live weather data for coordinates.');
      }
    } finally {
      if (requestId === weatherRequestIdRef.current) setIsLoading(false);
    }
  };

  // Re-trigger "My Location" button action
  const handleGetCurrentLocation = () => {
    if (deviceLocationData && locationMode === 'search') {
      setWeatherData(deviceLocationData);
      setLocationMode(deviceLocationData.location.isApproximateNetwork ? 'network' : 'gps');
    }
    initializeStartupLocation(true);
  };

  let currentTheme = weatherData 
    ? getWeatherCondition(weatherData.weather.current.weather_code, weatherData.weather.current.is_day).theme
    : 'sunny';

  // Evaluate sunrise/sunset against the selected forecast location's own local clock.
  if (
    weatherData &&
    isWithinLocalSolarWindow(
      weatherData.weather.daily?.sunrise?.[0],
      weatherData.weather.daily?.sunset?.[0],
      weatherData.location.timezone,
      weatherData.location.timezoneOffsetSeconds
    ) &&
    currentTheme !== 'thunder' &&
    currentTheme !== 'snowy' &&
    currentTheme !== 'rainy'
  ) {
    currentTheme = 'twilight';
  }

  const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

  return (
    <div className="rodex-monochrome-theme min-h-screen text-white font-sans selection:bg-white selection:text-black pb-28 sm:pb-16 relative">
      {/* Offline Status Indicator Banner */}
      <OfflineIndicator />

      {/* Continuous atmospheric background across the entire app */}
      <AtmosphericBackground theme={currentTheme} />

      {/* Header */}
      <Header
        onSearch={handleSearch}
        onSelectCoordinates={handleSelectCoordinates}
        onGetCurrentLocation={handleGetCurrentLocation}
        unit={unit}
        onToggleUnit={() => {
          const nextUnit = unit === 'C' ? 'F' : 'C';
          setUnit(nextUnit);
          updateUserPreferences({ temperatureUnit: nextUnit });
        }}
        isLoading={isLoading}
        currentLocationName={weatherData?.location.name || (setupRequired ? 'Setup Required' : 'Detecting Location...')}
        locationMode={locationMode}
        onOpenAssistant={() => handleOpenAssistant()}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenPrivacyPortal={() => setIsPrivacyPortalOpen(true)}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        activeAlertsCount={weatherData?.alerts?.length || 0}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Container */}
      <main className={`max-w-[1360px] mx-auto px-3 sm:px-5 lg:px-6 ${activeTab === 'dashboard' ? 'pt-1 sm:pt-2 space-y-4' : 'pt-6 sm:pt-8 space-y-6'}`}>
        
        {/* Location Detection / Fallback Notice Banner */}
        {locationNotice && !setupRequired && (
          <div className={`w-full border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-xl animate-fade-in ${
            locationNotice.type === 'warning' 
              ? 'bg-neutral-500/15 border-neutral-400/30 text-neutral-200' 
              : 'bg-neutral-500/15 border-neutral-400/30 text-neutral-200'
          }`}>
            <div className="flex items-center gap-3">
              {locationMode === 'network' ? (
                <Globe className="w-5 h-5 text-neutral-300 shrink-0" />
              ) : locationMode === 'fallback' ? (
                <MapPin className="w-5 h-5 text-neutral-300 shrink-0" />
              ) : (
                <Navigation className="w-5 h-5 text-neutral-300 shrink-0" />
              )}
              <div className="text-xs sm:text-sm font-medium leading-relaxed">
                {locationNotice.message}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {locationMode !== 'gps' && (
                <button
                  onClick={() => initializeStartupLocation(true)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-500 hover:bg-neutral-400 text-white text-xs font-bold transition shadow"
                >
                  Enable GPS Location
                </button>
              )}
              {inIframe && locationMode !== 'gps' && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1 border border-white/20 transition"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={() => setLocationNotice(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Weather Provider Attribution & Disclaimer Banner */}
        {weatherData && weatherData.providerInfo && activeTab !== 'dashboard' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 rounded-2xl bg-neutral-500/10 border border-neutral-400/20 backdrop-blur-md text-xs text-neutral-200 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="font-semibold text-white">{weatherData.providerInfo.credit}</span>
              <span className="text-white/40">•</span>
              <span className="text-neutral-200/80">{weatherData.providerInfo.disclaimer}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-neutral-500/15 border border-neutral-400/25 text-[11px] font-medium text-neutral-200">
                {locationMode === 'gps' ? 'GPS Location Verified' : locationMode === 'network' ? 'Approximate Network Location' : locationMode === 'search' ? 'Searched Location' : 'Default Fallback Location'}
              </span>
            </div>
          </div>
        )}

        {/* Setup Required State Message */}
        {setupRequired && (
          <div className="w-full bg-neutral-500/25 border-2 border-neutral-400/50 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-neutral-500/30 flex items-center justify-center mx-auto text-neutral-300">
              <KeyRound className="w-8 h-8 animate-bounce" />
            </div>
            <h2 className="text-2xl font-black text-white">Weather Provider Setup Required</h2>
            <p className="text-sm text-neutral-100 max-w-xl mx-auto leading-relaxed">
              To view live weather forecasts, please configure a server-side API key in your environment secrets.
            </p>
            <div className="bg-black/30 rounded-2xl p-4 max-w-md mx-auto text-left text-xs font-mono text-neutral-200 space-y-1 border border-white/10">
              <div className="text-neutral-300 font-bold mb-1">Optional additional weather provider:</div>
              <div>WEATHERAPI_KEY="your_api_key_here"</div>
              <div className="text-white/70 text-[10px] mt-2">Open-Meteo also works without a key. Check backend connectivity before adding a provider.</div>
            </div>
            <button
              onClick={() => handleSearch('Kampala')}
              className="px-6 py-2.5 rounded-xl bg-neutral-500 hover:bg-neutral-400 text-neutral-950 font-bold text-sm shadow-lg transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Error Banner if any */}
        {errorMessage && !setupRequired && (
          <div className="w-full bg-neutral-500/20 border border-neutral-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-neutral-200 backdrop-blur-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-neutral-300 shrink-0" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs px-3 py-1 rounded-lg bg-neutral-500/30 hover:bg-neutral-500/50 transition font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !weatherData && !setupRequired && (
          <div className="w-full py-24 flex flex-col items-center justify-center gap-4 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10">
            <RefreshCw className="w-10 h-10 text-neutral-400 animate-spin" />
            <p className="text-base font-semibold text-neutral-200">Detecting local weather for your location...</p>
          </div>
        )}

        {weatherData && !setupRequired && (
          <>
            {activeTab === 'map' ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white break-words">Weather map · {weatherData.location.name}</h2>
                    <p className="text-xs text-white/65 mt-1">{weatherData.location.country ? weatherData.location.country + ' · ' : ''}Centered on your selected location. Explore nearby areas or switch to the 3D globe.</p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl border border-white/20 bg-white/8 backdrop-blur-xl" role="group" aria-label="Map display mode">
                    <button type="button" onClick={() => setMapDisplayMode('map')} aria-pressed={mapDisplayMode === 'map'} className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${mapDisplayMode === 'map' ? 'bg-white/20 text-white shadow' : 'text-white/65 hover:text-white'}`}>2D map</button>
                    <button type="button" onClick={() => setMapDisplayMode('globe')} aria-pressed={mapDisplayMode === 'globe'} className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${mapDisplayMode === 'globe' ? 'bg-white/20 text-white shadow' : 'text-white/65 hover:text-white'}`}>3D globe</button>
                  </div>
                </div>

                {mapDisplayMode === 'map' ? (
                  <React.Suspense fallback={<div className="wx-map-card flex min-h-[clamp(320px,54dvh,470px)] items-center justify-center rounded-3xl border border-white/10 bg-[#151515] p-6 text-sm text-white/70"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading interactive weather map…</div>}>
                    <WeatherMap
                      currentWeatherData={weatherData}
                      deviceLocationData={deviceLocationData}
                      unit={unit}
                      onSelectCoordinates={handleSelectCoordinates}
                      onOpenAssistant={handleOpenAssistant}
                      onGetCurrentLocation={handleGetCurrentLocation}
                      locationMode={locationMode}
                      onMapContextChange={(mapLoc, layer) => {
                        if (mapLoc) setMapContextLocation(mapLoc);
                        if (layer) setActiveMapLayer(layer);
                      }}
                    />
                  </React.Suspense>
                ) : (
                  <div className="glass-panel-elevated rounded-3xl border border-white/15 overflow-hidden p-2 sm:p-4">
                    <React.Suspense fallback={<div className="flex min-h-[420px] items-center justify-center text-sm text-white/70"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Preparing the 3D globe…</div>}>
                      <Interactive3DGlobe
                        lat={weatherData.location.latitude}
                        lon={weatherData.location.longitude}
                        cityName={weatherData.location.name}
                        country={weatherData.location.country}
                        temperature={weatherData.weather.current.temperature_2m}
                        condition={getWeatherCondition(weatherData.weather.current.weather_code, weatherData.weather.current.is_day).label}
                        unit={unit}
                        onSelectCoordinates={handleSelectCoordinates}
                      />
                    </React.Suspense>
                  </div>
                )}

                <CurrentWeatherCard
                  data={weatherData}
                  unit={unit}
                  onGetCurrentLocation={() => initializeStartupLocation(true)}
                  locationMode={locationMode}
                  isLoading={isLoading}
                />

                <DailyBriefingCard data={weatherData} onOpenAssistant={handleOpenAssistant} unit={unit} />
              </div>
            ) : (
              <div className="space-y-5 animate-fade-in">
                <WeatherReferenceDashboard
                  data={weatherData}
                  unit={unit}
                  locationMode={locationMode}
                  isLoading={isLoading}
                  onGetCurrentLocation={handleGetCurrentLocation}
                  onOpenAssistant={handleOpenAssistant}
                  onOpenMap={() => setActiveTab('map')}
                  onOpenAccount={() => setIsAuthOpen(true)}
                  onOpenPrivacy={() => setIsPrivacyPortalOpen(true)}
                  onOpenAlerts={() => setIsAlertsModalOpen(true)}
                />

                <WeatherWardrobeCard
                  data={weatherData}
                  unit={unit}
                  onOpenAssistant={handleOpenAssistant}
                />

                <button
                  type="button"
                  className="wx-more-weather-toggle"
                  aria-expanded={showMoreWeather}
                  aria-controls="wx-more-weather-content"
                  onClick={() => setShowMoreWeather((open) => !open)}
                >
                  <span className="wx-more-weather-copy">
                    <strong>{showMoreWeather ? 'Hide detailed weather' : 'More weather information'}</strong>
                    <small>24-hour forecast, measurements and optional AI summaries</small>
                  </span>
                  <ChevronDown className={`wx-more-weather-chevron ${showMoreWeather ? 'is-open' : ''}`} aria-hidden="true" />
                </button>

                {showMoreWeather && (
                  <section id="wx-more-weather-content" className="wx-more-weather-content" aria-label="Additional weather information">
                    <div className="wx-reference-support-grid">
                      <DailyBriefingCard
                        data={weatherData}
                        onOpenAssistant={handleOpenAssistant}
                        unit={unit}
                      />
                      <React.Suspense fallback={<div className="glass-panel-elevated flex min-h-28 items-center justify-center rounded-2xl p-4 text-sm text-white/65">Loading AI weather insights…</div>}>
                        <AiInsightsCard
                          data={weatherData}
                          onOpenAssistant={() => handleOpenAssistant()}
                        />
                      </React.Suspense>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4 sm:gap-5 items-start">
                      <React.Suspense fallback={<div className="glass-panel-elevated flex min-h-40 items-center justify-center rounded-2xl p-4 text-sm text-white/65">Loading detailed forecast…</div>}>
                        <HourlyForecast
                          hourly={weatherData.weather.hourly}
                          unit={unit}
                          currentTime={weatherData.weather.current.time}
                        />
                        <WeatherDetailsGrid data={weatherData} unit={unit} />
                      </React.Suspense>
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}

      </main>

      {/* Keep the desktop floating assistant off the reference dashboard; its voice action is in the left rail. */}
      {activeTab !== 'dashboard' && (
      <aside aria-label="Quick Actions" className="fixed bottom-6 right-6 z-40 hidden lg:flex">
        <button
          onClick={() => handleOpenAssistant()}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-neutral-200 via-neutral-300 to-neutral-400 hover:from-white hover:to-neutral-300 text-neutral-950 font-bold text-sm shadow-2xl shadow-black/40 border border-white/40 transition transform hover:scale-105 group backdrop-blur-md"
          title="Open RODEX AI Voice & Chat"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-neutral-200 group-hover:rotate-12 transition-transform" />
            <Mic className="w-3 h-3 text-neutral-300 absolute -bottom-1 -right-1" />
          </div>
          <span>RODEX AI (Voice & Chat)</span>
        </button>
      </aside>
      )}

      {/* RODEX AI Live Voice & Text Assistant Modal */}
      {hasOpenedAssistant && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 text-sm text-white"><div className="flex items-center rounded-2xl border border-white/15 bg-[#151515] px-5 py-4 shadow-2xl"><RefreshCw className="mr-3 h-4 w-4 animate-spin" />Preparing RODEX AI…</div></div>}>
          <AssistantModal
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
            weatherData={weatherData}
            deviceLocationData={deviceLocationData}
            mapContextData={mapContextLocation || weatherData}
            activeMapLayer={activeMapLayer}
            locationMode={locationMode}
            onSelectCityWeather={(newWeather) => {
              setWeatherData(newWeather);
              setLocationMode('search');
            }}
            initialPrompt={assistantPrompt}
            onExecuteAction={(action, payload) => {
              if (action === 'SWITCH_TAB') {
                setActiveTab(payload || 'map');
              } else if (action === 'SET_MAP_LAYER') {
                setActiveTab('map');
                if (payload) setActiveMapLayer(payload);
              } else if (action === 'RESET_GPS') {
                handleGetCurrentLocation();
              } else if (action === 'SEARCH_CITY') {
                if (payload) handleSearch(payload);
              }
            }}
          />
        </React.Suspense>
      )}

      {/* Smart Weather Alerts & Preferences Modal */}
      <AlertCenterModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        alerts={weatherData?.alerts || []}
        locationName={weatherData?.location.name || 'Selected Location'}
        onOpenAssistant={handleOpenAssistant}
      />

      {/* Account Authentication & Verification Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onOpenPrivacyPortal={() => setIsPrivacyPortalOpen(true)}
      />

      {/* Individual Privacy Portal, Controls & Account Management Modal */}
      <PrivacyPortalModal
        isOpen={isPrivacyPortalOpen}
        onClose={() => setIsPrivacyPortalOpen(false)}
        onOpenAuthModal={() => setIsAuthOpen(true)}
      />

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-white/50 gap-4">
        <div>
          RODEX Atmos — Advanced Weather Intelligence & Atmospheric Forecasting.
        </div>
        <div className="flex items-center gap-4">
          <span>Active Provider: <strong className="text-white">{weatherData?.providerInfo?.name || 'Multi-Router'}</strong></span>
          <span>•</span>
          <span>RODEX AI: Live Voice (Gemini 3.8 Live) & Chat (Gemini 3.8 Flash)</span>
        </div>
      </footer>

      {/* Keep modal action buttons accessible: hide the floating dock during dialogs. */}
      {!isAssistantOpen && !isAuthOpen && !isPrivacyPortalOpen && !isAlertsModalOpen && (
      <MobileNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAssistant={() => handleOpenAssistant()}
        onOpenAlerts={() => setIsAlertsModalOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenPrivacy={() => setIsPrivacyPortalOpen(true)}
        activeAlertsCount={weatherData?.alerts?.length || 0}
      />
      )}
    </div>
  );
}
