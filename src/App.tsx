import React, { useState, useEffect } from 'react';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { Header } from './components/Header';
import { CurrentWeatherCard } from './components/CurrentWeatherCard';
import { AiInsightsCard } from './components/AiInsightsCard';
import { HourlyForecast } from './components/HourlyForecast';
import { WeeklyForecast } from './components/WeeklyForecast';
import { WeatherDetailsGrid } from './components/WeatherDetailsGrid';
import { WeatherData } from './types';
import { getWeatherCondition } from './utils/weatherUtils';
import { AlertCircle, RefreshCw, CloudSun, ShieldCheck, KeyRound } from 'lucide-react';

export default function App() {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);

  // Fetch live weather by search query
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
          throw new Error(data.error || 'City not found');
        }
        return;
      }
      setWeatherData(data);
    } catch (err: any) {
      console.error('Search error:', err);
      setErrorMessage(err.message || 'Could not fetch live weather from providers.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch live weather by coordinates
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
    } catch (err: any) {
      console.error('Coordinates error:', err);
      setErrorMessage('Failed to fetch live weather data. Please check your connection or configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load: Fetch live weather for London by default
  useEffect(() => {
    handleSearch('London');
  }, []);

  // Get current GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleSelectCoordinates(latitude, longitude, 'My Location');
      },
      (error) => {
        setIsLoading(false);
        console.warn('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage('Location permission was denied. Please search for your city manually using the search bar.');
        } else {
          setErrorMessage('Unable to retrieve your location. Please try searching manually.');
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const currentTheme = weatherData 
    ? getWeatherCondition(weatherData.weather.current.weather_code, weatherData.weather.current.is_day).theme
    : 'sunny';

  return (
    <div className="min-h-screen text-white font-sans selection:bg-sky-500 selection:text-white pb-16">
      {/* Continuous atmospheric background across the entire app */}
      <AtmosphericBackground theme={currentTheme} />

      {/* Header */}
      <Header
        onSearch={handleSearch}
        onSelectCoordinates={handleSelectCoordinates}
        onGetCurrentLocation={handleGetCurrentLocation}
        unit={unit}
        onToggleUnit={() => setUnit(u => (u === 'C' ? 'F' : 'C'))}
        isLoading={isLoading}
        currentLocationName={weatherData?.location.name || (setupRequired ? 'Setup Required' : 'Loading Live Weather...')}
      />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        
        {/* Weather Provider Attribution & Disclaimer Banner */}
        {weatherData && weatherData.providerInfo && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 rounded-2xl bg-sky-500/10 border border-sky-400/20 backdrop-blur-md text-xs text-sky-200 gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-semibold text-white">{weatherData.providerInfo.credit}</span>
              <span className="text-white/40">•</span>
              <span className="text-sky-200/80">{weatherData.providerInfo.disclaimer}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-medium">
              Multi-Provider Router Active
            </span>
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
              onClick={() => handleSearch('London')}
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
            <p className="text-base font-semibold text-sky-200">Routing request through weather provider network...</p>
          </div>
        )}

        {weatherData && !setupRequired && (
          <>
            {/* Hero Current Weather */}
            <CurrentWeatherCard data={weatherData} unit={unit} />

            {/* AI Atmospheric Insights */}
            <AiInsightsCard data={weatherData} />

            {/* Hourly Forecast */}
            <HourlyForecast hourly={weatherData.weather.hourly} unit={unit} />

            {/* Details Grid (Sunrise, Wind, Pressure) */}
            <WeatherDetailsGrid data={weatherData} unit={unit} />

            {/* 7-Day Weekly Forecast */}
            <WeeklyForecast daily={weatherData.weather.daily} unit={unit} />
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-white/50 gap-4">
        <div>
          RODEX Atmos — Advanced Weather Intelligence & Atmospheric Forecasting.
        </div>
        <div className="flex items-center gap-4">
          <span>Active Provider: <strong className="text-white">{weatherData?.providerInfo?.name || 'Multi-Router'}</strong></span>
          <span>•</span>
          <span>AI Insights: Google Gemini</span>
        </div>
      </footer>
    </div>
  );
}
