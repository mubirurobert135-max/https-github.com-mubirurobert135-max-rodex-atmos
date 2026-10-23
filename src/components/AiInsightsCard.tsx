import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, Shirt, Activity, HeartPulse, Compass, Loader2, RotateCw } from 'lucide-react';
import { WeatherData, AIInsights } from '../types';

interface AiInsightsCardProps {
  data: WeatherData;
  onOpenAssistant?: () => void;
}

export const AiInsightsCard: React.FC<AiInsightsCardProps> = ({ data, onOpenAssistant }) => {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [cacheKey, setCacheKey] = useState<string>('');

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    const currentKey = `${data.location.name}-${data.weather.current.temperature_2m}-${data.weather.current.weather_code}`;
    
    if (!forceRefresh && cacheKey === currentKey && insights) {
      return; // Use cached insight for same forecast state
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: data.location,
          current: data.weather.current,
          daily: data.weather.daily
        })
      });

      if (!res.ok) {
        throw new Error(`Insights endpoint returned status ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON but received ${contentType}`);
      }

      const json = await res.json();
      if (json && json.summary) {
        setInsights(json);
        setCacheKey(currentKey);
      } else {
        throw new Error('Invalid JSON payload structure');
      }
    } catch (err: any) {
      console.warn('[AI Insights Notice] Using deterministic atmospheric insights fallback:', err?.message || err);
      setInsights({
        summary: `Conditions in ${data.location.name} are currently stable with a temperature of ${Math.round(data.weather.current.temperature_2m)}°C.`,
        clothing: 'Dress comfortably according to the outdoor temperature.',
        activities: 'Suitable conditions for normal daily activities and outdoor walks.',
        health: 'Stay adequately hydrated throughout the day.'
      });
    } finally {
      setIsLoading(false);
    }
  }, [data, cacheKey, insights]);

  useEffect(() => {
    fetchInsights(false);
  }, [fetchInsights]);

  return (
    <div className="w-full bg-gradient-to-r from-indigo-950/60 via-sky-950/40 to-blue-950/60 backdrop-blur-2xl border border-sky-400/35 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all">
      {/* Glow effect */}
      <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/30 text-white">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              AI Weather Insight
            </h3>
            <p className="text-xs text-sky-200/70 font-medium">
              Plain-language breakdown & practical recommendations based on live forecast data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenAssistant && (
            <button
              onClick={onOpenAssistant}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md shadow-sky-500/20"
              title="Speak or chat in real time with RODEX AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI (Voice/Chat)</span>
            </button>
          )}
          <button
            onClick={() => fetchInsights(true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-semibold transition shadow-sm backdrop-blur-md disabled:opacity-50"
            title="Explicitly request updated AI insight"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Insight</span>
          </button>
          <span className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
            Gemini AI
          </span>
        </div>
      </div>

      {isLoading && !insights ? (
        <div className="flex items-center justify-center py-12 gap-3 text-sky-200">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <span className="text-sm font-medium">Analyzing current forecast data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Summary */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Compass className="w-4 h-4" />
              <span>Atmospheric Summary</span>
            </div>
            <p className="text-sm text-white/95 leading-relaxed font-normal">
              {insights?.summary || 'Stable conditions across the area.'}
            </p>
          </div>

          {/* Clothing */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Shirt className="w-4 h-4" />
              <span>Wardrobe Guide</span>
            </div>
            <p className="text-sm text-white/95 leading-relaxed font-normal">
              {insights?.clothing || 'Comfortable clothing recommended.'}
            </p>
          </div>

          {/* Activities */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Activity className="w-4 h-4" />
              <span>Outdoor Suitability</span>
            </div>
            <p className="text-sm text-white/95 leading-relaxed font-normal">
              {insights?.activities || 'Great conditions for outdoor plans.'}
            </p>
          </div>

          {/* Health */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <HeartPulse className="w-4 h-4" />
              <span>Health & Comfort</span>
            </div>
            <p className="text-sm text-white/95 leading-relaxed font-normal">
              {insights?.health || 'Stay hydrated throughout the day.'}
            </p>
          </div>

        </div>
      )}
    </div>
  );
};
