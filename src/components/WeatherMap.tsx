import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { WeatherData, LocationMode } from '../types';
import { 
  MapPin, 
  Navigation, 
  Layers, 
  Thermometer, 
  CloudRain, 
  Wind, 
  Search, 
  Sparkles, 
  Clock, 
  Maximize2, 
  Minimize2, 
  RefreshCw, 
  Globe, 
  Compass, 
  CheckCircle2 
} from 'lucide-react';
import { getWeatherCondition, formatTemp, formatWind } from '../utils/weatherUtils';

interface WeatherMapProps {
  currentWeatherData: WeatherData | null;
  deviceLocationData: WeatherData | null;
  unit: 'C' | 'F';
  onSelectCoordinates: (lat: number, lon: number, name: string) => void;
  onOpenAssistant: (prompt?: string) => void;
  locationMode: LocationMode;
  onMapContextChange?: (location: WeatherData | null, layer: 'temperature' | 'precipitation' | 'wind') => void;
}

type MapMetric = 'temperature' | 'precipitation' | 'wind';

interface RegionalPoint {
  name: string;
  country: string;
  lat: number;
  lon: number;
  weather?: WeatherData;
  isLoading?: boolean;
}

// Major strategic global/regional hub points for spatial exploration
const DEFAULT_HUB_POINTS: { name: string; country: string; lat: number; lon: number }[] = [
  { name: 'Kampala', country: 'Uganda', lat: 0.3163, lon: 32.5822 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
  { name: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
  { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
  { name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
  { name: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050 },
  { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060 },
  { name: 'Sao Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333 },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 }
];

export const WeatherMap: React.FC<WeatherMapProps> = ({
  currentWeatherData,
  deviceLocationData,
  unit,
  onSelectCoordinates,
  onOpenAssistant,
  locationMode,
  onMapContextChange
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeMetric, setActiveMetric] = useState<MapMetric>('temperature');
  const [timeOffsetHours, setTimeOffsetHours] = useState<number>(0);
  const [mapSearchTerm, setMapSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [inspectedLocation, setInspectedLocation] = useState<{
    lat: number;
    lon: number;
    weather?: WeatherData;
    isLoading: boolean;
  } | null>(null);

  // Cached regional weather data
  const [hubWeatherMap, setHubWeatherMap] = useState<Record<string, WeatherData>>({});

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = currentWeatherData?.location.latitude || 0.3163;
      const initialLon = currentWeatherData?.location.longitude || 32.5822;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLon],
        zoom: currentWeatherData ? 7 : 4,
        zoomControl: false,
        attributionControl: true
      });

      // Keyless, public, zero-credential base map tiles (OpenFreeMap / OpenStreetMap)
      const primaryTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      const fallbackTileUrl = 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.png';

      const tileLayer = L.tileLayer(primaryTileUrl, {
        attribution: '&copy; <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: 'map-dark-tiles'
      });

      tileLayer.on('tileerror', () => {
        console.warn('Map tile load warning, switching to keyless fallback tile layer.');
        tileLayer.setUrl(fallbackTileUrl);
      });

      tileLayer.addTo(map);

      // Add zoom control top right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Markers layer group
      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;

      // Handle map click for dynamic inspection
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        handleInspectCoordinates(lat, lng);
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Recenter map when main selected location changes
  useEffect(() => {
    if (mapInstanceRef.current && currentWeatherData) {
      const { latitude, longitude } = currentWeatherData.location;
      mapInstanceRef.current.flyTo([latitude, longitude], 8, {
        duration: 1.2
      });
    }
  }, [currentWeatherData?.location.latitude, currentWeatherData?.location.longitude]);

  // Fetch background weather data for global/regional hub points to show real weather tags on map
  useEffect(() => {
    let isMounted = true;
    
    const fetchHubData = async () => {
      // Limit concurrent requests to avoid server spam
      const sampleHubs = DEFAULT_HUB_POINTS.slice(0, 8);
      
      for (const hub of sampleHubs) {
        const key = `${hub.lat.toFixed(2)},${hub.lon.toFixed(2)}`;
        if (hubWeatherMap[key]) continue; // Already cached

        try {
          const res = await fetch(`/api/weather/coordinates?lat=${hub.lat}&lon=${hub.lon}&name=${encodeURIComponent(hub.name)}`);
          if (res.ok) {
            const data: WeatherData = await res.json();
            if (isMounted) {
              setHubWeatherMap(prev => ({ ...prev, [key]: data }));
            }
          }
        } catch (e) {
          console.warn('Hub weather fetch error:', e);
        }
      }
    };

    fetchHubData();
    return () => { isMounted = false; };
  }, []);

  // Dynamic map click inspection helper
  const handleInspectCoordinates = async (lat: number, lon: number) => {
    setInspectedLocation({ lat, lon, isLoading: true });

    try {
      const res = await fetch(`/api/weather/coordinates?lat=${lat}&lon=${lon}&name=Map%20Point`);
      if (res.ok) {
        const data: WeatherData = await res.json();
        setInspectedLocation({ lat, lon, weather: data, isLoading: false });
        onMapContextChange?.(data, activeMetric);
      } else {
        setInspectedLocation(null);
      }
    } catch (err) {
      console.error('Map inspect error:', err);
      setInspectedLocation(null);
    }
  };

  // Render HTML Markers on Map based on currentWeatherData, deviceLocationData, hubWeatherMap, inspectedLocation, timeOffsetHours, activeMetric
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;

    const markersGroup = markersGroupRef.current;
    markersGroup.clearLayers();

    // Color helper according to temperature
    const getTempColor = (celsius: number) => {
      if (celsius <= 0) return 'from-blue-600 to-indigo-700 text-white border-blue-400';
      if (celsius <= 15) return 'from-cyan-500 to-teal-600 text-white border-cyan-300';
      if (celsius <= 24) return 'from-emerald-500 to-green-600 text-white border-emerald-300';
      if (celsius <= 32) return 'from-amber-500 to-orange-600 text-white border-amber-300';
      return 'from-rose-500 to-red-600 text-white border-rose-300';
    };

    // Helper to extract weather value at chosen time offset
    const getWeatherValueAtOffset = (weather: WeatherData) => {
      if (timeOffsetHours === 0) {
        return {
          temp: weather.weather.current.temperature_2m,
          precipProb: weather.weather.hourly.precipitation_probability[0] || 0,
          windSpeed: weather.weather.current.wind_speed_10m,
          code: weather.weather.current.weather_code,
          isDay: weather.weather.current.is_day
        };
      } else {
        const hourlyIndex = Math.min(timeOffsetHours, weather.weather.hourly.time.length - 1);
        return {
          temp: weather.weather.hourly.temperature_2m[hourlyIndex] ?? weather.weather.current.temperature_2m,
          precipProb: weather.weather.hourly.precipitation_probability[hourlyIndex] ?? 0,
          windSpeed: weather.weather.current.wind_speed_10m,
          code: weather.weather.hourly.weather_code[hourlyIndex] ?? weather.weather.current.weather_code,
          isDay: weather.weather.hourly.is_day[hourlyIndex] ?? 1
        };
      }
    };

    // 1. Render Main Active Selected Location
    if (currentWeatherData) {
      const { latitude, longitude, name, country } = currentWeatherData.location;
      const val = getWeatherValueAtOffset(currentWeatherData);
      const cond = getWeatherCondition(val.code, val.isDay);
      const tempDisplay = formatTemp(val.temp, unit);

      let metricBadge = tempDisplay;
      if (activeMetric === 'precipitation') metricBadge = `${val.precipProb}% rain`;
      if (activeMetric === 'wind') metricBadge = formatWind(val.windSpeed, unit);

      const html = `
        <div class="relative group cursor-pointer animate-pulse-glow">
          <div class="px-3 py-1.5 rounded-2xl bg-gradient-to-r ${getTempColor(val.temp)} border-2 shadow-2xl flex items-center gap-2 transform transition duration-300 hover:scale-110">
            <span class="w-2.5 h-2.5 rounded-full bg-sky-300 animate-ping"></span>
            <div class="flex flex-col text-left leading-tight">
              <span class="text-[10px] uppercase font-black tracking-wider opacity-90">${name}</span>
              <span class="text-xs font-black tabular-nums">${metricBadge}</span>
            </div>
            <span class="text-sm">${cond.icon}</span>
          </div>
          <div class="w-3 h-3 bg-sky-400 rotate-45 mx-auto -mt-1 shadow-md"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html,
        iconSize: [120, 45],
        iconAnchor: [60, 45]
      });

      const marker = L.marker([latitude, longitude], { icon: customIcon });
      marker.bindPopup(`
        <div class="p-3 space-y-2 min-w-[200px]">
          <div class="flex items-center justify-between border-b border-white/10 pb-2">
            <div>
              <div class="text-sm font-black text-white">${name}</div>
              <div class="text-[11px] text-sky-200">${country}</div>
            </div>
            <span class="text-xl">${cond.icon}</span>
          </div>
          <div class="text-xs text-slate-300 space-y-1 font-medium">
            <div class="flex justify-between"><span>Temperature:</span><strong class="text-white">${tempDisplay}</strong></div>
            <div class="flex justify-between"><span>Condition:</span><strong class="text-sky-300">${cond.label}</strong></div>
            <div class="flex justify-between"><span>Rain Chance:</span><strong class="text-white">${val.precipProb}%</strong></div>
            <div class="flex justify-between"><span>Wind:</span><strong class="text-white">${formatWind(val.windSpeed, unit)}</strong></div>
          </div>
          <div class="text-[10px] px-2 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 font-semibold text-center mt-2">
            ★ Active Selected Weather Location
          </div>
        </div>
      `);
      markersGroup.addLayer(marker);
    }

    // 2. Render Device GPS Location Marker (if distinct from current location)
    if (deviceLocationData && currentWeatherData && 
       (Math.abs(deviceLocationData.location.latitude - currentWeatherData.location.latitude) > 0.05 ||
        Math.abs(deviceLocationData.location.longitude - currentWeatherData.location.longitude) > 0.05)) {
      
      const { latitude, longitude, name } = deviceLocationData.location;
      const val = getWeatherValueAtOffset(deviceLocationData);
      const tempDisplay = formatTemp(val.temp, unit);

      const html = `
        <div class="relative group cursor-pointer">
          <div class="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-emerald-400 text-emerald-300 shadow-lg flex items-center gap-1.5 text-xs font-bold">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>GPS: ${tempDisplay}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker-gps',
        html,
        iconSize: [90, 30],
        iconAnchor: [45, 30]
      });

      const gpsMarker = L.marker([latitude, longitude], { icon: customIcon });
      gpsMarker.bindPopup(`
        <div class="p-2 space-y-2">
          <div class="text-xs font-bold text-emerald-300">Your Device GPS Location (${name})</div>
          <button id="btn-select-gps" class="w-full text-center px-2 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition">
            Switch to My GPS Location
          </button>
        </div>
      `);
      
      gpsMarker.on('popupopen', () => {
        const btn = document.getElementById('btn-select-gps');
        if (btn) {
          btn.onclick = () => {
            onSelectCoordinates(latitude, longitude, name);
          };
        }
      });

      markersGroup.addLayer(gpsMarker);
    }

    // 3. Render Hub Points
    DEFAULT_HUB_POINTS.forEach(hub => {
      // Skip if close to currentWeatherData
      if (currentWeatherData && 
          Math.abs(hub.lat - currentWeatherData.location.latitude) < 0.2 && 
          Math.abs(hub.lon - currentWeatherData.location.longitude) < 0.2) {
        return;
      }

      const key = `${hub.lat.toFixed(2)},${hub.lon.toFixed(2)}`;
      const hubData = hubWeatherMap[key];

      let tempTag = '--';
      let iconTag = '📍';
      let code = 0;
      let isDay = 1;
      let windSpeed = 10;
      let precipProb = 0;

      if (hubData) {
        const val = getWeatherValueAtOffset(hubData);
        const cond = getWeatherCondition(val.code, val.isDay);
        tempTag = formatTemp(val.temp, unit);
        iconTag = cond.icon;
        code = val.code;
        isDay = val.isDay;
        windSpeed = val.windSpeed;
        precipProb = val.precipProb;
      }

      let metricBadge = tempTag;
      if (activeMetric === 'precipitation') metricBadge = `${precipProb}%`;
      if (activeMetric === 'wind') metricBadge = formatWind(windSpeed, unit);

      const html = `
        <div class="group cursor-pointer">
          <div class="px-2 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/20 text-sky-200 shadow-md flex items-center gap-1 text-[11px] font-semibold transition transform hover:scale-110">
            <span>${hub.name}</span>
            <span class="font-bold text-white tabular-nums">${metricBadge}</span>
            <span class="text-xs">${iconTag}</span>
          </div>
        </div>
      `;

      const hubIcon = L.divIcon({
        className: 'custom-leaflet-marker-hub',
        html,
        iconSize: [100, 28],
        iconAnchor: [50, 28]
      });

      const marker = L.marker([hub.lat, hub.lon], { icon: hubIcon });
      marker.bindPopup(`
        <div class="p-3 space-y-2 min-w-[180px]">
          <div class="text-sm font-bold text-white flex items-center justify-between">
            <span>${hub.name}</span>
            <span class="text-xs text-sky-300 font-normal">${hub.country}</span>
          </div>
          <div class="text-xs text-slate-300 space-y-1 font-medium">
            <div class="flex justify-between"><span>Temp:</span><strong class="text-white">${tempTag}</strong></div>
            <div class="flex justify-between"><span>Rain:</span><strong class="text-white">${precipProb}%</strong></div>
            <div class="flex justify-between"><span>Wind:</span><strong class="text-white">${formatWind(windSpeed, unit)}</strong></div>
          </div>
          <button id="btn-select-hub-${hub.name.replace(/\s+/g, '-')}" class="w-full mt-2 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition shadow">
            View ${hub.name} Full Forecast
          </button>
        </div>
      `);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-select-hub-${hub.name.replace(/\s+/g, '-')}`);
        if (btn) {
          btn.onclick = () => {
            onSelectCoordinates(hub.lat, hub.lon, hub.name);
          };
        }
      });

      markersGroup.addLayer(marker);
    });

    // 4. Render Inspected Location Marker if user clicked somewhere on map
    if (inspectedLocation) {
      const { lat, lon, weather, isLoading } = inspectedLocation;
      
      const html = `
        <div class="relative animate-bounce">
          <div class="w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-base shadow-2xl border-2 border-white">
            📍
          </div>
        </div>
      `;

      const inspectIcon = L.divIcon({
        className: 'custom-leaflet-marker-inspect',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      const inspectMarker = L.marker([lat, lon], { icon: inspectIcon });

      if (isLoading) {
        inspectMarker.bindPopup(`
          <div class="p-3 text-xs text-sky-200 flex items-center gap-2">
            <div class="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"></div>
            <span>Fetching live weather for coordinates...</span>
          </div>
        `).openPopup();
      } else if (weather) {
        const val = getWeatherValueAtOffset(weather);
        const cond = getWeatherCondition(val.code, val.isDay);
        const name = weather.location.name;
        const country = weather.location.country;

        inspectMarker.bindPopup(`
          <div class="p-3 space-y-2 min-w-[200px]">
            <div class="flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <div class="text-sm font-bold text-amber-300">Inspected Point</div>
                <div class="text-xs font-semibold text-white">${name}${country ? ', ' + country : ''}</div>
              </div>
              <span class="text-xl">${cond.icon}</span>
            </div>
            <div class="text-xs text-slate-300 space-y-1 font-medium">
              <div class="flex justify-between"><span>Temperature:</span><strong class="text-white">${formatTemp(val.temp, unit)}</strong></div>
              <div class="flex justify-between"><span>Condition:</span><strong class="text-sky-300">${cond.label}</strong></div>
              <div class="flex justify-between"><span>Rain Chance:</span><strong class="text-white">${val.precipProb}%</strong></div>
              <div class="flex justify-between"><span>Wind:</span><strong class="text-white">${formatWind(val.windSpeed, unit)}</strong></div>
            </div>
            <button id="btn-select-inspected" class="w-full mt-2 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow">
              Set as Active Weather Location
            </button>
            <button id="btn-ai-inspected" class="w-full py-1 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 font-semibold text-[11px] border border-sky-400/30 flex items-center justify-center gap-1 transition">
              <span>Ask RODEX AI about this spot</span>
            </button>
          </div>
        `).openPopup();

        inspectMarker.on('popupopen', () => {
          const btnSelect = document.getElementById('btn-select-inspected');
          if (btnSelect) {
            btnSelect.onclick = () => {
              onSelectCoordinates(lat, lon, name);
              setInspectedLocation(null);
            };
          }
          const btnAi = document.getElementById('btn-ai-inspected');
          if (btnAi) {
            btnAi.onclick = () => {
              onOpenAssistant(`Tell me about the atmospheric weather conditions and forecast around ${name} (${lat.toFixed(2)}°, ${lon.toFixed(2)}°).`);
            };
          }
        });
      }

      markersGroup.addLayer(inspectMarker);
    }

  }, [
    currentWeatherData,
    deviceLocationData,
    hubWeatherMap,
    inspectedLocation,
    unit,
    activeMetric,
    timeOffsetHours
  ]);

  // Recenter to Current Active Location
  const handleRecenterActive = () => {
    if (mapInstanceRef.current && currentWeatherData) {
      const { latitude, longitude } = currentWeatherData.location;
      mapInstanceRef.current.flyTo([latitude, longitude], 9, { duration: 1 });
    }
  };

  // Recenter to Device GPS Location
  const handleRecenterGPS = () => {
    if (mapInstanceRef.current && deviceLocationData) {
      const { latitude, longitude } = deviceLocationData.location;
      mapInstanceRef.current.flyTo([latitude, longitude], 11, { duration: 1 });
    }
  };

  // Map Search Submit
  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapSearchTerm.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/weather/geocoding-search?q=${encodeURIComponent(mapSearchTerm.trim())}`);
      const data = await res.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        setSearchResults(data.results);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={`w-full transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-4' : 'relative my-6'}`}>
      <div className={`w-full rounded-3xl overflow-hidden border border-white/20 bg-slate-900/90 backdrop-blur-2xl shadow-2xl flex flex-col ${isFullscreen ? 'h-full' : 'h-[550px] sm:h-[620px]'}`}>
        
        {/* Map Header Controls Toolbar */}
        <div className="p-4 bg-slate-900/95 border-b border-white/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 z-10">
          
          {/* Left: Metric Layers Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-bold text-sky-200/70 mr-1 flex items-center gap-1 shrink-0 font-heading">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Layer:</span>
            </span>

            <button
              onClick={() => {
                setActiveMetric('temperature');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'temperature');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift ${
                activeMetric === 'temperature'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30 border border-sky-300/40'
                  : 'bg-white/10 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temperature</span>
            </button>

            <button
              onClick={() => {
                setActiveMetric('precipitation');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'precipitation');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift ${
                activeMetric === 'precipitation'
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 border border-blue-300/40'
                  : 'bg-white/10 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5" />
              <span>Rain Chance</span>
            </button>

            <button
              onClick={() => {
                setActiveMetric('wind');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'wind');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift ${
                activeMetric === 'wind'
                  ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30 border border-teal-300/40'
                  : 'bg-white/10 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Wind Speed</span>
            </button>
          </div>

          {/* Right: Map Quick Controls & Search */}
          <div className="flex items-center gap-2">
            
            {/* Inline Map Location Search */}
            <form onSubmit={handleMapSearch} className="relative flex-1 md:w-56">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-sky-300 pointer-events-none" />
              <input
                type="text"
                value={mapSearchTerm}
                onChange={(e) => setMapSearchTerm(e.target.value)}
                placeholder="Jump map to city..."
                className="w-full pl-8 pr-3 py-1.5 bg-white/10 hover:bg-white/15 focus:bg-slate-900 text-white text-xs rounded-xl border border-white/20 focus:border-sky-400 focus:outline-none transition"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/20 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto">
                  {searchResults.map((city) => (
                    <button
                      key={`${city.name}-${city.lat}-${city.lon}`}
                      type="button"
                      onClick={() => {
                        if (mapInstanceRef.current) {
                          mapInstanceRef.current.flyTo([city.lat, city.lon], 10, { duration: 1 });
                          handleInspectCoordinates(city.lat, city.lon);
                        }
                        setSearchResults([]);
                        setMapSearchTerm('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-white flex justify-between items-center border-b border-white/5 last:border-0"
                    >
                      <span className="font-semibold text-sky-300">{city.name}</span>
                      <span className="text-[10px] text-white/50">{city.country}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Recenter Active City Button */}
            <button
              onClick={handleRecenterActive}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-sky-300 border border-white/15 transition btn-hover-lift"
              title="Center Map on Selected Active City"
            >
              <Compass className="w-4 h-4" />
            </button>

            {/* Recenter Device GPS Button */}
            <button
              onClick={handleRecenterGPS}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-300 border border-white/15 transition btn-hover-lift"
              title="Center Map on My GPS Device Location"
            >
              <Navigation className="w-4 h-4" />
            </button>

            {/* Toggle Fullscreen Map View */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition btn-hover-lift"
              title={isFullscreen ? 'Exit Fullscreen Map' : 'Expand Fullscreen Map'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

        </div>

        {/* Map Canvas Container */}
        <div className="relative flex-1 w-full h-full">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Floating Time Forecast Offset Slider Overlay */}
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-900/90 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-2xl z-10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-200 flex items-center gap-1.5 font-heading">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Forecast Offset</span>
              </span>
              <span className="font-black text-amber-300 tabular-nums">
                {timeOffsetHours === 0 ? 'Live Current Conditions' : `+${timeOffsetHours} Hours Forecast`}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={24}
              step={3}
              value={timeOffsetHours}
              onChange={(e) => setTimeOffsetHours(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
            />

            <div className="flex justify-between text-[10px] text-white/50 font-medium">
              <span>Now</span>
              <span>+6h</span>
              <span>+12h</span>
              <span>+18h</span>
              <span>+24h</span>
            </div>
          </div>

          {/* Interactive Map Hint Banner (Top Left inside canvas) */}
          <div className="absolute top-4 left-4 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/15 text-xs text-sky-200 shadow-xl pointer-events-none z-10">
            <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-pulse" />
            <span>Tap anywhere on the map to inspect live weather for coordinates</span>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-slate-950/90 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/60 gap-2 z-10">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>Map Tile Data: OpenFreeMap / OpenStreetMap (No API key required)</span>
          </div>
          <button
            onClick={() => onOpenAssistant(`Give me an overview of weather patterns across the map near ${currentWeatherData?.location.name || 'my location'}.`)}
            className="text-sky-300 hover:text-sky-200 font-bold flex items-center gap-1 transition"
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Ask RODEX AI to analyze map region</span>
          </button>
        </div>

      </div>
    </div>
  );
};
