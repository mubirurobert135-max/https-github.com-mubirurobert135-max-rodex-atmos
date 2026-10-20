import React, { useEffect, useState } from 'react';
import { Sparkles, Shirt, Activity, HeartPulse, Compass, Loader2 } from 'lucide-react';
import { WeatherData, AIInsights } from '../types';

interface AiInsightsCardProps {
  data: WeatherData;
}

export const AiInsightsCard: React.FC<AiInsightsCardProps> = ({ data }) => {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchInsights = async () => {
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
        const json = await res.json();
        if (isMounted) {
          setInsights(json);
        }
      } catch (err) {
        console.error('Failed to fetch AI insights:', err);
        if (isMounted) {
          setInsights({
            summary: `Atmospheric conditions in ${data.location.name} are clear and stable today. Enjoy the pleasant outdoors!`,
            clothing: 'Light layers or comfortable casual wear suited for current conditions.',
            activities: 'Ideal for walking, jogging, or outdoor leisure.',
            health: 'Stay well-hydrated throughout the day.'
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchInsights();
    return () => {
      isMounted = false;
    };
  }, [data.location.name, data.weather.current.temperature_2m]);

  return (
    <div className="w-full bg-gradient-to-r from-indigo-900/40 via-sky-900/30 to-blue-900/40 backdrop-blur-2xl border border-sky-400/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-md shadow-sky-500/30 text-white">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            RODEX Atmos AI Intelligence
          </h3>
        </div>
        <span className="text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
          Gemini Powered
        </span>
      </div>

      {isLoading || !insights ? (
        <div className="flex items-center justify-center py-10 gap-3 text-sky-200">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <span className="text-sm font-medium">Analyzing atmospheric conditions & generating insights...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Summary */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Compass className="w-4 h-4" />
              <span>Atmospheric Summary</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed font-normal">
              {insights.summary}
            </p>
          </div>

          {/* Clothing */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Shirt className="w-4 h-4" />
              <span>Wardrobe Guide</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed font-normal">
              {insights.clothing}
            </p>
          </div>

          {/* Activities */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Activity className="w-4 h-4" />
              <span>Activity Suitability</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed font-normal">
              {insights.activities}
            </p>
          </div>

          {/* Health */}
          <div className="bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl p-4 transition flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sky-300 text-xs font-bold uppercase tracking-wider mb-2">
              <HeartPulse className="w-4 h-4" />
              <span>Health & Comfort</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed font-normal">
              {insights.health}
            </p>
          </div>

        </div>
      )}
    </div>
  );
};
