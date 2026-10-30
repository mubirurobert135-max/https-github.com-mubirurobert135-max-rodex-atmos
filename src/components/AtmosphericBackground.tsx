import React from 'react';
import { AtmosphericTheme } from '../utils/weatherUtils';

interface AtmosphericBackgroundProps {
  theme: AtmosphericTheme;
}

/**
 * RODEX Atmos concept-board background.
 * Weather imagery remains in the weather cards. The app canvas uses a
 * stable pale-lavender atmosphere so text, maps and controls stay legible.
 */
export const AtmosphericBackground: React.FC<AtmosphericBackgroundProps> = ({ theme }) => {
  return (
    <div
      aria-hidden="true"
      data-weather={theme}
      className="atmos-reference-background fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      style={{
        background: [
          'radial-gradient(ellipse at 8% 18%, rgba(132, 78, 231, .18), transparent 40%)',
          'radial-gradient(ellipse at 92% 14%, rgba(200, 192, 246, .42), transparent 42%)',
          'radial-gradient(ellipse at 58% 100%, rgba(157, 145, 247, .16), transparent 45%)',
          'linear-gradient(125deg, #E8E5F5 0%, #DBD6F8 42%, #C8C0F6 78%, #E8E5F5 100%)'
        ].join(', '),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="absolute -top-36 -left-36 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: 'rgba(132, 78, 231, .08)' }}
      />
      <div
        className="absolute top-1/4 -right-40 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{ background: 'rgba(232, 229, 245, .28)' }}
      />
    </div>
  );
};
