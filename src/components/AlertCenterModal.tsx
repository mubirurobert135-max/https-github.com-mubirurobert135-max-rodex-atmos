import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  Sparkles, 
  ExternalLink, 
  Check, 
  Volume2, 
  Clock, 
  Send, 
  SlidersHorizontal,
  CloudRain,
  Wind,
  Thermometer,
  Sun
} from 'lucide-react';
import { WeatherAlert, NotificationPreferences } from '../types';
import { useAuth } from '../context/AuthContext';

interface AlertCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: WeatherAlert[];
  locationName: string;
  onOpenAssistant?: (prompt?: string) => void;
}

export const AlertCenterModal: React.FC<AlertCenterModalProps> = ({
  isOpen,
  onClose,
  alerts,
  locationName,
  onOpenAssistant
}) => {
  const { notificationPreferences, updateNotificationPreferences, isGuest } = useAuth();
  const [activeTab, setActiveTab] = useState<'alerts' | 'preferences'>('alerts');
  const [localNotifPrefs, setLocalNotifPrefs] = useState<NotificationPreferences>(notificationPreferences);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setLocalNotifPrefs(notificationPreferences);
  }, [notificationPreferences]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  if (!isOpen) return null;

  const requestBrowserPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser web notifications are not supported in your browser.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);
      if (perm === 'granted') {
        const updated = { ...localNotifPrefs, browserPush: true };
        setLocalNotifPrefs(updated);
        await updateNotificationPreferences(updated);
        setSaveSuccessMsg('Browser push notifications enabled successfully!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        const updated = { ...localNotifPrefs, browserPush: false };
        setLocalNotifPrefs(updated);
        await updateNotificationPreferences(updated);
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
    }
  };

  const handleSavePreferences = async () => {
    await updateNotificationPreferences(localNotifPrefs);
    setSaveSuccessMsg('Notification preferences updated!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const getSeverityBadgeClass = (severity: string, type: string) => {
    if (type === 'official') {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    switch (severity) {
      case 'extreme':
      case 'severe':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'moderate':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
    }
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Smart Weather Alerts and Notification Preferences"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xl animate-fade-in"
    >
      <div className="relative w-full max-w-2xl bg-[#0a1426]/95 border border-sky-400/30 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] text-white">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 bg-[#070e1c] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-display tracking-wide">
                Smart Weather Alerts & Preferences
              </h3>
              <p className="text-xs text-sky-200/70">
                Proactive intelligence for {locationName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-sky-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 bg-slate-950/60 px-6">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold transition border-b-2 ${
              activeTab === 'alerts'
                ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Active Alerts ({alerts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold transition border-b-2 ${
              activeTab === 'preferences'
                ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Alert Preferences</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {saveSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Tab 1: Active Alerts */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="py-12 text-center text-sky-200/70 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mx-auto text-emerald-400">
                    <Check className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-white">All Clear in {locationName}</h4>
                  <p className="text-xs max-w-sm mx-auto">
                    No severe weather warnings or forecast alerts are currently active for this region. Conditions are normal.
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-5 rounded-2xl border backdrop-blur-xl transition ${
                      alert.type === 'official'
                        ? 'bg-rose-950/40 border-rose-500/40'
                        : alert.severity === 'severe' || alert.severity === 'extreme'
                        ? 'bg-amber-950/40 border-amber-500/40'
                        : 'bg-sky-950/40 border-sky-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getSeverityBadgeClass(alert.severity, alert.type)}`}>
                          {alert.type === 'official' ? 'Official Warning' : `${alert.severity} Alert`}
                        </span>
                        <span className="text-xs text-sky-200/70 font-medium">
                          {alert.locationName}
                        </span>
                      </div>

                      {onOpenAssistant && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenAssistant(`Why did Atmos issue the notification "${alert.title}" for ${alert.locationName}?`);
                          }}
                          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sm transition active:scale-95"
                          title="Ask RODEX AI for natural language explanation"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Ask AI</span>
                        </button>
                      )}
                    </div>

                    <h4 className="text-base font-bold text-white mb-1">{alert.title}</h4>
                    <p className="text-xs text-white/90 leading-relaxed mb-3">{alert.description}</p>

                    {alert.instruction && (
                      <div className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs text-sky-200/90 mb-3 font-mono">
                        <span className="font-bold text-amber-300 block mb-0.5">Safety Instruction:</span>
                        {alert.instruction}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-sky-200/60 pt-2 border-t border-white/10 flex-wrap gap-2">
                      <span>Source: {alert.issuingAuthority || 'Meteorological Service'}</span>
                      {alert.expires && (
                        <span>Valid until: {new Date(alert.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Notification Preferences */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              
              {/* Daily Briefing Toggle */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Personalised Daily Briefing</h4>
                    <p className="text-xs text-sky-200/70">Receive a morning summary card on the forecast dashboard.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localNotifPrefs.dailyBriefing}
                    onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, dailyBriefing: e.target.checked })}
                    className="w-5 h-5 rounded border-sky-400/40 text-sky-500 focus:ring-sky-400 accent-sky-500 cursor-pointer"
                  />
                </div>

                {localNotifPrefs.dailyBriefing && (
                  <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span className="text-xs text-sky-200">Preferred Briefing Time:</span>
                    <input
                      type="time"
                      value={localNotifPrefs.dailyBriefingTime}
                      onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, dailyBriefingTime: e.target.value })}
                      className="bg-slate-800 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                )}
              </div>

              {/* Alert Category Thresholds */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="text-sm font-bold text-white mb-2">Supported Weather Conditions</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      Official Severe Warnings
                    </span>
                    <input
                      type="checkbox"
                      checked={localNotifPrefs.alertCategories.severeWeather}
                      onChange={(e) => setLocalNotifPrefs({
                        ...localNotifPrefs,
                        alertCategories: { ...localNotifPrefs.alertCategories, severeWeather: e.target.checked }
                      })}
                      className="w-4 h-4 accent-sky-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <span className="flex items-center gap-2">
                      <CloudRain className="w-4 h-4 text-sky-400" />
                      Heavy Rain & Thunderstorms
                    </span>
                    <input
                      type="checkbox"
                      checked={localNotifPrefs.alertCategories.rainThunderstorms}
                      onChange={(e) => setLocalNotifPrefs({
                        ...localNotifPrefs,
                        alertCategories: { ...localNotifPrefs.alertCategories, rainThunderstorms: e.target.checked }
                      })}
                      className="w-4 h-4 accent-sky-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <span className="flex items-center gap-2">
                      <Wind className="w-4 h-4 text-indigo-300" />
                      Strong Winds (&gt;40 km/h)
                    </span>
                    <input
                      type="checkbox"
                      checked={localNotifPrefs.alertCategories.strongWinds}
                      onChange={(e) => setLocalNotifPrefs({
                        ...localNotifPrefs,
                        alertCategories: { ...localNotifPrefs.alertCategories, strongWinds: e.target.checked }
                      })}
                      className="w-4 h-4 accent-sky-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <span className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-amber-400" />
                      Extreme Heat / Freezing
                    </span>
                    <input
                      type="checkbox"
                      checked={localNotifPrefs.alertCategories.extremeTemps}
                      onChange={(e) => setLocalNotifPrefs({
                        ...localNotifPrefs,
                        alertCategories: { ...localNotifPrefs.alertCategories, extremeTemps: e.target.checked }
                      })}
                      className="w-4 h-4 accent-sky-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 col-span-1 sm:col-span-2">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-300" />
                      High UV Index Warning (&ge;8)
                    </span>
                    <input
                      type="checkbox"
                      checked={localNotifPrefs.alertCategories.uvWarning}
                      onChange={(e) => setLocalNotifPrefs({
                        ...localNotifPrefs,
                        alertCategories: { ...localNotifPrefs.alertCategories, uvWarning: e.target.checked }
                      })}
                      className="w-4 h-4 accent-sky-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Browser Web Push Notifications */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Browser Push Notifications</h4>
                    <p className="text-xs text-sky-200/70">
                      Deliver real-time alerts through your browser while RODEX Atmos is open in any tab.
                    </p>
                  </div>

                  <button
                    onClick={requestBrowserPushPermission}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      browserPermission === 'granted'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : browserPermission === 'denied'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40 cursor-not-allowed'
                        : 'bg-sky-500 hover:bg-sky-400 text-white'
                    }`}
                  >
                    {browserPermission === 'granted'
                      ? 'Push Enabled'
                      : browserPermission === 'denied'
                      ? 'Permission Denied'
                      : 'Enable Web Push'}
                  </button>
                </div>

                <p className="text-[11px] text-sky-200/60 leading-normal">
                  Status: {browserPermission === 'granted' ? 'Active in browser tab.' : browserPermission === 'denied' ? 'Blocked in browser permissions setting.' : 'Permission required.'} On-screen alerts remain active regardless.
                </p>
              </div>

              {/* Quiet Hours */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">Quiet Hours</h4>
                    <p className="text-xs text-sky-200/70">Suppress non-critical audio/push alerts during night hours.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localNotifPrefs.quietHoursEnabled}
                    onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, quietHoursEnabled: e.target.checked })}
                    className="w-5 h-5 rounded border-sky-400/40 text-sky-500 accent-sky-500 cursor-pointer"
                  />
                </div>

                {localNotifPrefs.quietHoursEnabled && (
                  <div className="flex items-center gap-3 pt-2 border-t border-white/10 text-xs text-sky-200">
                    <span>From:</span>
                    <input
                      type="time"
                      value={localNotifPrefs.quietHoursStart}
                      onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, quietHoursStart: e.target.value })}
                      className="bg-slate-800 border border-white/20 rounded-lg px-2 py-1 text-white"
                    />
                    <span>To:</span>
                    <input
                      type="time"
                      value={localNotifPrefs.quietHoursEnd}
                      onChange={(e) => setLocalNotifPrefs({ ...localNotifPrefs, quietHoursEnd: e.target.value })}
                      className="bg-slate-800 border border-white/20 rounded-lg px-2 py-1 text-white"
                    />
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSavePreferences}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition active:scale-95"
                >
                  Save Alert Preferences
                </button>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
};
