import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  deleteUser,
  updateProfile,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, testFirestoreConnection } from '../lib/firebase';

export interface UserPrivacyPreferences {
  autoLocationEnabled: boolean;
  rememberLocationAcrossSessions: boolean;
  saveFavoriteCities: boolean;
  allowVoiceAnalytics: boolean;
  temperatureUnit: 'C' | 'F';
}

export const DEFAULT_PREFERENCES: UserPrivacyPreferences = {
  autoLocationEnabled: true,
  rememberLocationAcrossSessions: true,
  saveFavoriteCities: true,
  allowVoiceAnalytics: false,
  temperatureUnit: 'C'
};

export interface UserProfileData {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  createdAt: string;
  updatedAt?: string;
  preferences?: UserPrivacyPreferences;
  savedCities?: string[];
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfileData | null;
  userPreferences: UserPrivacyPreferences;
  loading: boolean;
  isGuest: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isVerified: boolean;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  syncUserProfile: (additionalData?: Partial<UserProfileData>) => Promise<void>;
  updateUserPreferences: (newPrefs: Partial<UserPrivacyPreferences>) => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  exportUserData: () => Promise<Record<string, any>>;
  deleteAccountPermanently: (passwordForReauth?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to remove any 'undefined' property values before writing to Firestore
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rodex_atmos_guest_session') === 'true';
    }
    return true;
  });

  // Test connection on boot
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Fetch or create profile document in /users/{uid}
  const fetchOrCreateProfile = useCallback(async (firebaseUser: User) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const profile = snap.data() as UserProfileData;
        setUserProfile(profile);
      } else {
        const newProfileRaw: Record<string, any> = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || '',
          emailVerified: firebaseUser.emailVerified,
          phoneVerified: !!firebaseUser.phoneNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          preferences: DEFAULT_PREFERENCES,
          savedCities: []
        };
        if (firebaseUser.email) {
          newProfileRaw.email = firebaseUser.email;
        }
        if (firebaseUser.phoneNumber) {
          newProfileRaw.phoneNumber = firebaseUser.phoneNumber;
        }

        const cleanData = sanitizeForFirestore(newProfileRaw);
        await setDoc(userDocRef, cleanData);
        setUserProfile(cleanData as UserProfileData);
      }
    } catch (err) {
      console.warn('[RODEX Auth Profile Warning]', err);
      setUserProfile({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || '',
        email: firebaseUser.email || undefined,
        phoneNumber: firebaseUser.phoneNumber || undefined,
        emailVerified: firebaseUser.emailVerified,
        phoneVerified: !!firebaseUser.phoneNumber,
        createdAt: new Date().toISOString(),
        preferences: DEFAULT_PREFERENCES,
        savedCities: []
      });
    }
  }, []);

  // Sync / update user profile in Firestore
  const syncUserProfile = async (additionalData?: Partial<UserProfileData>) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatedProfileRaw: Record<string, any> = {
        uid,
        emailVerified: auth.currentUser.emailVerified,
        phoneVerified: !!auth.currentUser.phoneNumber,
        updatedAt: new Date().toISOString(),
        ...additionalData
      };
      if (auth.currentUser.email) {
        updatedProfileRaw.email = auth.currentUser.email;
      }
      if (auth.currentUser.phoneNumber) {
        updatedProfileRaw.phoneNumber = auth.currentUser.phoneNumber;
      }

      const cleanData = sanitizeForFirestore(updatedProfileRaw);
      await setDoc(userDocRef, cleanData, { merge: true });
      setUserProfile((prev) => (prev ? { ...prev, ...cleanData } : (cleanData as UserProfileData)));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  };

  // Update privacy preferences
  const updateUserPreferences = async (newPrefs: Partial<UserPrivacyPreferences>) => {
    const currentPrefs = userProfile?.preferences || DEFAULT_PREFERENCES;
    const mergedPrefs: UserPrivacyPreferences = { ...currentPrefs, ...newPrefs };
    await syncUserProfile({ preferences: mergedPrefs });
  };

  // Update display name
  const updateDisplayName = async (newName: string) => {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, { displayName: newName });
    await syncUserProfile({ displayName: newName });
  };

  // Export User Data as clean JSON object
  const exportUserData = async (): Promise<Record<string, any>> => {
    if (!auth.currentUser) {
      throw new Error('Must be authenticated to export user data.');
    }

    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    let profileData: Partial<UserProfileData> = userProfile || {};

    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        profileData = snap.data() as UserProfileData;
      }
    } catch (err) {
      console.warn('Export fetch warning:', err);
    }

    return {
      exportMetadata: {
        application: 'RODEX Atmos Weather & Voice Assistant',
        version: '1.2.0 Phase Two',
        exportedAt: new Date().toISOString(),
        authenticatedUID: uid
      },
      accountOverview: {
        uid,
        displayName: auth.currentUser.displayName || profileData.displayName || null,
        email: auth.currentUser.email || profileData.email || null,
        emailVerified: auth.currentUser.emailVerified ?? false,
        phoneNumber: auth.currentUser.phoneNumber || profileData.phoneNumber || null,
        phoneVerified: !!auth.currentUser.phoneNumber,
        providerData: auth.currentUser.providerData.map((p) => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email || null,
          displayName: p.displayName || null
        })),
        createdAt: profileData.createdAt || null,
        lastSignInTime: auth.currentUser.metadata.lastSignInTime || null
      },
      privacyPreferences: profileData.preferences || DEFAULT_PREFERENCES,
      savedCities: profileData.savedCities || [],
      privacyNotice: 'RODEX Atmos does not retain precise device location history or voice conversation audio recordings.'
    };
  };

  // Recoverable & Idempotent Account Deletion Workflow with Interactive Re-authentication
  const deleteAccountPermanently = async (passwordForReauth?: string) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user session found to delete.');
    }

    const currentUser = auth.currentUser;
    const uid = currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    const profileBackup = userProfile ? { ...userProfile } : null;

    // Helper to perform deleteUser with automatic re-authentication handling
    const executeAuthDeletion = async () => {
      try {
        await deleteUser(currentUser);
      } catch (err: any) {
        console.warn('[RODEX Auth Notice] Initial deleteUser failed, attempting re-authentication:', err?.code);

        if (err.code === 'auth/requires-recent-login') {
          const providerId = currentUser.providerData[0]?.providerId || 'google.com';

          if (providerId === 'google.com') {
            // Interactive Popup Re-authentication for Google
            const googleProvider = new GoogleAuthProvider();
            googleProvider.setCustomParameters({ prompt: 'select_account' });
            await reauthenticateWithPopup(currentUser, googleProvider);
            // Retry deletion after Google re-auth
            await deleteUser(currentUser);
          } else if (providerId === 'password' && currentUser.email) {
            if (!passwordForReauth) {
              throw new Error('REAUTH_PASSWORD_REQUIRED');
            }
            const cred = EmailAuthProvider.credential(currentUser.email, passwordForReauth);
            await reauthenticateWithCredential(currentUser, cred);
            // Retry deletion after email re-auth
            await deleteUser(currentUser);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    };

    // 1. Delete Firestore user document
    try {
      await deleteDoc(userDocRef);
    } catch (err) {
      console.warn('Firestore doc deletion notice:', err);
    }

    // 2. Delete Firebase Auth User with re-authentication
    try {
      await executeAuthDeletion();
    } catch (err: any) {
      console.error('Firebase deleteUser error after re-auth attempt:', err);

      // ROLLBACK: Restore Firestore user doc if deleteUser fails or is cancelled!
      if (profileBackup) {
        try {
          const cleanData = sanitizeForFirestore(profileBackup);
          await setDoc(userDocRef, cleanData, { merge: true });
          setUserProfile(profileBackup);
        } catch (rollbackErr) {
          console.error('Rollback restoration failed:', rollbackErr);
        }
      }

      if (err.message === 'REAUTH_PASSWORD_REQUIRED') {
        throw new Error('For security, please enter your account password below to confirm deletion.');
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        throw new Error('Google re-authentication popup was closed before completion. Account was NOT deleted.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error('Incorrect account password. Please check your password and try again.');
      } else if (err.code === 'auth/requires-recent-login') {
        throw new Error('Re-authentication required. Please sign out and sign back in, then retry deleting your account.');
      }

      throw new Error(`Account deletion aborted: ${err.message || 'Authentication error.'}`);
    }

    // 3. Clear Local Storage App Keys
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rodex_atmos_saved_cities');
      localStorage.removeItem('rodex_atmos_preferences');
      localStorage.removeItem('rodex_atmos_last_location');
    }

    // 4. Reset Local Context State & Return to Guest Mode
    setUser(null);
    setUserProfile(null);
    continueAsGuest();
  };

  // Reload authoritative Firebase Auth state
  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      setUser(updatedUser);
      if (updatedUser) {
        await fetchOrCreateProfile(updatedUser);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsGuest(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('rodex_atmos_guest_session');
        }
        await fetchOrCreateProfile(currentUser);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchOrCreateProfile]);

  const continueAsGuest = () => {
    setIsGuest(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rodex_atmos_guest_session', 'true');
    }
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rodex_atmos_saved_cities');
      localStorage.removeItem('rodex_atmos_preferences');
      localStorage.removeItem('rodex_atmos_last_location');
    }
    setUser(null);
    setUserProfile(null);
    continueAsGuest();
  };

  const isEmailVerified = user?.emailVerified ?? false;
  const isPhoneVerified = !!user?.phoneNumber || (userProfile?.phoneVerified ?? false);
  const isVerified = isEmailVerified || isPhoneVerified;
  const userPreferences = userProfile?.preferences || DEFAULT_PREFERENCES;

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        userPreferences,
        loading,
        isGuest: isGuest && !user,
        isEmailVerified,
        isPhoneVerified,
        isVerified,
        continueAsGuest,
        logout,
        refreshUser,
        syncUserProfile,
        updateUserPreferences,
        updateDisplayName,
        exportUserData,
        deleteAccountPermanently
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
