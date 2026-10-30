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
          baseGradient: 'from-[#924EF9] via-[#9D91F7] to-[#E8E9FE]',
          ambientGlow1: 'bg-[#FFFFFF]/22',
          ambientGlow2: 'bg-[#E8E9FE]/32',
          accentGlow: 'bg-[#924EF9]/16',
          particles: 'solar'
        };
      case 'twilight':
        return {
          baseGradient: 'from-[#8F55F7] via-[#9D91F7] to-[#C2BCF8]',
          ambientGlow1: 'bg-[#E8E9FE]/22',
          ambientGlow2: 'bg-[#C2BCF8]/26',
          accentGlow: 'bg-[#C2BCF8]/26',
          particles: 'twilight'
        };
      case 'rainy':
        return {
          baseGradient: 'from-[#924EF9] via-[#8F55F7] to-[#9D91F7]',
          ambientGlow1: 'bg-[#E8E9FE]/24',
          ambientGlow2: 'bg-[#C2BCF8]/24',
          accentGlow: 'bg-[#C2BCF8]/24',
          particles: 'rain'
        };
      case 'thunder':
        return {
          baseGradient: 'from-[#924EF9] via-[#8F55F7] to-[#9D91F7]',
          ambientGlow1: 'bg-[#924EF9]/24',
          ambientGlow2: 'bg-[#C2BCF8]/30',
          accentGlow: 'bg-[#E8E9FE]/24',
          particles: 'electric'
        };
      case 'snowy':
        return {
          baseGradient: 'from-[#C2BCF8] via-[#E8E9FE] to-[#9D91F7]',
          ambientGlow1: 'bg-[#FFFFFF]/28',
          ambientGlow2: 'bg-[#E8E9FE]/28',
          accentGlow: 'bg-white/16',
          particles: 'snow'
        };
      case 'fog':
        return {
          baseGradient: 'from-[#E8E9FE] via-[#C2BCF8] to-[#9D91F7]',
          ambientGlow1: 'bg-[#E8E9FE]/26',
          ambientGlow2: 'bg-[#C2BCF8]/24',
          accentGlow: 'bg-[#E8E9FE]/24',
          particles: 'mist'
        };
      case 'overcast':
        return {
          baseGradient: 'from-[#9D91F7] via-[#C2BCF8] to-[#8F55F7]',
          ambientGlow1: 'bg-[#E8E9FE]/24',
          ambientGlow2: 'bg-[#9D91F7]/26',
          accentGlow: 'bg-[#8F55F7]/20',
          particles: 'cloud-drift'
        };
      case 'night':
        return {
          baseGradient: 'from-[#924EF9] via-[#9D91F7] to-[#8F55F7]',
          ambientGlow1: 'bg-[#8F55F7]/24',
          ambientGlow2: 'bg-[#C2BCF8]/24',
          accentGlow: 'bg-[#C2BCF8]/22',
          particles: 'stars'
        };
      case 'cloudy':
      default:
        return {
          baseGradient: 'from-[#8F55F7] via-[#9D91F7] to-[#C2BCF8]',
          ambientGlow1: 'bg-[#E8E9FE]/28',
          ambientGlow2: 'bg-[#C2BCF8]/32',
          accentGlow: 'bg-[#C2BCF8]/22',
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
      <div
        className={`absolute inset-0 bg-gradient-to-b ${config.baseGradient} transition-all duration-1000`}
        style={
          theme === 'rainy' || theme === 'thunder' || theme === 'overcast'
            ? {
                backgroundImage: "linear-gradient(180deg, rgba(157, 145, 247, .14), rgba(143, 85, 247, .26)), url('/atmos-storm-background.webp')",
                backgroundSize: 'cover',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat',
              }
            : undefined
        }
      />

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
      <div className="absolute inset-0 bg-gradient-to-t from-[#924EF9]/10 via-transparent to-[#FFFFFF]/25" />
    </div>
  );
};
