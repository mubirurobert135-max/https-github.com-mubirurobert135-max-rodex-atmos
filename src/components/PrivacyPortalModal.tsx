import React, { useState } from 'react';
import { 
  X, ShieldCheck, UserCheck, Mail, Smartphone, Lock, Download, 
  Trash2, MapPin, Mic, Compass, Sliders, CheckCircle2, AlertCircle, 
  RefreshCw, Sparkles, KeyRound, ExternalLink, ShieldAlert, FileJson, Edit2, Save, LogOut
} from 'lucide-react';
import { useAuth, DEFAULT_PREFERENCES } from '../context/AuthContext';

interface PrivacyPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuthModal?: () => void;
}

type PortalSection = 
  | 'overview' 
  | 'personal' 
  | 'location' 
  | 'voice' 
  | 'consent' 
  | 'export' 
  | 'security' 
  | 'delete';

export const PrivacyPortalModal: React.FC<PrivacyPortalModalProps> = ({
  isOpen,
  onClose,
  onOpenAuthModal
}) => {
  const { 
    user, 
    userProfile, 
    userPreferences, 
    isGuest, 
    isVerified, 
    isEmailVerified, 
    isPhoneVerified, 
    updateUserPreferences, 
    updateDisplayName, 
    exportUserData, 
    deleteAccountPermanently,
    logout 
  } = useAuth();

  const [activeSection, setActiveSection] = useState<PortalSection>('overview');

  // Edit Name State
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState(user?.displayName || userProfile?.displayName || '');

  // UI Feedback States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Deletion Confirmation Modal State
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePasswordInput, setDeletePasswordInput] = useState('');

  if (!isOpen) return null;

  // Clear notice banners on section switch
  const handleSwitchSection = (section: PortalSection) => {
    setActiveSection(section);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Handle saving display name
  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayNameInput.trim()) {
      setErrorMessage('Display name cannot be empty.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateDisplayName(displayNameInput.trim());
      setSuccessMessage('Display name updated successfully.');
      setIsEditingName(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update display name.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Privacy Preference Toggle
  const handleTogglePreference = async (key: keyof typeof DEFAULT_PREFERENCES, value: boolean) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateUserPreferences({ [key]: value });
      setSuccessMessage(`Updated preference: ${key} = ${value ? 'Enabled' : 'Disabled'}`);
    } catch (err: any) {
      setErrorMessage('Failed to save preference to your user profile.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Real Data Export
  const handleDownloadExport = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const exportData = await exportUserData();
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rodex_atmos_privacy_export_${user?.uid || 'user'}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccessMessage('Data export generated and downloaded successfully.');
    } catch (err: any) {
      setErrorMessage(`Data export failed: ${err.message || 'Error occurred.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Permanent Account Deletion
  const handleConfirmAccountDeletion = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setErrorMessage('Please type DELETE in capital letters to confirm account removal.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deleteAccountPermanently(deletePasswordInput || undefined);
      setShowDeleteConfirmModal(false);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Account deletion failed. You may need to sign out and sign back in before deleting.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Privacy and Account Portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/85 backdrop-blur-xl animate-fade-in"
    >
      <div className="relative w-full max-w-4xl bg-[#0a1426]/95 border border-sky-400/25 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden backdrop-blur-2xl text-white flex flex-col max-h-[90dvh]">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg text-white font-bold shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-wide text-white flex items-center gap-2">
                Privacy <span className="text-sky-300 font-light">& Account Portal</span>
              </h2>
              <p className="text-xs text-sky-200/70 font-medium">
                Individual Privacy Controls, Data Ownership & Security
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Portal Body with Sidebar Navigation */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Navigation Sidebar */}
          <div className="w-full md:w-64 bg-slate-950/40 border-b md:border-b-0 md:border-r border-white/10 p-3 flex md:flex-col gap-1 overflow-x-auto shrink-0 scrollbar-none">
            <button
              onClick={() => handleSwitchSection('overview')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'overview' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <UserCheck className="w-4 h-4 shrink-0" /> Overview
            </button>
            <button
              onClick={() => handleSwitchSection('personal')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'personal' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Mail className="w-4 h-4 shrink-0" /> Personal Info
            </button>
            <button
              onClick={() => handleSwitchSection('location')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'location' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <MapPin className="w-4 h-4 shrink-0" /> Location Privacy
            </button>
            <button
              onClick={() => handleSwitchSection('voice')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'voice' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Mic className="w-4 h-4 shrink-0" /> AI & Voice
            </button>
            <button
              onClick={() => handleSwitchSection('consent')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'consent' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Sliders className="w-4 h-4 shrink-0" /> Preferences
            </button>
            <button
              onClick={() => handleSwitchSection('export')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'export' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Download className="w-4 h-4 shrink-0" /> Export Data
            </button>
            <button
              onClick={() => handleSwitchSection('security')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'security' ? 'bg-sky-500 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Lock className="w-4 h-4 shrink-0" /> Security
            </button>
            <button
              onClick={() => handleSwitchSection('delete')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition shrink-0 whitespace-nowrap text-left ${activeSection === 'delete' ? 'bg-rose-500 text-white shadow-lg' : 'text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200'}`}
            >
              <Trash2 className="w-4 h-4 shrink-0" /> Delete Account
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-5">

            {/* Feedback Notices */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Guest Banner Explanation */}
            {isGuest && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs space-y-2">
                <div className="font-bold flex items-center gap-2 text-amber-300">
                  <Sparkles className="w-4 h-4" /> Guest Mode Active
                </div>
                <p className="leading-relaxed">
                  You are currently using RODEX Atmos as a Guest. You have access to weather features and location controls, but personal account preferences and cloud data export require an authenticated session.
                </p>
                {onOpenAuthModal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAuthModal();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold transition"
                  >
                    Sign In or Register
                  </button>
                )}
              </div>
            )}

            {/* SECTION 1: ACCOUNT OVERVIEW */}
            {activeSection === 'overview' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-400" /> Account Overview
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Authenticated Identity</span>
                    <span className="font-bold text-white break-all">{user ? user.email || user.phoneNumber || user.uid : 'Guest Session'}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Account Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full font-bold uppercase ${isVerified ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'}`}>
                      {isGuest ? 'Guest' : isVerified ? 'Verified Account' : 'Pending Verification'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Firebase UID</span>
                    <span className="font-mono text-sky-300 break-all">{user?.uid || 'N/A (Guest)'}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Sign-In Providers</span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {user?.providerData && user.providerData.length > 0 ? (
                        user.providerData.map((p) => (
                          <span key={p.providerId} className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-200 border border-sky-400/30 text-[10px] font-semibold">
                            {p.providerId === 'google.com' ? 'Google' : p.providerId === 'password' ? 'Email/Password' : p.providerId === 'phone' ? 'Phone SMS' : p.providerId}
                          </span>
                        ))
                      ) : (
                        <span className="text-white/40">None (Guest)</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Account Creation Date</span>
                    <span className="text-white/80">{userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Session duration only'}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <span className="text-white/50 block font-semibold">Last Sign-In</span>
                    <span className="text-white/80">{user?.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Active session'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: PERSONAL INFORMATION */}
            {activeSection === 'personal' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-sky-400" /> Personal Information
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <label className="text-xs font-semibold text-sky-200 block">Display Name</label>
                      <span className="text-sm font-bold text-white">{userProfile?.displayName || user?.displayName || 'Not specified'}</span>
                    </div>

                    {!isGuest && (
                      !isEditingName ? (
                        <button
                          onClick={() => {
                            setDisplayNameInput(userProfile?.displayName || user?.displayName || '');
                            setIsEditingName(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition flex items-center gap-1.5 self-start"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-sky-300" /> Edit
                        </button>
                      ) : (
                        <form onSubmit={handleSaveDisplayName} className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="text"
                            value={displayNameInput}
                            onChange={(e) => setDisplayNameInput(e.target.value)}
                            placeholder="Enter name"
                            className="bg-slate-900 border border-sky-400/40 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-full sm:w-40"
                          />
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition flex items-center gap-1 disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" /> Save
                          </button>
                        </form>
                      )
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    <div className="space-y-1">
                      <span className="text-white/50 block font-semibold">Registered Email</span>
                      <span className="text-white font-mono break-all">{user?.email || 'None'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-white/50 block font-semibold">Registered Phone</span>
                      <span className="text-white font-mono">{user?.phoneNumber || userProfile?.phoneNumber || 'None'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border border-white/10 text-[11px] text-white/60 leading-relaxed">
                    <strong>Data Integrity Disclosure:</strong> RODEX Atmos stores only basic account identifiers (`uid`, `displayName`, `email`, `phoneNumber`, `createdAt`) in Firestore. Passwords, secret keys, or authentication tokens are managed securely by Firebase Auth and are never exposed or saved to Firestore.
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: LOCATION PRIVACY CONTROLS */}
            {activeSection === 'location' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-400" /> Location Privacy Controls
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  
                  {/* Automatic Location Toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-white">Automatic Device Location Lookup</div>
                      <div className="text-xs text-white/60">Automatically fetch local weather on application startup using GPS / IP geolocation.</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePreference('autoLocationEnabled', !userPreferences.autoLocationEnabled)}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${userPreferences.autoLocationEnabled ? 'bg-sky-500' : 'bg-slate-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${userPreferences.autoLocationEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="border-t border-white/10 pt-3 space-y-2 text-xs text-white/70 leading-relaxed">
                    <p>
                      <strong>How Location Processing Works:</strong> Coordinates (`lat`, `lon`) are passed to Open-Meteo's weather API strictly to retrieve temperature and forecast measurements.
                    </p>
                    <p>
                      RODEX Atmos <strong>does not record movement history</strong>, continuous background tracking, or location paths.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: AI & VOICE PRIVACY */}
            {activeSection === 'voice' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-sky-400" /> AI & Voice Privacy (Hey Atmos)
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-white">Optional Voice Metrics & Analytics</div>
                      <div className="text-xs text-white/60">Allow non-sensitive operational timing metrics (e.g. latency duration) to improve voice assistant connection speed.</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePreference('allowVoiceAnalytics', !userPreferences.allowVoiceAnalytics)}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${userPreferences.allowVoiceAnalytics ? 'bg-sky-500' : 'bg-slate-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${userPreferences.allowVoiceAnalytics ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="border-t border-white/10 pt-3 space-y-2 text-xs text-white/70 leading-relaxed">
                    <p>
                      <strong>Voice Streaming Security:</strong> Hey Atmos opens a real-time Gemini Live WebSocket session (`wss://generativelanguage.googleapis.com`) using short-lived ephemeral tokens generated server-side.
                    </p>
                    <p>
                      <strong>No Recording Persistence:</strong> Microphone audio input is converted to PCM audio buffers in-memory for active spoken queries and is <strong>never saved to disk or database storage</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: DATA & CONSENT PREFERENCES */}
            {activeSection === 'consent' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-400" /> Data & Consent Preferences
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4 text-xs">
                  
                  {/* Preference 1 */}
                  <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
                    <div>
                      <div className="font-bold text-white text-sm">Remember Session Preferences</div>
                      <div className="text-white/60">Persist temperature unit (°C/°F) and theme choices across browser sessions.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePreference('rememberLocationAcrossSessions', !userPreferences.rememberLocationAcrossSessions)}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${userPreferences.rememberLocationAcrossSessions ? 'bg-sky-500' : 'bg-slate-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${userPreferences.rememberLocationAcrossSessions ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Preference 2 */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-white text-sm">Save Favorite Cities</div>
                      <div className="text-white/60">Allow bookmarking cities to your user profile for quick weather access.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePreference('saveFavoriteCities', !userPreferences.saveFavoriteCities)}
                      disabled={isLoading}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${userPreferences.saveFavoriteCities ? 'bg-sky-500' : 'bg-slate-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${userPreferences.saveFavoriteCities ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* SECTION 6: EXPORT MY DATA */}
            {activeSection === 'export' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-sky-400" /> Export My Data
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <p className="text-xs text-white/80 leading-relaxed">
                    Request a structured, downloadable JSON export containing all personal profile information, preferences, and user-owned data stored by RODEX Atmos.
                  </p>

                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-400/20 text-xs text-sky-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <FileJson className="w-4 h-4 text-sky-300" /> Export Payload Contents:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-white/70">
                      <li>Authenticated Account Overview & Provider Data</li>
                      <li>Privacy & Location Preferences</li>
                      <li>Saved Favorite Locations</li>
                      <li>Export Metadata & Verification Timestamps</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleDownloadExport}
                    disabled={isLoading || isGuest}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span>Generate & Download Personal Data Export (.JSON)</span>
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 7: ACCOUNT SECURITY */}
            {activeSection === 'security' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-sky-400" /> Account Security
                </h3>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <div className="font-bold text-white text-sm">Active Session</div>
                      <div className="text-white/60">Signed in as {user?.email || user?.phoneNumber || 'Guest'}</div>
                    </div>
                    {!isGuest && (
                      <button
                        onClick={logout}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold transition flex items-center gap-1.5 self-start"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-white block">Security Features</span>
                    <ul className="space-y-1.5 text-white/70">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Firebase Authentication Token Validation</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Firestore Security Rules (Owner-Only Access)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Zero Password / Token Exposure in Firestore</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 8: DELETE MY ACCOUNT */}
            {activeSection === 'delete' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" /> Permanent Account Deletion
                </h3>

                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-4 text-xs">
                  <div className="flex items-start gap-2.5 text-rose-200">
                    <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-300 text-sm">Permanent Action Warning</div>
                      <p className="mt-1 leading-relaxed text-rose-200/80">
                        Deleting your account will permanently remove your profile (`/users/{user?.uid}`), saved preferences, and authentication records from RODEX Atmos.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowDeleteConfirmModal(true)}
                    disabled={isGuest}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Initiate Account Deletion</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Account Deletion Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-3xl p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Confirm Account Deletion</h3>
            </div>

            <p className="text-xs text-white/80 leading-relaxed">
              This will permanently erase your user profile and settings. Type <strong>DELETE</strong> in capital letters below to confirm:
            </p>

            {/* Inline Error Notice inside modal */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Type DELETE"
              className="w-full bg-slate-950 border border-rose-500/40 rounded-xl px-3.5 py-2.5 text-sm text-center font-mono tracking-widest text-white outline-none focus:ring-2 focus:ring-rose-500"
            />

            {/* Password input for Email/Password provider re-authentication */}
            {user?.providerData.some((p) => p.providerId === 'password') && (
              <div className="space-y-1.5">
                <label className="text-xs text-white/70 font-semibold block">
                  Account Password (Required for Email Re-authentication):
                </label>
                <input
                  type="password"
                  value={deletePasswordInput}
                  onChange={(e) => setDeletePasswordInput(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-rose-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setErrorMessage(null);
                  setDeleteConfirmText('');
                  setDeletePasswordInput('');
                }}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAccountDeletion}
                disabled={isLoading || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-rose-600/30"
              >
                {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
