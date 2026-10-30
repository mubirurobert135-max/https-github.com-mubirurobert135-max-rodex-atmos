import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, Loader2, RotateCw } from 'lucide-react';
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
    const current = data.weather.current;
    const today = data.weather.daily;
    const currentKey = [
      data.location.name,
      data.location.country,
      current.temperature_2m,
      current.apparent_temperature,
      current.relative_humidity_2m,
      current.weather_code,
      current.wind_speed_10m,
      current.precipitation,
      today?.temperature_2m_max?.[0],
      today?.temperature_2m_min?.[0],
      today?.uv_index_max?.[0]
    ].join('|');
    
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
      const currentTemp = data.weather.current?.temperature_2m;
      const hasTemperature = typeof currentTemp === 'number' && Number.isFinite(currentTemp);
      const conditionCode = data.weather.current?.weather_code;
      const hasCondition = typeof conditionCode === 'number' && Number.isFinite(conditionCode) && conditionCode >= 0;
      setInsights({
        summary: hasTemperature
          ? `Current temperature in ${data.location.name} is about ${Math.round(currentTemp)}°C.`
          : hasCondition
            ? `The reported weather condition in ${data.location.name} is available, but the current temperature reading is missing.`
            : `Current weather measurements for ${data.location.name} are incomplete. Refresh the forecast to try again.`,
        clothing: hasTemperature
          ? 'Dress for the measured temperature and check the hourly forecast for changes.'
          : 'Current temperature data is unavailable, so specific temperature-based clothing advice may be unreliable.',
        activities: hasCondition
          ? 'Use the latest hourly forecast to plan outdoor activities safely.'
          : 'Check updated local conditions before making weather-sensitive outdoor plans.',
        health: typeof data.weather.daily?.uv_index_max?.[0] === 'number' && Number.isFinite(data.weather.daily.uv_index_max[0])
          ? 'Check the forecast UV index before extended sun exposure and stay hydrated.'
          : 'UV forecast data is unavailable; use appropriate sun protection during extended exposure.'
      });
      setCacheKey(currentKey);
    } finally {
      setIsLoading(false);
    }
  }, [data, cacheKey, insights]);

  useEffect(() => {
    fetchInsights(false);
  }, [fetchInsights]);

  return (
    <section className="wx-ai-neutral-summary" aria-label="AI-generated weather summary">
      <div className="wx-ai-neutral-heading">
        <span className="wx-ai-neutral-icon"><Sparkles className="w-4 h-4" /></span>
        <div className="min-w-0">
          <h3>AI weather summary</h3>
          <p>Optional interpretation of the current forecast</p>
        </div>
        <span className="wx-ai-neutral-label">AI generated</span>
      </div>

      {isLoading && !insights ? (
        <div className="wx-ai-neutral-loading">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Preparing a summary of the forecast…</span>
        </div>
      ) : (
        <p className="wx-ai-neutral-copy">
          {insights?.summary || 'A forecast summary is not available right now.'}
        </p>
      )}

      <div className="wx-ai-neutral-footer">
        <p>AI summaries may be incomplete. Check the measured forecast values and official alerts for decisions.</p>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenAssistant && (
            <button
              type="button"
              onClick={onOpenAssistant}
              className="wx-ai-neutral-action"
              title="Ask Atmos about the forecast"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ask Atmos</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchInsights(true)}
            disabled={isLoading}
            className="wx-ai-neutral-refresh"
            title="Refresh AI summary"
            aria-label="Refresh AI weather summary"
          >
            <RotateCw className={isLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
          </button>
        </div>
      </div>
    </section>
  );
};
