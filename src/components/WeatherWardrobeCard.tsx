import React from 'react';
import { Shirt, Umbrella, Sun, Wind, Sparkles, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { WeatherData } from '../types';
import { buildWeatherWardrobeAdvice } from '../utils/weatherWardrobe';

interface WeatherWardrobeCardProps {
  data: WeatherData;
  unit: 'C' | 'F';
  onOpenAssistant?: (prompt?: string) => void;
}

export const WeatherWardrobeCard: React.FC<WeatherWardrobeCardProps> = ({ data, unit, onOpenAssistant }) => {
  const advice = buildWeatherWardrobeAdvice({
    current: data.weather.current,
    daily: data.weather.daily,
    hourly: data.weather.hourly,
    unit
  });

  const outfitPrompt = `What should I wear in ${data.location.name} today? Use the current weather and the next 8 hours of forecast. Explain the recommendation in 2 or 3 concise sentences.`;

  return (
    <section
      className="wx-wardrobe-card"
      aria-labelledby="wx-wardrobe-title"
    >
      <div className="wx-wardrobe-topline">
        <div className="wx-wardrobe-heading">
          <span className="wx-wardrobe-icon"><Shirt className="h-5 w-5" /></span>
          <div>
            <p className="wx-wardrobe-eyebrow">RODEX LIFESTYLE INTELLIGENCE</p>
            <h2 id="wx-wardrobe-title">Weather Wardrobe</h2>
            <p className="wx-wardrobe-subtitle">What to wear in {data.location.name}</p>
          </div>
        </div>
        <span className={advice.dataStatus === 'good' ? 'wx-wardrobe-status' : 'wx-wardrobe-status is-limited'}>
          {advice.dataStatus === 'good' ? 'Live weather-based' : 'Limited weather data'}
        </span>
      </div>

      <div className="wx-wardrobe-content">
        <div className="wx-wardrobe-main">
          <span className="wx-wardrobe-label">TODAY'S OUTFIT</span>
          <h3>{advice.outfit}</h3>
          <p>{advice.reason}</p>
        </div>
        <div className="wx-wardrobe-items" aria-label="Suggested clothing and accessories">
          {advice.items.map((item) => (
            <span className="wx-wardrobe-item" key={item}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {advice.weatherNotes.length > 0 && (
        <div className="wx-wardrobe-notes">
          {advice.weatherNotes.map((note, index) => {
            const Icon = /rain|umbrella/i.test(note) ? Umbrella : /UV|sun protection/i.test(note) ? Sun : Wind;
            return <p key={index}><Icon className="h-3.5 w-3.5" />{note}</p>;
          })}
        </div>
      )}

      <div className="wx-wardrobe-footer">
        <span><Sparkles className="h-3.5 w-3.5" /> Simple advice, based on forecast data</span>
        {onOpenAssistant && (
          <button type="button" onClick={() => onOpenAssistant(outfitPrompt)}>
            Ask Atmos why <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
};
