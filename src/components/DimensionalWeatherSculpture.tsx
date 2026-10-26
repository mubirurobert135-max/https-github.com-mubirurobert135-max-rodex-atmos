import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { AtmosphericTheme } from '../utils/weatherUtils';

interface DimensionalWeatherSculptureProps {
  theme: AtmosphericTheme;
  isDay?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  interactive?: boolean;
}

export const DimensionalWeatherSculpture: React.FC<DimensionalWeatherSculptureProps> = ({
  theme,
  isDay = true,
  size = 'hero',
  className = '',
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  // Sanitize id for SVG attribute usage
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');

  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || prefersReducedMotion) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const xRel = (e.clientX - rect.left) / rect.width - 0.5;
    const yRel = (e.clientY - rect.top) / rect.height - 0.5;

    setTilt({
      x: Number((-yRel * 10).toFixed(2)),
      y: Number((xRel * 10).toFixed(2)),
    });
  };

  const handlePointerLeave = () => {
    if (!interactive || prefersReducedMotion) return;
    setTilt({ x: 0, y: 0 });
  };

  const dimensionClass = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'w-16 h-16 sm:w-20 sm:h-20';
      case 'md':
        return 'w-24 h-24 sm:w-28 sm:h-28';
      case 'lg':
        return 'w-36 h-36 sm:w-44 sm:h-44';
      case 'hero':
      default:
        return 'w-36 h-36 sm:w-52 sm:h-52 lg:w-64 lg:h-64';
    }
  }, [size]);

  const renderSculpture = () => {
    switch (theme) {
      case 'sunny':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(251,191,36,0.35)]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={`sun-corona-${uid}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fef08a" stopOpacity="0.5" />
                <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`sun-sphere-${uid}`} cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="25%" stopColor="#fef08a" />
                <stop offset="60%" stopColor="#f59e0b" />
                <stop offset="85%" stopColor="#d97706" />
                <stop offset="100%" stopColor="#b45309" />
              </radialGradient>
              <linearGradient id={`sun-specular-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                <stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`sun-ring-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde047" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#fb923c" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            <circle cx="100" cy="100" r="92" fill={`url(#sun-corona-${uid})`} className="animate-pulse" style={{ animationDuration: '4s' }} />

            <ellipse
              cx="100"
              cy="100"
              rx="78"
              ry="26"
              fill="none"
              stroke={`url(#sun-ring-${uid})`}
              strokeWidth="1.75"
              strokeDasharray="4 6"
              transform="rotate(-25 100 100)"
              className="opacity-60"
            />

            <circle cx="100" cy="100" r="54" fill={`url(#sun-sphere-${uid})`} />
            <ellipse cx="85" cy="80" rx="30" ry="20" fill={`url(#sun-specular-${uid})`} transform="rotate(-30 85 80)" />

            <circle cx="145" cy="65" r="3.5" fill="#fef08a" opacity="0.85" className="animate-ping" style={{ animationDuration: '3s' }} />
            <circle cx="58" cy="135" r="2.5" fill="#fde047" opacity="0.75" />
          </svg>
        );

      case 'cloudy':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(14,165,233,0.3)]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={`cloud-sun-${uid}`} cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#fffbeb" />
                <stop offset="35%" stopColor="#fde047" />
                <stop offset="75%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </radialGradient>
              <linearGradient id={`cloud-front-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="35%" stopColor="#e2e8f0" />
                <stop offset="75%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
              <linearGradient id={`cloud-back-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <filter id={`cloud-shadow-${uid}`} x="-10%" y="-10%" width="130%" height="130%">
                <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#070b14" floodOpacity="0.5" />
              </filter>
            </defs>

            <circle cx="132" cy="74" r="38" fill={`url(#cloud-sun-${uid})`} />
            <circle cx="132" cy="74" r="48" fill="#fef08a" opacity="0.2" className="animate-pulse" style={{ animationDuration: '3s' }} />

            <g opacity="0.7" transform="translate(10, -5)">
              <ellipse cx="75" cy="115" rx="35" ry="28" fill={`url(#cloud-back-grad-${uid})`} />
              <ellipse cx="110" cy="108" rx="28" ry="24" fill={`url(#cloud-back-grad-${uid})`} />
            </g>

            <g filter={`url(#cloud-shadow-${uid})`}>
              <path
                d="M 55 142 
                   A 26 26 0 0 1 76 102 
                   A 34 34 0 0 1 126 95 
                   A 26 26 0 0 1 155 125 
                   A 20 20 0 0 1 148 148 
                   L 55 148 
                   A 12 12 0 0 1 55 142 Z"
                fill={`url(#cloud-front-grad-${uid})`}
              />
              <path
                d="M 76 102 A 34 34 0 0 1 126 95"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.8"
              />
            </g>
          </svg>
        );

      case 'overcast':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(51,65,85,0.4)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`overcast-cloud-1-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="60%" stopColor="#64748b" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <linearGradient id={`overcast-cloud-2-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f1f5f9" />
                <stop offset="50%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>

            <path
              d="M 40 120 
                 A 32 32 0 0 1 75 78 
                 A 40 40 0 0 1 138 72 
                 A 30 30 0 0 1 170 110 
                 L 40 120 Z"
              fill={`url(#overcast-cloud-1-${uid})`}
              opacity="0.85"
            />

            <path
              d="M 45 148 
                 A 28 28 0 0 1 72 108 
                 A 36 36 0 0 1 126 102 
                 A 28 28 0 0 1 160 134 
                 A 18 18 0 0 1 152 152 
                 L 45 152 Z"
              fill={`url(#overcast-cloud-2-${uid})`}
            />

            <path
              d="M 72 108 A 36 36 0 0 1 126 102"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.75"
            />
          </svg>
        );

      case 'rainy':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(2,132,199,0.35)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`rain-cloud-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="30%" stopColor="#cbd5e1" />
                <stop offset="70%" stopColor="#64748b" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <linearGradient id={`raindrop-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#bae6fd" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
            </defs>

            {/* Volumetric Rain Cloud */}
            <path
              d="M 45 118 
                 A 24 24 0 0 1 68 84 
                 A 32 32 0 0 1 122 78 
                 A 24 24 0 0 1 154 104 
                 A 16 16 0 0 1 146 122 
                 L 45 122 Z"
              fill={`url(#rain-cloud-${uid})`}
            />

            {/* Top rim specular highlight */}
            <path
              d="M 68 84 A 32 32 0 0 1 122 78"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.9"
            />

            {/* 3D Angled Teardrop Rain Particles */}
            <g className="animate-pulse" style={{ animationDuration: '2s' }}>
              <line x1="68" y1="135" x2="60" y2="155" stroke={`url(#raindrop-grad-${uid})`} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="60" cy="155" r="2.2" fill="#38bdf8" />

              <line x1="95" y1="138" x2="87" y2="162" stroke={`url(#raindrop-grad-${uid})`} strokeWidth="4" strokeLinecap="round" />
              <circle cx="87" cy="162" r="2.5" fill="#38bdf8" />

              <line x1="122" y1="134" x2="114" y2="156" stroke={`url(#raindrop-grad-${uid})`} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="114" cy="156" r="2.2" fill="#38bdf8" />

              <line x1="144" y1="136" x2="136" y2="154" stroke={`url(#raindrop-grad-${uid})`} strokeWidth="3" strokeLinecap="round" />
            </g>

            {/* Concentric ripples */}
            <ellipse cx="88" cy="178" rx="30" ry="5" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.5" />
          </svg>
        );

      case 'thunder':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(168,85,247,0.4)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`thunder-cloud-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e2e8f0" />
                <stop offset="40%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e1b4b" />
              </linearGradient>
              <linearGradient id={`bolt-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#fef08a" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>
            </defs>

            <path
              d="M 45 110 
                 A 24 24 0 0 1 68 76 
                 A 32 32 0 0 1 122 70 
                 A 24 24 0 0 1 154 96 
                 A 16 16 0 0 1 146 114 
                 L 45 114 Z"
              fill={`url(#thunder-cloud-${uid})`}
            />

            <circle cx="100" cy="90" r="30" fill="#a855f7" opacity="0.3" className="animate-pulse" style={{ animationDuration: '1.2s' }} />

            <path
              d="M 104 104 L 88 132 L 102 134 L 86 174 L 118 128 L 104 126 Z"
              fill={`url(#bolt-grad-${uid})`}
              className="animate-pulse"
              style={{ animationDuration: '0.8s' }}
            />
          </svg>
        );

      case 'snowy':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(186,230,253,0.35)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`snow-cloud-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#e2e8f0" />
                <stop offset="100%" stopColor="#64748b" />
              </linearGradient>
            </defs>

            <path
              d="M 45 112 
                 A 24 24 0 0 1 68 78 
                 A 32 32 0 0 1 122 72 
                 A 24 24 0 0 1 154 98 
                 A 16 16 0 0 1 146 116 
                 L 45 116 Z"
              fill={`url(#snow-cloud-${uid})`}
            />

            <g stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" className="animate-spin-slow" style={{ animationDuration: '16s', transformOrigin: '75px 145px' }}>
              <line x1="75" y1="135" x2="75" y2="155" />
              <line x1="65" y1="145" x2="85" y2="145" />
              <line x1="68" y1="138" x2="82" y2="152" />
              <line x1="68" y1="152" x2="82" y2="138" />
            </g>

            <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" className="animate-spin-slow" style={{ animationDuration: '20s', transformOrigin: '125px 150px' }}>
              <line x1="125" y1="140" x2="125" y2="160" />
              <line x1="115" y1="150" x2="135" y2="150" />
              <line x1="118" y1="143" x2="132" y2="157" />
              <line x1="118" y1="157" x2="132" y2="143" />
            </g>
          </svg>
        );

      case 'fog':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(148,163,184,0.3)]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`fog-band-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#f8fafc" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            <circle cx="100" cy="85" r="38" fill="#f8fafc" opacity="0.35" className="blur-sm" />

            <rect x="35" y="75" width="130" height="8" rx="4" fill={`url(#fog-band-${uid})`} />
            <rect x="25" y="95" width="150" height="10" rx="5" fill={`url(#fog-band-${uid})`} />
            <rect x="45" y="118" width="115" height="9" rx="4.5" fill={`url(#fog-band-${uid})`} />
            <rect x="30" y="138" width="140" height="8" rx="4" fill={`url(#fog-band-${uid})`} />
          </svg>
        );

      case 'twilight':
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(244,63,94,0.35)]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={`twilight-sun-${uid}`} cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#9333ea" />
              </radialGradient>
              <linearGradient id={`horizon-glow-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0" />
                <stop offset="50%" stopColor="#fde047" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
              </linearGradient>
            </defs>

            <circle cx="100" cy="100" r="46" fill={`url(#twilight-sun-${uid})`} />

            <rect x="20" y="112" width="160" height="5" rx="2.5" fill={`url(#horizon-glow-${uid})`} />
            <rect x="35" y="125" width="130" height="4" rx="2" fill={`url(#horizon-glow-${uid})`} opacity="0.7" />
            <rect x="55" y="136" width="90" height="3" rx="1.5" fill={`url(#horizon-glow-${uid})`} opacity="0.4" />
          </svg>
        );

      case 'night':
      default:
        return (
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full drop-shadow-[0_20px_40px_rgba(99,102,241,0.35)]"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id={`moon-grad-${uid}`} cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#e0e7ff" />
                <stop offset="80%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4338ca" />
              </radialGradient>
              <radialGradient id={`moon-halo-${uid}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx="100" cy="100" r="85" fill={`url(#moon-halo-${uid})`} className="animate-pulse" style={{ animationDuration: '4s' }} />

            <path
              d="M 125 45 
                 A 55 55 0 1 0 148 145 
                 A 46 46 0 1 1 125 45 Z"
              fill={`url(#moon-grad-${uid})`}
            />

            <ellipse cx="85" cy="98" rx="5" ry="4" fill="#6366f1" opacity="0.35" />
            <ellipse cx="94" cy="120" rx="4" ry="3" fill="#6366f1" opacity="0.3" />
            <ellipse cx="102" cy="78" rx="3.5" ry="2.5" fill="#6366f1" opacity="0.25" />

            <g fill="#e0e7ff" className="animate-pulse" style={{ animationDuration: '3s' }}>
              <polygon points="152,65 154,72 161,74 154,76 152,83 150,76 143,74 150,72" />
              <circle cx="55" cy="60" r="2" opacity="0.8" />
              <circle cx="45" cy="130" r="1.5" opacity="0.6" />
              <polygon points="68,148 69,152 73,153 69,154 68,158 67,154 63,153 67,152" opacity="0.75" />
            </g>
          </svg>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative flex items-center justify-center select-none transition-transform duration-300 ease-out ${dimensionClass} ${className}`}
      style={{
        perspective: '1000px',
        transform: prefersReducedMotion
          ? 'none'
          : `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transformStyle: 'preserve-3d',
      }}
    >
      {renderSculpture()}
    </div>
  );
};
