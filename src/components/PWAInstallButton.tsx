import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X, CheckCircle2, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showInstalledToast, setShowInstalledToast] = useState(false);

  // If already installed or running as standalone app, hide install trigger
  if (isInstalled) {
    return null;
  }

  // Desktop / Chromium / Android flow
  if (isInstallable) {
    return (
      <button
        onClick={async () => {
          const success = await install();
          if (success) {
            setShowInstalledToast(true);
            setTimeout(() => setShowInstalledToast(false), 4000);
          }
        }}
        className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 text-sky-200 border border-sky-400/30 text-xs font-bold transition-all duration-300 shadow-md backdrop-blur-md btn-hover-lift"
        title="Install RODEX Atmos as a Progressive Web App"
      >
        <Download className="w-3.5 h-3.5 text-sky-300 animate-bounce" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-sky-200 border border-white/20 text-xs font-bold transition-all duration-300 shadow-md backdrop-blur-md btn-hover-lift"
          title="Install RODEX Atmos on iPhone or iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-300" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-sky-400/30 p-6 shadow-2xl text-white space-y-4 relative">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                <Smartphone className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-bold font-heading text-white">Install RODEX Atmos on iOS</h3>
                <p className="text-xs text-sky-200/80 mt-1">
                  Enjoy instant offline weather forecasts and home screen access in two simple steps:
                </p>
              </div>

              <div className="space-y-3 bg-white/5 rounded-2xl p-4 border border-white/10 text-xs text-sky-100">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-300 font-bold shrink-0">
                    1
                  </div>
                  <div>
                    Tap the <strong className="text-white flex items-center gap-1 inline-flex">Share <Share2 className="w-3.5 h-3.5 text-sky-400" /></strong> icon in your Safari toolbar.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-300 font-bold shrink-0">
                    2
                  </div>
                  <div>
                    Scroll down and select <strong className="text-white flex items-center gap-1 inline-flex">Add to Home Screen <PlusSquare className="w-3.5 h-3.5 text-sky-400" /></strong>.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback indicator button if ambient install available
  return (
    <button
      onClick={() => {
        alert('To install RODEX Atmos, use your browser menu (e.g., Chrome "Install App" or "Add to Home screen").');
      }}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/10 hover:bg-white/20 text-sky-200 border border-white/15 text-xs font-semibold transition"
      title="PWA Offline Ready"
    >
      <Download className="w-3.5 h-3.5 text-sky-300" />
      <span>PWA Ready</span>
    </button>
  );
};
