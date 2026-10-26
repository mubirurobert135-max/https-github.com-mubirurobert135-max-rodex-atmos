import React, { useMemo } from 'react';

export type ParticleKind = 'solar' | 'rain' | 'mist' | 'snow' | 'electric' | 'twilight' | 'stars' | 'cloud-drift';

interface AtmosphericParticlesProps {
  kind: ParticleKind;
}

export const AtmosphericParticles: React.FC<AtmosphericParticlesProps> = ({ kind }) => {
  // Deterministic seed for positions and timing to avoid layout thrashing
  const solarParticles = useMemo(() => [
    { id: 1, left: '12%', top: '75%', size: 3, delay: '0s', dur: '14s', driftX: '28px', opacity: 0.65, blur: '0px' },
    { id: 2, left: '28%', top: '60%', size: 4.5, delay: '3.5s', dur: '18s', driftX: '-35px', opacity: 0.5, blur: '1px' },
    { id: 3, left: '42%', top: '82%', size: 2.5, delay: '1.2s', dur: '12s', driftX: '45px', opacity: 0.7, blur: '0px' },
    { id: 4, left: '58%', top: '65%', size: 5, delay: '5.1s', dur: '16s', driftX: '-20px', opacity: 0.45, blur: '1.5px' },
    { id: 5, left: '74%', top: '85%', size: 3.5, delay: '2.8s', dur: '15s', driftX: '35px', opacity: 0.6, blur: '0.5px' },
    { id: 6, left: '88%', top: '70%', size: 2, delay: '6.4s', dur: '13s', driftX: '-40px', opacity: 0.55, blur: '0px' },
    { id: 7, left: '20%', top: '45%', size: 4, delay: '4.2s', dur: '17s', driftX: '25px', opacity: 0.4, blur: '1px' },
    { id: 8, left: '65%', top: '40%', size: 3, delay: '0.8s', dur: '19s', driftX: '-30px', opacity: 0.5, blur: '0.5px' },
    { id: 9, left: '82%', top: '35%', size: 5.5, delay: '7.5s', dur: '21s', driftX: '20px', opacity: 0.35, blur: '2px' },
    { id: 10, left: '35%', top: '25%', size: 2.5, delay: '2.1s', dur: '14s', driftX: '-25px', opacity: 0.6, blur: '0px' },
    { id: 11, left: '50%', top: '50%', size: 3.5, delay: '8.3s', dur: '16s', driftX: '30px', opacity: 0.45, blur: '0.5px' },
    { id: 12, left: '92%', top: '55%', size: 4, delay: '3.9s', dur: '15s', driftX: '-15px', opacity: 0.5, blur: '1px' },
  ], []);

  const rainStreaks = useMemo(() => [
    { id: 1, left: '8%', delay: '0s', dur: '0.85s', len: 54, opacity: 0.45, width: 1.5 },
    { id: 2, left: '16%', delay: '0.35s', dur: '0.75s', len: 70, opacity: 0.6, width: 2 },
    { id: 3, left: '24%', delay: '0.12s', dur: '0.95s', len: 45, opacity: 0.35, width: 1.2 },
    { id: 4, left: '33%', delay: '0.55s', dur: '0.8s', len: 65, opacity: 0.55, width: 1.8 },
    { id: 5, left: '41%', delay: '0.2s', dur: '0.7s', len: 80, opacity: 0.7, width: 2.2 },
    { id: 6, left: '50%', delay: '0.45s', dur: '0.9s', len: 50, opacity: 0.4, width: 1.5 },
    { id: 7, left: '58%', delay: '0.08s', dur: '0.78s', len: 75, opacity: 0.65, width: 2 },
    { id: 8, left: '67%', delay: '0.62s', dur: '0.88s', len: 58, opacity: 0.45, width: 1.6 },
    { id: 9, left: '76%', delay: '0.28s', dur: '0.72s', len: 82, opacity: 0.65, width: 2.2 },
    { id: 10, left: '84%', delay: '0.48s', dur: '0.92s', len: 48, opacity: 0.35, width: 1.2 },
    { id: 11, left: '92%', delay: '0.18s', dur: '0.82s', len: 68, opacity: 0.55, width: 1.8 },
    { id: 12, left: '97%', delay: '0.68s', dur: '0.76s', len: 60, opacity: 0.5, width: 1.5 },
  ], []);

  const snowFlakes = useMemo(() => [
    { id: 1, left: '10%', delay: '0s', dur: '9s', size: 6, driftX: '45px', opacity: 0.75 },
    { id: 2, left: '22%', delay: '2.5s', dur: '12s', size: 4, driftX: '-35px', opacity: 0.6 },
    { id: 3, left: '35%', delay: '1.2s', dur: '8s', size: 8, driftX: '55px', opacity: 0.85 },
    { id: 4, left: '48%', delay: '4.8s', dur: '11s', size: 5, driftX: '-40px', opacity: 0.7 },
    { id: 5, left: '62%', delay: '3.1s', dur: '10s', size: 7, driftX: '30px', opacity: 0.8 },
    { id: 6, left: '75%', delay: '0.8s', dur: '13s', size: 4.5, driftX: '-50px', opacity: 0.55 },
    { id: 7, left: '88%', delay: '5.5s', dur: '9.5s', size: 6.5, driftX: '40px', opacity: 0.75 },
    { id: 8, left: '95%', delay: '2.1s', dur: '11.5s', size: 5, driftX: '-25px', opacity: 0.65 },
  ], []);

  const nightStars = useMemo(() => [
    { id: 1, left: '14%', top: '12%', size: 2.5, delay: '0s', dur: '3.5s' },
    { id: 2, left: '28%', top: '24%', size: 3.5, delay: '1.2s', dur: '4.2s', diamond: true },
    { id: 3, left: '44%', top: '8%', size: 2, delay: '2.4s', dur: '3.8s' },
    { id: 4, left: '60%', top: '18%', size: 4, delay: '0.8s', dur: '5s', diamond: true },
    { id: 5, left: '76%', top: '14%', size: 2.5, delay: '1.9s', dur: '3.2s' },
    { id: 6, left: '88%', top: '28%', size: 3, delay: '3.1s', dur: '4.5s', diamond: true },
    { id: 7, left: '22%', top: '42%', size: 2, delay: '2.1s', dur: '3.6s' },
    { id: 8, left: '52%', top: '36%', size: 2.5, delay: '0.4s', dur: '4.8s' },
    { id: 9, left: '80%', top: '48%', size: 3.5, delay: '1.6s', dur: '4s', diamond: true },
    { id: 10, left: '36%', top: '56%', size: 1.8, delay: '2.8s', dur: '3.4s' },
  ], []);

  const twilightEmbers = useMemo(() => [
    { id: 1, left: '18%', top: '78%', size: 3.5, delay: '0s', dur: '11s', driftX: '35px', color: '#fb7185' },
    { id: 2, left: '34%', top: '82%', size: 4, delay: '2.8s', dur: '14s', driftX: '-25px', color: '#fde047' },
    { id: 3, left: '52%', top: '75%', size: 3, delay: '1.4s', dur: '10s', driftX: '40px', color: '#f43f5e' },
    { id: 4, left: '70%', top: '80%', size: 4.5, delay: '4.2s', dur: '13s', driftX: '-30px', color: '#fb923c' },
    { id: 5, left: '86%', top: '76%', size: 3, delay: '2.1s', dur: '12s', driftX: '20px', color: '#fde047' },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none motion-reduce:hidden" aria-hidden="true">
      {/* 1. Solar Dust Motifs (Sunshine / High Clear Days) */}
      {kind === 'solar' && (
        <div className="relative w-full h-full">
          {solarParticles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full bg-amber-200/90 shadow-[0_0_10px_rgba(251,191,36,0.6)] animate-float-particle"
              style={{
                left: p.left,
                top: p.top,
                width: `${p.size}px`,
                height: `${p.size}px`,
                filter: `blur(${p.blur})`,
                animationDelay: p.delay,
                animationDuration: p.dur,
                // Pass CSS custom properties for hardware-accelerated transforms
                ['--drift-x' as string]: p.driftX,
                ['--target-opacity' as string]: p.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* 2. 3D Crystalline Rain Streaks */}
      {kind === 'rain' && (
        <div className="relative w-full h-full">
          {rainStreaks.map((r) => (
            <div
              key={r.id}
              className="absolute bg-gradient-to-b from-transparent via-sky-300 to-sky-400/80 rounded-full animate-rain-streak"
              style={{
                left: r.left,
                top: '-80px',
                width: `${r.width}px`,
                height: `${r.len}px`,
                animationDelay: r.delay,
                animationDuration: r.dur,
                ['--rain-opacity' as string]: r.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* 3. Stratified 3D Vapor Bands (Mist / Fog) */}
      {kind === 'mist' && (
        <div className="relative w-full h-full opacity-60">
          <div
            className="absolute top-1/4 -left-1/4 w-[150%] h-48 bg-gradient-to-r from-transparent via-slate-400/15 to-transparent blur-2xl animate-mist-drift"
            style={{ animationDuration: '18s' }}
          />
          <div
            className="absolute top-1/2 -left-1/4 w-[150%] h-64 bg-gradient-to-r from-transparent via-sky-300/12 to-transparent blur-3xl animate-mist-drift"
            style={{ animationDuration: '24s', animationDelay: '-6s' }}
          />
          <div
            className="absolute top-3/4 -left-1/4 w-[150%] h-40 bg-gradient-to-r from-transparent via-zinc-400/15 to-transparent blur-2xl animate-mist-drift"
            style={{ animationDuration: '20s', animationDelay: '-12s' }}
          />
        </div>
      )}

      {/* 4. Atmospheric Cloud Strata Drift (Cloudy & Overcast) */}
      {kind === 'cloud-drift' && (
        <div className="relative w-full h-full opacity-40">
          <div
            className="absolute top-12 -left-1/3 w-[160%] h-72 bg-gradient-to-r from-transparent via-sky-400/10 to-transparent blur-3xl animate-mist-drift"
            style={{ animationDuration: '32s' }}
          />
          <div
            className="absolute top-1/3 -left-1/3 w-[160%] h-80 bg-gradient-to-r from-transparent via-indigo-400/8 to-transparent blur-3xl animate-mist-drift"
            style={{ animationDuration: '40s', animationDelay: '-15s' }}
          />
        </div>
      )}

      {/* 5. Crystalline Snow Flurry */}
      {kind === 'snow' && (
        <div className="relative w-full h-full">
          {snowFlakes.map((s) => (
            <div
              key={s.id}
              className="absolute rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)] animate-snow-tumble"
              style={{
                left: s.left,
                top: '-40px',
                width: `${s.size}px`,
                height: `${s.size}px`,
                animationDelay: s.delay,
                animationDuration: s.dur,
                ['--drift-x' as string]: s.driftX,
              }}
            />
          ))}
        </div>
      )}

      {/* 6. Diamond Celestial Starfield */}
      {kind === 'stars' && (
        <div className="relative w-full h-full">
          {nightStars.map((st) => (
            <div
              key={st.id}
              className={`absolute animate-star-twinkle ${
                st.diamond ? 'rotate-45 bg-indigo-100 shadow-[0_0_12px_rgba(199,210,254,0.8)]' : 'rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
              }`}
              style={{
                left: st.left,
                top: st.top,
                width: `${st.size}px`,
                height: `${st.size}px`,
                animationDelay: st.delay,
                animationDuration: st.dur,
              }}
            />
          ))}
        </div>
      )}

      {/* 7. Twilight Floating Embers */}
      {kind === 'twilight' && (
        <div className="relative w-full h-full">
          {twilightEmbers.map((em) => (
            <div
              key={em.id}
              className="absolute rounded-full animate-float-particle shadow-[0_0_8px_rgba(251,113,133,0.6)]"
              style={{
                left: em.left,
                top: em.top,
                width: `${em.size}px`,
                height: `${em.size}px`,
                backgroundColor: em.color,
                animationDelay: em.delay,
                animationDuration: em.dur,
                ['--drift-x' as string]: em.driftX,
                ['--target-opacity' as string]: 0.7,
              }}
            />
          ))}
        </div>
      )}

      {/* 8. Thunder Ion Plasma Glow */}
      {kind === 'electric' && (
        <div className="relative w-full h-full">
          <div className="absolute inset-0 bg-violet-600/10 mix-blend-screen animate-electric-flicker pointer-events-none" />
        </div>
      )}
    </div>
  );
};
