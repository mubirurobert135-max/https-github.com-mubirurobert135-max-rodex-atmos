import React from 'react';
import { AtmosphericTheme } from '../utils/weatherUtils';

interface AtmosphericBackgroundProps {
  theme: AtmosphericTheme;
}

/**
 * RODEX Atmos reference background.
 * The former storm-photo / particle scene is intentionally removed.
 * All weather states now share the same polished lavender-violet brand
 * environment so the foreground interface remains visually consistent.
 */
export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({ theme }) => {
  return (
    <div
      aria-hidden="true"
      data-weather={theme}
      className="atmos-reference-background fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{
        background: [
          'radial-gradient(ellipse at 12% 28%, rgba(132, 78, 231, .42), transparent 42%)',
          'radial-gradient(ellipse at 56% 18%, rgba(232, 229, 245, .28), transparent 38%)',
          'radial-gradient(ellipse at 88% 76%, rgba(200, 192, 246, .30), transparent 40%)',
          'linear-gradient(118deg, #844EE7 0%, #9579EF 28%, #9D91F7 52%, #C8C0F6 77%, #9D91F7 100%)'
        ].join(', '),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute -top-36 -left-36 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: 'rgba(132, 78, 231, .16)' }}
      />
      <div
        className="absolute top-1/4 -right-40 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{ background: 'rgba(232, 229, 245, .20)' }}
      />
    </div>
  );
};
