import React from 'react';
import { AtmosphericTheme } from '../utils/weatherUtils';

interface AtmosphericBackgroundProps {
  theme: AtmosphericTheme;
}

/**
 * RODEX Atmos concept-board background.
 * Weather imagery remains in the weather cards. The app canvas uses a
 * stable black-and-charcoal atmosphere so text, maps and controls stay legible.
 */
export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({ theme }) => {
  return (
    <div
      aria-hidden="true"
      data-weather={theme}
      className="atmos-reference-background fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{
        background: [
          'radial-gradient(ellipse at 14% 8%, rgba(255, 255, 255, .045), transparent 42%)',
          'radial-gradient(ellipse at 88% 78%, rgba(255, 255, 255, .025), transparent 46%)',
          'linear-gradient(132deg, #090909 0%, #151515 52%, #0a0a0a 100%)'
        ].join(', '),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute -top-36 -left-36 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: 'rgba(255, 255, 255, .035)' }}
      />
      <div
        className="absolute top-1/4 -right-40 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{ background: 'rgba(255, 255, 255, .022)' }}
      />
    </div>
  );
};
