import React, { useMemo, useState, useEffect } from 'react';
import { AtmosphericTheme } from '../utils/weatherUtils';
import { AtmosphericParticles, ParticleKind } from './AtmosphericParticles';

interface AtmosphericBackgroundProps {
  theme: AtmosphericTheme;
}

export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({ theme }) => {
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const xRel = (e.clientX / window.innerWidth - 0.5) * 12; // -6px to +6px
        const yRel = (e.clientY / window.innerHeight - 0.5) * 8;  // -4px to +4px
        setOffset({ x: Number(xRel.toFixed(1)), y: Number(yRel.toFixed(1)) });
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion]);

  const config = useMemo<{
    baseGradient: string;
    ambientGlow1: string;
    ambientGlow2: string;
    accentGlow: string;
    particles: ParticleKind;
  }>(() => {
    switch (theme) {
      case 'sunny':
        return {
          baseGradient: 'from-[#081830] via-[#0c2448] to-[#050f21]',
          ambientGlow1: 'bg-amber-400/18',
          ambientGlow2: 'bg-sky-400/22',
          accentGlow: 'bg-teal-500/15',
          particles: 'solar'
        };
      case 'twilight':
        return {
          baseGradient: 'from-[#1a0e28] via-[#2b1744] to-[#0a0614]',
          ambientGlow1: 'bg-amber-300/20',
          ambientGlow2: 'bg-rose-500/18',
          accentGlow: 'bg-indigo-500/22',
          particles: 'twilight'
        };
      case 'rainy':
        return {
          baseGradient: 'from-[#040d1c] via-[#071930] to-[#020710]',
          ambientGlow1: 'bg-cyan-500/16',
          ambientGlow2: 'bg-sky-600/18',
          accentGlow: 'bg-emerald-500/10',
          particles: 'rain'
        };
      case 'thunder':
        return {
          baseGradient: 'from-[#060712] via-[#100d28] to-[#03030a]',
          ambientGlow1: 'bg-purple-600/24',
          ambientGlow2: 'bg-indigo-500/20',
          accentGlow: 'bg-amber-400/15',
          particles: 'electric'
        };
      case 'snowy':
        return {
          baseGradient: 'from-[#051326] via-[#0b213d] to-[#030a17]',
          ambientGlow1: 'bg-sky-300/16',
          ambientGlow2: 'bg-cyan-400/14',
          accentGlow: 'bg-white/10',
          particles: 'snow'
        };
      case 'fog':
        return {
          baseGradient: 'from-[#0a121c] via-[#121e2a] to-[#060b12]',
          ambientGlow1: 'bg-slate-400/14',
          ambientGlow2: 'bg-zinc-500/14',
          accentGlow: 'bg-sky-500/10',
          particles: 'mist'
        };
      case 'overcast':
        return {
          baseGradient: 'from-[#09111c] via-[#111c2a] to-[#050910]',
          ambientGlow1: 'bg-slate-400/15',
          ambientGlow2: 'bg-sky-800/20',
          accentGlow: 'bg-indigo-900/18',
          particles: 'cloud-drift'
        };
      case 'night':
        return {
          baseGradient: 'from-[#02060f] via-[#060e1d] to-[#010308]',
          ambientGlow1: 'bg-indigo-600/18',
          ambientGlow2: 'bg-sky-500/15',
          accentGlow: 'bg-purple-600/14',
          particles: 'stars'
        };
      case 'cloudy':
      default:
        return {
          baseGradient: 'from-[#06152a] via-[#0c2240] to-[#040e1e]',
          ambientGlow1: 'bg-sky-500/20',
          ambientGlow2: 'bg-indigo-500/18',
          accentGlow: 'bg-teal-500/12',
          particles: 'cloud-drift'
        };
    }
  }, [theme]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none transition-colors duration-1000"
    >
      {/* 1. Base Rich Atmospheric Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-b ${config.baseGradient} transition-all duration-1000`} />

      {/* 2. Primary Atmospheric Horizon Glow (Top Solar / Celestial Arc) with subtle 3D parallax */}
      <div
        className={`absolute -top-36 left-1/2 -translate-x-1/2 w-[720px] sm:w-[960px] h-[380px] sm:h-[480px] rounded-full blur-3xl ${config.ambientGlow1} transition-transform duration-500 ease-out motion-reduce:animate-none animate-pulse-glow`}
        style={{
          transform: prefersReducedMotion
            ? 'translateX(-50%)'
            : `translate3d(calc(-50% + ${offset.x * 1.5}px), ${offset.y * 1.5}px, 0)`,
        }}
      />

      {/* 3. Secondary Flank Atmospheric Glow (East / Right Atmosphere) */}
      <div
        className={`absolute top-1/4 -right-36 w-[420px] sm:w-[560px] h-[420px] sm:h-[560px] rounded-full blur-3xl ${config.ambientGlow2} transition-transform duration-700 ease-out opacity-80`}
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${-offset.x}px, ${-offset.y}px, 0)`,
        }}
      />

      {/* 4. Deep Atmospheric Basin Glow (South / Ground Depth) */}
      <div
        className={`absolute -bottom-48 -left-32 w-[500px] sm:w-[680px] h-[500px] sm:h-[680px] rounded-full blur-3xl ${config.accentGlow} transition-transform duration-700 ease-out opacity-70`}
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${offset.x * 0.8}px, ${offset.y * 0.8}px, 0)`,
        }}
      />

      {/* 5. Delicate Micro-Dot Grid Layer for Subtle Tactile Depth */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px] opacity-35" />

      {/* 6. Subtle 3D-Inspired Atmospheric Particle Animations */}
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `translate3d(${offset.x * 0.5}px, ${offset.y * 0.5}px, 0)`,
        }}
      >
        <AtmosphericParticles kind={config.particles} />
      </div>

      {/* 7. Readability Scrim Vignette: Keeps foreground text and metrics razor sharp */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050b14]/70 via-transparent to-[#050b14]/40" />
    </div>
  );
};
