import React from 'react';

interface AtmosphericBackgroundProps {
  theme: 'sunny' | 'night' | 'rainy' | 'snowy' | 'cloudy' | 'thunder' | 'fog';
}

export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({ theme }) => {
  const getThemeStyles = () => {
    switch (theme) {
      case 'sunny':
        return {
          bg: 'from-sky-400 via-blue-500 to-indigo-600',
          glow1: 'bg-amber-300/35',
          glow2: 'bg-sky-200/25',
        };
      case 'night':
        return {
          bg: 'from-slate-950 via-indigo-950 to-purple-950',
          glow1: 'bg-blue-600/25',
          glow2: 'bg-purple-500/20',
        };
      case 'rainy':
        return {
          bg: 'from-slate-900 via-blue-950 to-slate-950',
          glow1: 'bg-cyan-600/25',
          glow2: 'bg-blue-700/25',
        };
      case 'snowy':
        return {
          bg: 'from-slate-800 via-sky-900 to-slate-900',
          glow1: 'bg-sky-300/25',
          glow2: 'bg-blue-200/20',
        };
      case 'thunder':
        return {
          bg: 'from-zinc-950 via-purple-950 to-slate-950',
          glow1: 'bg-purple-600/35',
          glow2: 'bg-amber-400/15',
        };
      case 'fog':
        return {
          bg: 'from-slate-700 via-zinc-800 to-slate-900',
          glow1: 'bg-slate-400/25',
          glow2: 'bg-zinc-500/20',
        };
      case 'cloudy':
      default:
        return {
          bg: 'from-sky-600 via-blue-800 to-slate-900',
          glow1: 'bg-blue-400/30',
          glow2: 'bg-indigo-400/25',
        };
    }
  };

  const style = getThemeStyles();

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none transition-colors duration-1000">
      {/* Base Atmospheric Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${style.bg} transition-all duration-1000`} />

      {/* Atmospheric Glowing Orbs (Respects prefers-reduced-motion via motion-reduce) */}
      <div className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl ${style.glow1} motion-reduce:animate-none animate-pulse duration-7000`} />
      <div className={`absolute top-1/3 -right-32 w-80 h-80 rounded-full blur-3xl ${style.glow2} motion-reduce:animate-none animate-pulse duration-5000`} />
      <div className={`absolute -bottom-32 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl ${style.glow1} opacity-70`} />

      {/* Subtle Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-35" />
    </div>
  );
};
