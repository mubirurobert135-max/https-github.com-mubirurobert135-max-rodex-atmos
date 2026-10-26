import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Mail, Lock, Phone, Eye, EyeOff, ShieldCheck, CheckCircle2, 
  AlertCircle, RefreshCw, Sparkles, KeyRound, Send, ArrowRight, UserCheck, Smartphone
} from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  signInWithPhoneNumber, 
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  fetchSignInMethodsForEmail,
  ConfirmationResult, 
  RecaptchaVerifier 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'signin' | 'register_email' | 'register_phone' | 'guest';
  onOpenPrivacyPortal?: () => void;
}

const COUNTRY_DIAL_CODES = [
  { code: '+256', name: 'Uganda', flag: '🇺🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+255', name: 'Tanzania', flag: '🇹🇿' },
  { code: '+250', name: 'Rwanda', flag: '🇷🇼' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+1', name: 'United States & Canada', flag: '🇺🇸' },
  { code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' }
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'signin',
  onOpenPrivacyPortal
}) => {
  const { user, isGuest, isEmailVerified, isPhoneVerified, isVerified, continueAsGuest, refreshUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'register_email' | 'register_phone' | 'guest'>(initialTab);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [countryCode, setCountryCode] = useState('+256');
  const [phoneNumber, setPhoneNumber] = useState('');

  // OTP state
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);

  // UI & Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Recaptcha container ref
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [initialTab, isOpen]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  if (!isOpen) return null;

  // Initialize reCAPTCHA Verifier for Phone Auth
  const setupRecaptcha = () => {
    if (!recaptchaVerifierRef.current && typeof window !== 'undefined') {
      try {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            console.log('[reCAPTCHA] Verified successfully');
          },
          'expired-callback': () => {
            console.warn('[reCAPTCHA] Expired, resetting');
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
          }
        });
      } catch (e) {
        console.warn('Recaptcha setup notice:', e);
      }
    }
  };

  // Google Sign-In with collision detection & account linking guidance
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      setSuccessMessage('Successfully signed in with Google!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setErrorMessage('Sign-in popup was closed before completion.');
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMessage('Sign-in popup was blocked by browser. Please allow popups for this site and try again.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        const pendingEmail = err.customData?.email || err.email || '';
        let methodsInfo = '';
        try {
          if (pendingEmail) {
            const methods = await fetchSignInMethodsForEmail(auth, pendingEmail);
            if (methods.includes('password')) {
              methodsInfo = ' using Email & Password';
            } else if (methods.length > 0) {
              methodsInfo = ` using (${methods.join(', ')})`;
            }
          }
        } catch (_) {}
        setErrorMessage(
          `An account already exists for ${pendingEmail}${methodsInfo}. Please sign in with your existing credentials first, then link your Google account.`
        );
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMessage('Google Sign-In is disabled in your Firebase Console. Please enable Google in Firebase Console -> Authentication -> Sign-in method.');
      } else {
        setErrorMessage(`Google Sign-In notice: ${err.message || 'Failed to sign in with Google.'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Link Google Account to current logged-in user
  const handleLinkGoogleAccount = async () => {
    if (!auth.currentUser) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(auth.currentUser, provider);
      setSuccessMessage('Google account successfully linked to your current profile!');
      await refreshUser();
    } catch (err: any) {
      console.error('Link Google error:', err);
      if (err.code === 'auth/credential-already-in-use') {
        setErrorMessage('This Google account is already linked to another user account.');
      } else if (err.code === 'auth/provider-already-linked') {
        setErrorMessage('Your account is already linked with Google.');
      } else {
        setErrorMessage(`Linking Google account failed: ${err.message || 'Error occurred.'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Email Sign-In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setSuccessMessage('Successfully signed in!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Sign-in error:', err);
      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password sign-in is disabled in your Firebase Console. Please use "Sign in with Google" above, or enable Email/Password under Firebase Console -> Authentication -> Sign-in method.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Incorrect email address or password.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email address. Switch to the Email Register tab to create one.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Access temporarily disabled due to too many failed attempts. Try resetting password.';
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Email Password Reset
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address in the field above to receive a reset link.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMessage(`Password reset link sent to ${email.trim()}. Please check your inbox.`);
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setErrorMessage('Unable to send password reset email. Please verify email format.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Email Account Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please complete all required registration fields.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const newUser = userCredential.user;

      // Send real verification email
      await sendEmailVerification(newUser);
      setSuccessMessage(`Account created! Verification email sent to ${newUser.email}. Please check your inbox.`);
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Registration error:', err);
      let msg = 'Registration failed. Please try again.';
      if (err.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password registration is disabled in your Firebase Console. Please use "Sign in with Google" above, or enable Email/Password under Firebase Console -> Authentication -> Sign-in method.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = `An account with ${email.trim()} already exists. Please switch to Sign In to enter your password.`;
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Include numbers, uppercase letters and symbols.';
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Verification Email
  const handleResendEmailVerification = async () => {
    if (!auth.currentUser || resendCooldown > 0) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await sendEmailVerification(auth.currentUser);
      setSuccessMessage(`Verification email re-sent to ${auth.currentUser.email}.`);
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Resend verification error:', err);
      setErrorMessage('Unable to re-send verification email. Please wait before trying again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check / Refresh Email Verification Status
  const handleRefreshVerificationStatus = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await refreshUser();
      if (auth.currentUser?.emailVerified) {
        setSuccessMessage('Email verified successfully! Your account is now fully verified.');
      } else {
        setErrorMessage('Email is not verified yet. Please check your inbox and click the verification link.');
      }
    } catch (err) {
      setErrorMessage('Error checking verification status.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Send Phone SMS OTP
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    setupRecaptcha();

    const formattedPhone = `${countryCode}${phoneNumber.trim().replace(/^0+/, '')}`;

    try {
      const verifier = recaptchaVerifierRef.current;
      if (!verifier) {
        throw new Error('reCAPTCHA verifier could not be initialized.');
      }

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      setSuccessMessage(`SMS OTP verification code sent to ${formattedPhone}.`);
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Phone SMS send error:', err);
      let msg = 'Failed to send SMS OTP code.';
      if (err.code === 'auth/invalid-phone-number') {
        msg = 'Invalid phone number format for selected country code.';
      } else if (err.code === 'auth/quota-exceeded') {
        msg = 'SMS quota exceeded for this Firebase project. Try email registration or check Firebase billing.';
      } else if (err.code === 'auth/captcha-check-failed') {
        msg = 'reCAPTCHA verification failed. Please reload and try again.';
      }
      setErrorMessage(msg);
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Verify Phone SMS OTP
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6 || !confirmationResult) {
      setErrorMessage('Please enter the complete 6-digit SMS verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await confirmationResult.confirm(otpCode.trim());
      setSuccessMessage('Phone number verified successfully! You are now signed in.');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setErrorMessage('Invalid or expired SMS OTP code. Please check the code or request a new one.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="RODEX Account Portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-fade-in"
    >
      {/* Container for invisible reCAPTCHA */}
      <div id="recaptcha-container" ref={recaptchaContainerRef}></div>

      <div className="relative w-full max-w-lg bg-[#0a1426]/95 border border-sky-400/25 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden backdrop-blur-2xl text-white flex flex-col max-h-[90dvh]">
        
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg text-white font-bold shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
                RODEX <span className="text-sky-300 font-light">Account Portal</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-sky-200/70 font-medium">
                Phase One — Secure Auth & Verification
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

        {/* Tab Selection */}
        <div className="grid grid-cols-4 p-1.5 sm:p-2 gap-1 bg-white/5 border-b border-white/10 text-[11px] sm:text-xs font-semibold text-center shrink-0">
          <button
            onClick={() => { setActiveTab('signin'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`py-2 px-1 rounded-xl transition ${activeTab === 'signin' ? 'bg-sky-500 text-white font-bold shadow' : 'text-white/60 hover:text-white'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setActiveTab('register_email'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`py-2 px-1 rounded-xl transition ${activeTab === 'register_email' ? 'bg-sky-500 text-white font-bold shadow' : 'text-white/60 hover:text-white'}`}
          >
            Email
          </button>
          <button
            onClick={() => { setActiveTab('register_phone'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`py-2 px-1 rounded-xl transition ${activeTab === 'register_phone' ? 'bg-sky-500 text-white font-bold shadow' : 'text-white/60 hover:text-white'}`}
          >
            Phone SMS
          </button>
          <button
            onClick={() => { setActiveTab('guest'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`py-2 px-1 rounded-xl transition ${activeTab === 'guest' ? 'bg-sky-500 text-white font-bold shadow' : 'text-white/60 hover:text-white'}`}
          >
            Guest
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">

          {/* Feedback Banners */}
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

          {/* User Account Details if signed in */}
          {user && (
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-400/20 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-sky-200">Current Session</span>
                <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${isVerified ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'}`}>
                  {isVerified ? 'Verified Account' : 'Pending Verification'}
                </span>
              </div>
              <div className="text-sm font-bold text-white break-all">
                {user.email || user.phoneNumber || 'Authenticated User'}
              </div>

              {/* Verification Status Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-black/20 border border-white/10 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  <span>Email: <strong>{isEmailVerified ? 'Verified' : 'Unverified'}</strong></span>
                </div>
                <div className="p-2 rounded-xl bg-black/20 border border-white/10 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Phone: <strong>{isPhoneVerified ? 'Verified' : 'Unverified'}</strong></span>
                </div>
              </div>

              {!isEmailVerified && user.email && (
                <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <button
                    onClick={handleResendEmailVerification}
                    disabled={isLoading || resendCooldown > 0}
                    className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-semibold transition disabled:opacity-50"
                  >
                    {resendCooldown > 0 ? `Resend Email (${resendCooldown}s)` : 'Resend Verification Email'}
                  </button>
                  <button
                    onClick={handleRefreshVerificationStatus}
                    disabled={isLoading}
                    className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-xs font-semibold transition flex items-center justify-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>I've Verified</span>
                  </button>
                </div>
              )}

              {/* Link Google Account Option */}
              {user && !user.providerData?.some((p) => p.providerId === 'google.com') && (
                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleLinkGoogleAccount}
                    disabled={isLoading}
                    className="w-full py-2 px-3 rounded-xl bg-white text-slate-900 font-bold text-xs shadow hover:bg-slate-100 transition flex items-center justify-center gap-2 border border-slate-200 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.3 7.31 24 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.0 10.04.0 12s.46 3.8 1.27 5.42l4.01-3.15z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                    </svg>
                    <span>Link Google Account</span>
                  </button>
                </div>
              )}

              {/* Privacy & Security Portal Access */}
              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenPrivacyPortal) onOpenPrivacyPortal();
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-400/40 text-sky-200 hover:text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <ShieldCheck className="w-4 h-4 text-sky-300" />
                  <span>Privacy & Security Portal</span>
                </button>
              </div>

              <button
                onClick={logout}
                className="w-full py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-xs transition"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          {activeTab === 'signin' && !user && (
            <div className="space-y-4 animate-fade-in">
              {/* Primary Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-bold text-sm shadow-md hover:bg-slate-100 active:scale-[0.98] transition flex items-center justify-center gap-3 border border-slate-200 disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.0 10.04.0 12s.46 3.8 1.27 5.42l4.01-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Sign in with Google (Instant & Ready)</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-white/10 w-full"></div>
                <span className="bg-slate-900 px-3 text-[11px] font-semibold text-white/50 uppercase tracking-wider absolute">or email</span>
              </div>

              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Password
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                      className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-white/50 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Sign In with Email</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: REGISTER EMAIL */}
          {activeTab === 'register_email' && !user && (
            <div className="space-y-4 animate-fade-in">
              {/* Primary Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-2xl bg-white text-slate-900 font-bold text-sm shadow-md hover:bg-slate-100 active:scale-[0.98] transition flex items-center justify-center gap-3 border border-slate-200 disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.0 10.04.0 12s.46 3.8 1.27 5.42l4.01-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Sign up / Register with Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-white/10 w-full"></div>
                <span className="bg-slate-900 px-3 text-[11px] font-semibold text-white/50 uppercase tracking-wider absolute">or register email</span>
              </div>

              <form onSubmit={handleEmailRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Create Password (min 8 chars)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create strong password"
                      required
                      className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-white/50 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    required
                    className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                  />
                </div>

                <div className="text-[11px] text-white/60 bg-black/20 p-2.5 rounded-xl border border-white/10 space-y-1">
                  <div className="font-semibold text-sky-300">Verification Policy:</div>
                  <div>A verification link will be sent to your email. Verifying either email or phone completes account verification.</div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Create Account & Send Verification</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: REGISTER PHONE SMS OTP */}
          {activeTab === 'register_phone' && !user && (
            <div className="space-y-4 animate-fade-in">
              {!isOtpSent ? (
                <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Select Country & Dial Code
                    </label>
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-full bg-slate-900 border border-white/20 focus:border-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                    >
                      {COUNTRY_DIAL_CODES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                          {c.flag} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5" /> Phone Number
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-2.5 rounded-xl bg-white/10 text-xs font-mono text-sky-300 border border-white/20">
                        {countryCode}
                      </span>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="700 000 000"
                        required
                        className="w-full bg-white/5 border border-white/20 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/40 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Send SMS Verification OTP</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                  <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-400/20 text-xs text-sky-200">
                    Enter the 6-digit SMS verification code sent to <strong>{countryCode}{phoneNumber}</strong>:
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5" /> 6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      required
                      className="w-full bg-white/10 border border-sky-400 focus:ring-2 focus:ring-sky-400 rounded-xl px-3.5 py-3 text-center tracking-[0.5em] font-mono text-lg text-white outline-none transition"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsOtpSent(false)}
                      className="text-xs text-sky-300 hover:underline"
                    >
                      Change Phone Number
                    </button>
                    <button
                      type="button"
                      onClick={handleSendPhoneOtp}
                      disabled={resendCooldown > 0 || isLoading}
                      className="text-xs text-sky-300 hover:underline disabled:opacity-50"
                    >
                      {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Verify OTP & Complete Sign In</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: GUEST ACCESS */}
          {activeTab === 'guest' && (
            <div className="space-y-4 text-xs animate-fade-in">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="font-bold text-sky-300 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Guest Mode Active
                </div>
                <p className="text-white/80 leading-relaxed">
                  You are currently using RODEX Atmos as a Guest. You have full access to live weather forecasts, automatic device-location detection, multi-day predictions, and the Hey Atmos voice assistant.
                </p>
                <div className="pt-2 border-t border-white/10 text-white/60">
                  Creating an account enables syncing your saved weather preferences across devices.
                </div>
              </div>

              <button
                onClick={() => {
                  continueAsGuest();
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition flex items-center justify-center gap-2"
              >
                <span>Continue Using RODEX Atmos as Guest</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Privacy Notice Notice */}
          <div className="pt-4 border-t border-white/10 text-[11px] text-white/50 text-center leading-relaxed">
            RODEX Atmos respects your privacy. Account registration is optional. Email or phone verification is used strictly to establish ownership of your contact method.
          </div>

        </div>
      </div>
    </div>
  );
};
