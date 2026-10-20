import React, { useState, useEffect } from 'react';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { Header } from './components/Header';
import { CurrentWeatherCard } from './components/CurrentWeatherCard';
import { AiInsightsCard } from './components/AiInsightsCard';
import { HourlyForecast } from './components/HourlyForecast';
import { WeeklyForecast } from './components/WeeklyForecast';
import { WeatherDetailsGrid } from './components/WeatherDetailsGrid';
import { WeatherData } from './types';
import { SAMPLE_WEATHER_DATA, getWeatherCondition } from './utils/weatherUtils';
import { AlertCircle, RefreshCw, SearchX, MapPinOff } from 'lucide-react';

export default function App() {
  const [weatherData, setWeatherData] = useState<WeatherData>(SAMPLE_WEATHER_DATA);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // Fetch weather by search query
  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setLocationNotice(null);
    try {
      const res = await fetch(`/api/weather/search?query=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'City not found');
      }
      const data: WeatherData = await res.json();
      setWeatherData(data);
    } catch (err: any) {
      console.error('Search error:', err);
      setErrorMessage(err.message || 'Could not find weather for this location.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch weather by coordinates
  const handleSelectCoordinates = async (lat: number, lon: number, name: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setLocationNotice(null);
    try {
      const res = await fetch(`/api/weather/coordinates?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error('Failed to fetch weather');
      const data: WeatherData = await res.json();
      setWeatherData(data);
    } catch (err: any) {
      console.error('Coordinates error:', err);
      setErrorMessage('Failed to fetch live weather data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get current GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setLocationNotice(null);

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

  const currentTheme = getWeatherCondition(
    weatherData.weather.current.weather_code,
    weatherData.weather.current.is_day
  ).theme;

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
        isSampleData={weatherData.source === 'sample'}
        isLoading={isLoading}
        currentLocationName={weatherData.location.name}
      />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        
        {/* Error Banner if any */}
        {errorMessage && (
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

        {/* Loading Overlay or Spinner State */}
        {isLoading && (
          <div className="w-full py-12 flex flex-col items-center justify-center gap-3 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-sm font-medium text-sky-200">Synchronizing atmospheric data...</p>
          </div>
        )}

        {!isLoading && (
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
          <span>Data provided by Open-Meteo & Gemini AI</span>
          <span>•</span>
          <span>Configured for Live Weather</span>
        </div>
      </footer>
    </div>
  );
}
