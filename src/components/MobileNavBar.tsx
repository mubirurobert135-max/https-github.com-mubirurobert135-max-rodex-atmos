import React from 'react';
import { Compass, Globe, Sparkles, Mic, Bell, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Track the pointer inside a navigation control so its highlight follows the cursor.
const updateNavPointer = (event: React.PointerEvent<HTMLElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', (event.clientX - bounds.left) + 'px');
  event.currentTarget.style.setProperty('--pointer-y', (event.clientY - bounds.top) + 'px');
};

interface MobileNavBarProps {

  activeTab: 'dashboard' | 'map';
  onSelectTab: (tab: 'dashboard' | 'map') => void;
  onOpenAssistant: () => void;
  onOpenAlerts: () => void;
  onOpenAuth: () => void;
  onOpenPrivacy: () => void;
  activeAlertsCount: number;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenAssistant,
  onOpenAlerts,
  onOpenAuth,
  onOpenPrivacy,
  activeAlertsCount
}) => {
  const { user, userProfile, isVerified } = useAuth();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[520px] z-40 lg:hidden bg-black/85 backdrop-blur-2xl border border-white/25 rounded-[22px] px-2 pt-1 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-2xl transition-all"
    >
      <div className="max-w-md mx-auto grid grid-cols-6 items-center justify-items-center">
        
        {/* 1. Dashboard Tab */}
        <button
          onClick={() => onSelectTab('dashboard')}
          onPointerMove={updateNavPointer}
          className={`rodex-pointer-spotlight flex flex-col items-center justify-center w-full min-h-[48px] py-1 px-1 rounded-xl transition-all ${
            activeTab === 'dashboard'
              ? 'text-white'
              : 'text-white/60 hover:text-white/90'
          }`}
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          aria-label="Weather Dashboard"
        >
          <div className="relative">
            <Compass className={`w-5 h-5 transition-transform ${activeTab === 'dashboard' ? 'scale-110 text-white' : ''}`} />
            {activeTab === 'dashboard' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight mt-1"><span className="min-[420px]:inline hidden">Dashboard</span><span className="min-[420px]:hidden">Home</span></span>
        </button>

        {/* 2. Interactive Weather Map Tab */}
        <button
          onClick={() => onSelectTab('map')}
          onPointerMove={updateNavPointer}
          className={`rodex-pointer-spotlight flex flex-col items-center justify-center w-full min-h-[48px] py-1 px-1 rounded-xl transition-all ${
            activeTab === 'map'
              ? 'text-white'
              : 'text-white/60 hover:text-white/90'
          }`}
          aria-current={activeTab === 'map' ? 'page' : undefined}
          aria-label="Interactive Weather Map"
        >
          <div className="relative">
            <Globe className={`w-5 h-5 transition-transform ${activeTab === 'map' ? 'scale-110 text-white' : ''}`} />
            {activeTab === 'map' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight mt-1">Map</span>
        </button>

        {/* 3. Centerpiece RODEX AI Voice & Chat Orb */}
        <div className="flex flex-col items-center justify-center -mt-5">
          <button
            onClick={onOpenAssistant}
            onPointerMove={updateNavPointer}
            className="rodex-pointer-spotlight w-13 h-13 rounded-full bg-gradient-to-br from-white via-neutral-200 to-neutral-400 hover:from-white hover:to-neutral-300 text-black shadow-xl shadow-black/35 border-2 border-white/70 flex items-center justify-center transition-transform active:scale-95 group"
            aria-label="Open RODEX AI Voice and Chat Assistant"
            title="Open RODEX AI Assistant"
          >
            <div className="relative flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black group-hover:rotate-12 transition-transform" />
              <Mic className="w-3 h-3 text-neutral-800 absolute -bottom-1 -right-1" />
            </div>
          </button>
          <span className="text-[9px] font-extrabold tracking-wider text-white/85 uppercase mt-1">RODEX AI</span>
        </div>

        {/* 4. Weather Alerts Tab */}
        <button
          onClick={onOpenAlerts}
          onPointerMove={updateNavPointer}
          className="rodex-pointer-spotlight flex flex-col items-center justify-center w-full min-h-[48px] py-1 px-1 rounded-xl text-white/60 hover:text-white/90 transition-all relative"
          aria-label={`Weather Alerts (${activeAlertsCount} active)`}
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {activeAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 bg-neutral-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {activeAlertsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight mt-1">Alerts</span>
        </button>

        {/* 5. User Account / Security Tab */}
        <button
          onClick={onOpenAuth}
          onPointerMove={updateNavPointer}
          className="rodex-pointer-spotlight flex flex-col items-center justify-center w-full min-h-[48px] py-1 px-1 rounded-xl text-white/60 hover:text-white/90 transition-all"
          aria-label={user ? 'Account and Privacy' : 'Sign In'}
        >
          <div className="relative">
            {(user?.providerData.find((provider) => provider.providerId === 'google.com')?.photoURL || userProfile?.photoURL || user?.photoURL) ? (
              <img
                src={(user?.providerData.find((provider) => provider.providerId === 'google.com')?.photoURL || userProfile?.photoURL || user?.photoURL)!}
                alt={user?.displayName || userProfile?.displayName || 'Account profile'}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover ring-1 ring-white/50"
              />
            ) : (
              <User className="w-5 h-5" />
            )}
            {user && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-neutral-950 ${
                  isVerified ? 'bg-neutral-400' : 'bg-neutral-400'
                }`}
              />
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-tight mt-1">
            Account
          </span>
        </button>

        {/* Privacy and personal-data controls remain one tap away on phones and tablets. */}
        <button
          onClick={onOpenPrivacy}
          onPointerMove={updateNavPointer}
          className="rodex-pointer-spotlight flex flex-col items-center justify-center w-full min-h-[48px] py-1 px-0.5 rounded-xl text-white/60 hover:text-white/90 transition-all"
          aria-label="Privacy Portal and Preferences"
          title="Privacy Portal"
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[9px] sm:text-[10px] font-semibold tracking-tight mt-1">Privacy</span>
        </button>

      </div>
    </nav>
  );
};
