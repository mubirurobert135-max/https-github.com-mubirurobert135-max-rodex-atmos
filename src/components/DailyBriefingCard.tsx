import React, { useEffect, useState, useCallback } from 'react';
import { Sun, CloudRain, Wind, AlertTriangle, Sparkles, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { WeatherData, DailyBriefing } from '../types';

interface DailyBriefingCardProps {
  data: WeatherData;
  onOpenAssistant?: (prompt?: string) => void;
}

export const DailyBriefingCard: React.FC<DailyBriefingCardProps> = ({ data, onOpenAssistant }) => {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchBriefing = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: data.location,
          current: data.weather.current,
          daily: data.weather.daily,
          hourly: data.weather.hourly,
          alerts: data.alerts || []
        })
      });
      if (res.ok) {
        const json = await res.json();
        setBriefing(json);
      }
    } catch (err) {
      console.warn('Failed to fetch daily briefing:', err);
    } finally {
      setIsLoading(false);
    }
  }, [data]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const activeAlerts = data.alerts || [];
  const topAlert = activeAlerts.find(a => a.severity === 'extreme' || a.severity === 'severe') || activeAlerts[0];

  return (
    <div className="w-full bg-gradient-to-br from-slate-900/80 via-sky-950/60 to-indigo-950/80 backdrop-blur-2xl border border-sky-400/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-sky-400/45">
      {/* Decorative ambient glows */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 text-white">
            <Sun className="w-5 h-5 text-amber-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white tracking-wide font-display">
                Daily Weather Briefing
              </h3>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30 font-medium">
                {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="text-xs text-sky-200/70 font-medium">
              Proactive atmospheric intelligence & actionable recommendations for {data.location.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenAssistant && (
            <button
              onClick={() => onOpenAssistant(`Summarise today's weather briefing for ${data.location.name}`)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md shadow-sky-500/20 active:scale-95"
              title="Ask RODEX AI to explain this briefing in conversation"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask AI Briefing</span>
            </button>
          )}

          <button
            onClick={fetchBriefing}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-200 text-xs font-semibold transition backdrop-blur-md disabled:opacity-50 active:scale-95"
            title="Refresh briefing with latest weather data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {isLoading && !briefing ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-sky-200/80">
          <RefreshCw className="w-7 h-7 animate-spin text-sky-400" />
          <p className="text-sm font-medium">Synthesizing personalized forecast briefing...</p>
        </div>
      ) : (
        <div className="space-y-5 relative z-10">
          {/* Top alert banner if severe alert exists */}
          {topAlert && (
            <div className={`p-4 rounded-2xl border flex items-start justify-between gap-3 backdrop-blur-xl ${
              topAlert.type === 'official' 
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-100'
                : topAlert.severity === 'severe' || topAlert.severity === 'extreme'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                : 'bg-sky-500/15 border-sky-400/30 text-sky-100'
            }`}>
              <div className="flex items-start gap-3">
                {topAlert.type === 'official' ? (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/30 border border-white/10">
                      {topAlert.type === 'official' ? 'Official Warning' : 'Forecast Alert'}
                    </span>
                    <h4 className="text-sm font-bold">{topAlert.title}</h4>
                  </div>
                  <p className="text-xs mt-1 opacity-90 leading-relaxed">{topAlert.description}</p>
                </div>
              </div>

              {onOpenAssistant && (
                <button
                  onClick={() => onOpenAssistant(`Why did Atmos issue the notification "${topAlert.title}"?`)}
                  className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 transition whitespace-nowrap"
                >
                  Explain Alert
                </button>
              )}
            </div>
          )}

          {/* Greeting & Summary */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <h4 className="text-lg font-bold text-sky-200 mb-1 font-display">
              {briefing?.greeting || `Hello, welcome to ${data.location.name}`}
            </h4>
            <p className="text-sm text-white/90 leading-relaxed">
              {briefing?.summary || `Conditions in ${data.location.name} are current stable.`}
            </p>
          </div>

          {/* Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <Sun className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="text-[11px] text-sky-200/70 font-medium block uppercase tracking-wider">Temperature Range</span>
                <span className="text-sm font-bold text-white">
                  High: {briefing?.highTemp ?? Math.round(data.weather.current.temperature_2m)}°C / Low: {briefing?.lowTemp ?? Math.round(data.weather.current.temperature_2m - 4)}°C
                </span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <CloudRain className="w-5 h-5 text-sky-400 shrink-0" />
              <div>
                <span className="text-[11px] text-sky-200/70 font-medium block uppercase tracking-wider">Precipitation Outlook</span>
                <span className="text-xs font-semibold text-white truncate block">
                  {briefing?.rainLikelihood || 'Minimal rain probability.'}
                </span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              <Wind className="w-5 h-5 text-indigo-300 shrink-0" />
              <div>
                <span className="text-[11px] text-sky-200/70 font-medium block uppercase tracking-wider">Atmospheric Wind</span>
                <span className="text-xs font-semibold text-white truncate block">
                  {briefing?.windCondition || `Wind ${Math.round(data.weather.current.wind_speed_10m)} km/h`}
                </span>
              </div>
            </div>
          </div>

          {/* Actionable Recommendations */}
          {briefing?.recommendations && briefing.recommendations.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h5 className="text-xs font-bold text-sky-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Recommended Outdoor Actions</span>
              </h5>
              <ul className="space-y-1.5 text-xs text-white/90">
                {briefing.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold">•</span>
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
