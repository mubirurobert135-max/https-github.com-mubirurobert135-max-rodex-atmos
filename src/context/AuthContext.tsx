import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  deleteUser,
  updateProfile
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
  deleteAccountPermanently: () => Promise<void>;
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

  // Recoverable & Idempotent Account Deletion Workflow
  const deleteAccountPermanently = async () => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user session found to delete.');
    }

    const currentUser = auth.currentUser;
    const uid = currentUser.uid;
    const userDocRef = doc(db, 'users', uid);

    // Save profile snapshot in memory for rollback if Auth deletion fails
    const profileBackup = userProfile ? { ...userProfile } : null;

    // 1. Delete Firestore user document
    try {
      await deleteDoc(userDocRef);
    } catch (err) {
      console.warn('Firestore doc deletion warning:', err);
    }

    // 2. Delete Firebase Auth User
    try {
      await deleteUser(currentUser);
    } catch (err: any) {
      console.error('Firebase deleteUser error:', err);

      // ROLLBACK: Restore Firestore user doc if deleteUser fails!
      if (profileBackup) {
        try {
          await setDoc(userDocRef, profileBackup, { merge: true });
          setUserProfile(profileBackup);
        } catch (rollbackErr) {
          console.error('Rollback failed:', rollbackErr);
        }
      }

      if (err.code === 'auth/requires-recent-login') {
        throw new Error(
          'For your security, account deletion requires a recent sign-in. Your account data has been safely preserved. Please sign out, sign back in, and try deleting again.'
        );
      }
      throw new Error(`Account deletion aborted: ${err.message || 'Authentication error.'}`);
    }

    // 3. Clear Local Storage App Keys
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rodex_atmos_saved_cities');
      localStorage.removeItem('rodex_atmos_preferences');
      localStorage.removeItem('rodex_atmos_last_location');
    }

    // 4. Reset Local Context State
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
