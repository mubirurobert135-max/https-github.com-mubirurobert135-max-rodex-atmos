import React from 'react';
import { WifiOff, Cloud, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-amber-400/40 text-amber-200 text-xs font-semibold shadow-2xl backdrop-blur-xl animate-bounce-subtle">
      <div className="relative">
        <WifiOff className="w-4 h-4 text-amber-400" />
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 animate-ping" />
      </div>
      <div className="flex items-center gap-1.5">
        <span>Offline Mode</span>
        <span className="text-amber-200/60">•</span>
        <span className="text-amber-100 font-normal">Displaying cached forecast & map data</span>
      </div>
    </div>
  );
};
