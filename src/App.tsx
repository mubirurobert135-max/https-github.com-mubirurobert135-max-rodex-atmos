import React, { useState, useEffect } from 'react';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { Header } from './components/Header';
import { CurrentWeatherCard } from './components/CurrentWeatherCard';
import { DailyBriefingCard } from './components/DailyBriefingCard';
import { AiInsightsCard } from './components/AiInsightsCard';
import { HourlyForecast } from './components/HourlyForecast';
import { WeatherDetailsGrid } from './components/WeatherDetailsGrid';
import { AssistantModal } from './components/AssistantModal';
import { AuthModal } from './components/AuthModal';
import { PrivacyPortalModal } from './components/PrivacyPortalModal';
import { AlertCenterModal } from './components/AlertCenterModal';
import { WeatherMap } from './components/WeatherMap';
import { Interactive3DGlobe } from './components/Interactive3DGlobe';
import { WeatherReferenceDashboard } from './components/WeatherReferenceDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { MobileNavBar } from './components/MobileNavBar';
import { WeatherData, LocationMode } from './types';
import { getWeatherCondition } from './utils/weatherUtils';
import { useAuth } from './context/AuthContext';
import { AlertCircle, RefreshCw, ShieldCheck, KeyRound, Sparkles, Mic, Navigation, Globe, MapPin, ExternalLink, X, Map, ChevronDown } from 'lucide-react';

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
  const { userPreferences, updateUserPreferences, notificationPreferences } = useAuth();
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
  const [assistantPrompt, setAssistantPrompt] = useState<string>('');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isPrivacyPortalOpen, setIsPrivacyPortalOpen] = useState<boolean>(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState<boolean>(false);
  const [mapContextLocation, setMapContextLocation] = useState<WeatherData | null>(null);
  const [activeMapLayer, setActiveMapLayer] = useState<'temperature' | 'precipitation' | 'wind'>('temperature');

  const handleOpenAssistant = (prompt?: string) => {
    if (prompt) setAssistantPrompt(prompt);
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
    setIsLoading(true);
    setErrorMessage(null);
    setLocationNotice(null);

    // Respect Privacy Preference for Auto Location
    if (!forceGPS && userPreferences && userPreferences.autoLocationEnabled === false) {
      try {
        const res = await fetch('/api/weather/search?query=Kampala,Uganda');
        const data = await res.json().catch(() => null);
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
        console.warn('Auto location disabled fallback error:', e);
        setErrorMessage('Unable to reach the weather API. The preview may be missing its API route or the service may be temporarily unavailable.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

    // Helper for Step 2: Approximate Network IP Geolocation
    const tryNetworkIpLocation = async (gpsErrorReason?: string) => {
      try {
        const res = await fetch('/api/weather/ip-location');
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
        console.error('Default weather fallback failed:', fallbackErr);
        setErrorMessage('Unable to reach the weather API. Check the deployed backend/API routing and your network, then retry.');
      }
    };

    // Step 1: Check Physical Geolocation API
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      await tryNetworkIpLocation('Geolocation is not supported by your browser.');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Run place-name resolution and the weather request together to avoid adding latency.
          const placePromise = resolveCurrentDevicePlace(latitude, longitude);
          const weatherPromise = fetch(`/api/weather/coordinates?lat=${latitude}&lon=${longitude}&name=My%20Location`);
          const [place, res] = await Promise.all([placePromise, weatherPromise]);
          if (res.ok) {
            const data: WeatherData = await res.json();
            if (place) {
              data.location = {
                ...data.location,
                name: place.name,
                country: place.country || data.location.country,
                admin1: place.admin1 || data.location.admin1
              };
            }
            setWeatherData(data);
            setDeviceLocationData(data);
            setLocationMode('gps');
            setLocationNotice(null);
          } else {
            await tryNetworkIpLocation('Unable to resolve GPS coordinates.');
          }
        } catch (err) {
          await tryNetworkIpLocation('GPS coordinate lookup failed.');
        } finally {
          setIsLoading(false);
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
        await tryNetworkIpLocation(reason);
        setIsLoading(false);
      },
      { timeout: 7000, enableHighAccuracy: true, maximumAge: 300000 }
    );
  };

  useEffect(() => {
    initializeStartupLocation();
  }, []);

  // Fetch live weather by search query (preserves deviceLocationData!)
  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSetupRequired(false);
    try {
      const res = await fetch(`/api/weather/search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      
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
    } catch (err: any) {
      console.error('Search error:', err);
      setErrorMessage(err.message || 'Could not fetch live weather for the requested city.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch live weather by exact coordinates
  const handleSelectCoordinates = async (lat: number, lon: number, name: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSetupRequired(false);
    try {
      const res = await fetch(`/api/weather/coordinates?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`);
      const data = await res.json();
      
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
    } catch (err: any) {
      console.error('Coordinates error:', err);
      setErrorMessage('Failed to fetch live weather data for coordinates.');
    } finally {
      setIsLoading(false);
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

  // Check if current time is within twilight window (near sunrise or sunset)
  if (weatherData?.weather?.daily?.sunrise?.[0] && weatherData?.weather?.daily?.sunset?.[0]) {
    try {
      const now = new Date();
      const sunrise = new Date(weatherData.weather.daily.sunrise[0]);
      const sunset = new Date(weatherData.weather.daily.sunset[0]);
      const diffSunriseMin = Math.abs(now.getTime() - sunrise.getTime()) / (1000 * 60);
      const diffSunsetMin = Math.abs(now.getTime() - sunset.getTime()) / (1000 * 60);
      if ((diffSunriseMin <= 45 || diffSunsetMin <= 45) && currentTheme !== 'thunder' && currentTheme !== 'snowy' && currentTheme !== 'rainy') {
        currentTheme = 'twilight';
      }
    } catch {
      // Fallback to condition-derived theme
    }
  }

  const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

  return (
    <div className="min-h-screen text-[#32164D] font-sans selection:bg-[#844EE7] selection:text-white pb-28 sm:pb-16 relative">
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
              ? 'bg-amber-500/15 border-amber-400/30 text-amber-200' 
              : 'bg-sky-500/15 border-sky-400/30 text-sky-200'
          }`}>
            <div className="flex items-center gap-3">
              {locationMode === 'network' ? (
                <Globe className="w-5 h-5 text-sky-300 shrink-0" />
              ) : locationMode === 'fallback' ? (
                <MapPin className="w-5 h-5 text-amber-300 shrink-0" />
              ) : (
                <Navigation className="w-5 h-5 text-emerald-300 shrink-0" />
              )}
              <div className="text-xs sm:text-sm font-medium leading-relaxed">
                {locationNotice.message}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {locationMode !== 'gps' && (
                <button
                  onClick={() => initializeStartupLocation(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition shadow"
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 rounded-2xl bg-sky-500/10 border border-sky-400/20 backdrop-blur-md text-xs text-sky-200 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-semibold text-white">{weatherData.providerInfo.credit}</span>
              <span className="text-white/40">•</span>
              <span className="text-sky-200/80">{weatherData.providerInfo.disclaimer}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-sky-500/15 border border-sky-400/25 text-[11px] font-medium text-sky-200">
                {locationMode === 'gps' ? 'GPS Location Verified' : locationMode === 'network' ? 'Approximate Network Location' : locationMode === 'search' ? 'Searched Location' : 'Default Fallback Location'}
              </span>
            </div>
          </div>
        )}

        {/* Setup Required State Message */}
        {setupRequired && (
          <div className="w-full bg-amber-500/25 border-2 border-amber-400/50 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/30 flex items-center justify-center mx-auto text-amber-300">
              <KeyRound className="w-8 h-8 animate-bounce" />
            </div>
            <h2 className="text-2xl font-black text-white">Weather Provider Setup Required</h2>
            <p className="text-sm text-amber-100 max-w-xl mx-auto leading-relaxed">
              To view live weather forecasts, please configure a server-side API key in your environment secrets.
            </p>
            <div className="bg-black/30 rounded-2xl p-4 max-w-md mx-auto text-left text-xs font-mono text-sky-200 space-y-1 border border-white/10">
              <div className="text-amber-300 font-bold mb-1">Required Server Secret:</div>
              <div>WEATHERAPI_KEY="your_api_key_here"</div>
              <div className="text-white/50 text-[10px] mt-2">Get a free key at https://www.weatherapi.com/</div>
            </div>
            <button
              onClick={() => handleSearch('Kampala')}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Error Banner if any */}
        {errorMessage && !setupRequired && (
          <div className="w-full bg-rose-500/20 border border-rose-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-200 backdrop-blur-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs px-3 py-1 rounded-lg bg-rose-500/30 hover:bg-rose-500/50 transition font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !weatherData && !setupRequired && (
          <div className="w-full py-24 flex flex-col items-center justify-center gap-4 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10">
            <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" />
            <p className="text-base font-semibold text-sky-200">Detecting local weather for your location...</p>
          </div>
        )}

        {weatherData && !setupRequired && (
          <>
            {activeTab === 'map' ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">Explore weather around the world</h2>
                    <p className="text-xs text-white/65 mt-1">Switch between the interactive map and 3D weather globe.</p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl border border-white/20 bg-white/8 backdrop-blur-xl" role="group" aria-label="Map display mode">
                    <button type="button" onClick={() => setMapDisplayMode('map')} aria-pressed={mapDisplayMode === 'map'} className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${mapDisplayMode === 'map' ? 'bg-white/20 text-white shadow' : 'text-white/65 hover:text-white'}`}>2D map</button>
                    <button type="button" onClick={() => setMapDisplayMode('globe')} aria-pressed={mapDisplayMode === 'globe'} className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${mapDisplayMode === 'globe' ? 'bg-white/20 text-white shadow' : 'text-white/65 hover:text-white'}`}>3D globe</button>
                  </div>
                </div>

                {mapDisplayMode === 'map' ? (
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
                ) : (
                  <div className="glass-panel-elevated rounded-3xl border border-white/15 overflow-hidden p-2 sm:p-4">
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
                      <AiInsightsCard
                        data={weatherData}
                        onOpenAssistant={() => handleOpenAssistant()}
                      />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4 sm:gap-5 items-start">
                      <HourlyForecast
                        hourly={weatherData.weather.hourly}
                        unit={unit}
                        currentTime={weatherData.weather.current.time}
                      />
                      <WeatherDetailsGrid data={weatherData} unit={unit} />
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
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-600 to-purple-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-2xl shadow-sky-500/40 border border-sky-300/40 transition transform hover:scale-105 group backdrop-blur-md"
          title="Open RODEX AI Voice & Chat"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-sky-200 group-hover:rotate-12 transition-transform" />
            <Mic className="w-3 h-3 text-amber-300 absolute -bottom-1 -right-1" />
          </div>
          <span>RODEX AI (Voice & Chat)</span>
        </button>
      </aside>
      )}

      {/* RODEX AI Live Voice & Text Assistant Modal */}
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

      {/* Mobile Responsive Navigation Dock */}
      <MobileNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAssistant={() => handleOpenAssistant()}
        onOpenAlerts={() => setIsAlertsModalOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        activeAlertsCount={weatherData?.alerts?.length || 0}
      />
    </div>
  );
}
