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
  Globe, 
  Compass, 
} from 'lucide-react';
import { getWeatherCondition, formatTemp, formatWind, findHourlyIndexForOffset } from '../utils/weatherUtils';

interface WeatherMapProps {
  currentWeatherData: WeatherData | null;
  deviceLocationData: WeatherData | null;
  unit: 'C' | 'F';
  onSelectCoordinates: (lat: number, lon: number, name: string) => void;
  onOpenAssistant: (prompt?: string) => void;
  locationMode: LocationMode;
  onMapContextChange?: (location: WeatherData | null, layer: 'temperature' | 'precipitation' | 'wind') => void;
  onGetCurrentLocation?: () => void;
}

type MapMetric = 'temperature' | 'precipitation' | 'wind';

interface GeocodingResult {
  name: string;
  country: string;
  admin1?: string;
  lat: number;
  lon: number;
  timezone?: string;
}

function escapeMapHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const WeatherMap: React.FC<WeatherMapProps> = ({
  currentWeatherData,
  deviceLocationData,
  unit,
  onSelectCoordinates,
  onOpenAssistant,
  locationMode,
  onMapContextChange,
  onGetCurrentLocation
}) => {
  const [activeMetric, setActiveMetric] = useState<MapMetric>('temperature');
  const [timeOffsetHours, setTimeOffsetHours] = useState<number>(0);
  const [mapSearchTerm, setMapSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSliderOpen, setIsSliderOpen] = useState<boolean>(false);
  const [inspectedLocation, setInspectedLocation] = useState<{
    lat: number;
    lon: number;
    weather?: WeatherData;
    isLoading: boolean;
  } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const inspectAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const activeMetricRef = useRef<MapMetric>(activeMetric);
  const mapContextChangeRef = useRef(onMapContextChange);
  activeMetricRef.current = activeMetric;
  mapContextChangeRef.current = onMapContextChange;

  // Initialize a familiar, labelled street map once and handle container resizes.
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const lat = currentWeatherData?.location.latitude ?? 0.3163;
    const lon = currentWeatherData?.location.longitude ?? 32.5822;
    const map = L.map(mapContainerRef.current, {
      center: [lat, lon], zoom: currentWeatherData ? 7 : 4,
      zoomControl: false, attributionControl: true, preferCanvas: true,
      zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true
    });

    const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const cartoKey = import.meta.env.VITE_CARTO_API_KEY as string | undefined;
    const hasCartoKey = Boolean(cartoKey && cartoKey.trim().length > 0);
    const cartoUrl = hasCartoKey
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(cartoKey!.trim())
      : '';
    const attribution = hasCartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

    // CARTO requires a key. Default to the standard OSM street map when no key is configured.
    const tiles = L.tileLayer(hasCartoKey ? cartoUrl : osmUrl, {
      attribution,
      ...(hasCartoKey ? { subdomains: 'abcd' } : {}),
      maxZoom: 19,
      maxNativeZoom: 19,
      keepBuffer: 2,
      updateWhenIdle: true,
      updateWhenZooming: false,
      crossOrigin: true
    }).addTo(map);

    let tileErrors = 0;
    let usingOsmFallback = !hasCartoKey;
    tiles.on('tileerror', () => {
      tileErrors += 1;
      if (hasCartoKey && !usingOsmFallback && tileErrors >= 3) {
        usingOsmFallback = true;
        console.warn('[RODEX Atmos Map] CARTO tiles unavailable; switching to OpenStreetMap tiles.');
        tiles.setUrl(osmUrl);
      }
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 110 }).addTo(map);
    markersGroupRef.current = L.layerGroup().addTo(map);

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      void handleInspectCoordinates(event.latlng.lat, event.latlng.lng);
    };
    map.on('click', handleMapClick);
    mapInstanceRef.current = map;

    const invalidateSize = () => {
      if (mapInstanceRef.current === map) map.invalidateSize({ pan: false, debounceMoveend: true });
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidateSize) : null;
    observer?.observe(mapContainerRef.current);
    window.addEventListener('resize', invalidateSize, { passive: true });
    window.requestAnimationFrame(invalidateSize);

    return () => {
      window.removeEventListener('resize', invalidateSize);
      observer?.disconnect();
      map.off('click', handleMapClick);
      inspectAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      map.remove();
      if (mapInstanceRef.current === map) mapInstanceRef.current = null;
      markersGroupRef.current = null;
    };
  }, []);
  // Recenter map when main selected location changes
  useEffect(() => {
    if (mapInstanceRef.current && currentWeatherData) {
      const { latitude, longitude } = currentWeatherData.location;
      mapInstanceRef.current.flyTo([latitude, longitude], 12, { duration: 0.8 });
      mapInstanceRef.current.invalidateSize({ pan: false });
    }
  }, [currentWeatherData?.location.latitude, currentWeatherData?.location.longitude]);

  // Cancel stale point requests so rapid map clicks never show outdated results.
  const handleInspectCoordinates = async (lat: number, lon: number, placeName?: string) => {
    inspectAbortRef.current?.abort();
    const controller = new AbortController();
    inspectAbortRef.current = controller;
    setInspectedLocation({ lat, lon, isLoading: true });
    try {
      const params = new URLSearchParams({
        lat: String(lat), lon: String(lon), name: placeName?.trim() || 'Current Location'
      });
      const response = await fetch('/api/weather/coordinates?' + params.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error('Weather lookup failed (' + response.status + ')');
      const data: WeatherData = await response.json();
      if (controller.signal.aborted) return;
      setInspectedLocation({ lat, lon, weather: data, isLoading: false });
      mapContextChangeRef.current?.(data, activeMetricRef.current);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn('[RODEX Atmos Map] Point lookup failed:', error);
      setInspectedLocation(null);
    } finally {
      if (inspectAbortRef.current === controller) inspectAbortRef.current = null;
    }
  };

  // Render the selected location, device position and the currently inspected map point
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
        const currentHourIndex = findHourlyIndexForOffset(
          weather.weather.hourly.time,
          weather.weather.current.time,
          0
        );
        return {
          temp: weather.weather.current.temperature_2m,
          precipProb: weather.weather.hourly.precipitation_probability[currentHourIndex] ?? 0,
          windSpeed: weather.weather.current.wind_speed_10m,
          code: weather.weather.current.weather_code,
          isDay: weather.weather.current.is_day
        };
      } else {
        const hourlyIndex = findHourlyIndexForOffset(weather.weather.hourly.time, weather.weather.current.time, timeOffsetHours);
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
      const safeName = escapeMapHtml(name);
      const safeCountry = escapeMapHtml(country);
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
              <span class="text-[10px] uppercase font-black tracking-wider opacity-90">${safeName}</span>
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
              <div class="text-sm font-black text-white">${safeName}</div>
              <div class="text-[11px] text-sky-200">${safeCountry}</div>
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
      const safeName = escapeMapHtml(name);
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
          <div class="text-xs font-bold text-emerald-300">Your Device GPS Location (${safeName})</div>
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
        const safeName = escapeMapHtml(name);
        const safeCountry = escapeMapHtml(country);

        inspectMarker.bindPopup(`
          <div class="p-3 space-y-2 min-w-[200px]">
            <div class="flex items-center justify-between border-b border-white/10 pb-2">
              <div>
                <div class="text-sm font-bold text-amber-300">Inspected Point</div>
                <div class="text-xs font-semibold text-white">${safeName}${safeCountry ? ', ' + safeCountry : ''}</div>
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
      mapInstanceRef.current.flyTo([latitude, longitude], 14, { duration: 0.8 });
    } else {
      onGetCurrentLocation?.();
    }
  };

  // Abort previous place lookups when a new search is submitted.
  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = mapSearchTerm.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch('/api/weather/geocoding-search?q=' + encodeURIComponent(query), {
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Place search failed (' + response.status + ')');
      const data = await response.json();
      if (!controller.signal.aborted) setSearchResults(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('[RODEX Atmos Map] Place search failed:', error);
        setSearchResults([]);
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setIsSearching(false);
      }
    }
  };

  return (
    <div className={`wx-map-root w-full transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 bg-[#E8E5F5] p-2 sm:p-4' : 'relative my-6'}`}>
      <div className={`wx-map-card w-full rounded-3xl overflow-hidden border border-violet-200/50 bg-[#F4F0FF] shadow-2xl flex flex-col ${isFullscreen ? 'h-full' : 'h-[500px] sm:h-[620px]'}`}>
        
        {/* Map Header Controls Toolbar */}
        <div className="wx-map-toolbar p-3 sm:p-4 border-b border-violet-200 flex flex-wrap items-center justify-between gap-2.5 z-10">
          
          {/* Left: Metric Layers Tabs */}
          <div className="wx-map-layer-controls flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
            <span className="text-xs font-bold text-sky-200/70 mr-1 hidden sm:flex items-center gap-1 shrink-0 font-heading">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Layer:</span>
            </span>

            <button
              onClick={() => {
                setActiveMetric('temperature');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'temperature');
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift min-h-[36px] ${
                activeMetric === 'temperature'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30 border border-sky-300/40'
                  : 'bg-white/8 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Temp</span>
            </button>

            <button
              onClick={() => {
                setActiveMetric('precipitation');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'precipitation');
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift min-h-[36px] ${
                activeMetric === 'precipitation'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30 border border-blue-300/40'
                  : 'bg-white/8 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5" />
              <span>Rain</span>
            </button>

            <button
              onClick={() => {
                setActiveMetric('wind');
                onMapContextChange?.(inspectedLocation?.weather || currentWeatherData, 'wind');
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 btn-hover-lift min-h-[36px] ${
                activeMetric === 'wind'
                  ? 'bg-teal-500 text-white shadow-md shadow-teal-500/30 border border-teal-300/40'
                  : 'bg-white/8 hover:bg-white/15 text-sky-200 border border-white/10'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Wind</span>
            </button>
          </div>

          {/* Right: Map Quick Controls & Search */}
          <div className="wx-map-search-controls flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial justify-end">
            
            {/* Inline Map Location Search */}
            <form onSubmit={handleMapSearch} className="wx-map-search relative flex-1 sm:w-44 md:w-56 min-w-[120px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-sky-300 pointer-events-none" />
              <input
                type="text"
                value={mapSearchTerm}
                onChange={(e) => setMapSearchTerm(e.target.value)}
                placeholder="Search a place or city..." aria-label="Search a place on the map"
                className="wx-map-search-input w-full pl-8 pr-2 py-1.5 text-[#32164D] text-xs rounded-xl border border-violet-300 focus:border-violet-600 focus:outline-none transition min-h-[40px]"
              />
              {(searchResults.length > 0 || isSearching || mapSearchTerm.trim().length >= 2) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a1426] border border-white/20 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto">
                  {searchResults.map((city) => (
                    <button
                      key={`${city.name}-${city.lat}-${city.lon}`}
                      type="button"
                      onClick={() => {
                        if (mapInstanceRef.current) {
                          mapInstanceRef.current.flyTo([city.lat, city.lon], 10, { duration: 1 });
                          void handleInspectCoordinates(city.lat, city.lon, city.name);
                        }
                        setSearchResults([]);
                        setMapSearchTerm('');
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs hover:bg-violet-50 text-[#32164D] flex justify-between items-center border-b border-violet-100 last:border-0"
                    >
                      <span className="font-semibold text-violet-900">{city.name}</span>
                      <span className="text-[10px] text-violet-700">{city.admin1 ? city.admin1 + ', ' : ''}{city.country}</span>
                    </button>
                  ))}
                </div>
              )}
              {isSearching && <div className="wx-map-search-state">Searching places…</div>}
              {!isSearching && mapSearchTerm.trim().length >= 2 && searchResults.length === 0 && (
                <div className="wx-map-search-state">No places found. Try a nearby town or city name.</div>
              )}
            </form>

            {/* Recenter Active City Button */}
            <button
              onClick={handleRecenterActive}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 text-sky-300 border border-white/12 transition btn-hover-lift min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Center map on selected weather location"
              aria-label="Center map on selected city"
            >
              <Compass className="w-4 h-4" />
            </button>

            {/* Recenter Device GPS Button */}
            <button
              onClick={handleRecenterGPS}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 text-emerald-300 border border-white/12 transition btn-hover-lift min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Find and center on my device location"
              aria-label="Center map on physical GPS device location"
            >
              <Navigation className="w-4 h-4" />
            </button>

            {/* Toggle Fullscreen Map View */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/12 transition btn-hover-lift min-h-[36px] min-w-[36px] flex items-center justify-center"
              title={isFullscreen ? 'Exit Fullscreen Map' : 'Expand Fullscreen Map'}
              aria-label={isFullscreen ? 'Exit Fullscreen Map' : 'Expand Fullscreen Map'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

        </div>

        {/* Map Canvas Container */}
        <div className="wx-map-canvas-wrap relative flex-1 w-full h-full min-h-[300px]">
          <div ref={mapContainerRef} className="wx-map-canvas w-full h-full z-0" aria-label="Interactive street map" />

          {/* Floating Time Forecast Offset Slider (Responsive: Docked on desktop, expandable on mobile) */}
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20">
            {/* Mobile Toggle Pill */}
            <div className="sm:hidden mb-1 flex justify-end">
              <button
                onClick={() => setIsSliderOpen(!isSliderOpen)}
                className="wx-map-timeline-toggle px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{timeOffsetHours === 0 ? 'Forecast (Now)' : `+${timeOffsetHours}h Forecast`}</span>
              </button>
            </div>

            {/* Slider Card */}
            <div className={`wx-map-timeline-card ${isSliderOpen ? 'block' : 'hidden sm:block'} w-72 sm:w-80 rounded-2xl p-3 shadow-2xl space-y-2`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sky-200 flex items-center gap-1.5 font-heading">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Forecast Timeline</span>
                </span>
                <span className="font-bold text-amber-300 tabular-nums">
                  {timeOffsetHours === 0 ? 'Live Conditions' : `+${timeOffsetHours}h Forecast`}
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
                aria-label="Forecast offset in hours"
              />

              <div className="flex justify-between text-[10px] text-white/50 font-medium">
                <span>Now</span>
                <span>+6h</span>
                <span>+12h</span>
                <span>+18h</span>
                <span>+24h</span>
              </div>
            </div>
          </div>

          {/* Interactive Map Hint Banner (Desktop only) */}
          <div className="wx-map-hint absolute top-3 left-3 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs shadow-xl pointer-events-none z-10">
            <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Tap map locations to inspect live weather</span>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="wx-map-footer px-3 py-2 border-t flex flex-col sm:flex-row items-center justify-between text-[11px] gap-1.5 z-10">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>Map data © OpenStreetMap contributors</span>
          </div>
          <button
            onClick={() => onOpenAssistant(`Give me an overview of weather patterns across the map near ${currentWeatherData?.location.name || 'my location'}.`)}
            className="wx-map-ai-link font-bold flex items-center gap-1 transition"
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Analyze region with RODEX AI</span>
          </button>
        </div>

      </div>
    </div>
  );
};
