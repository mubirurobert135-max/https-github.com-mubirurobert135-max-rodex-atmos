import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, testFirestoreConnection } from '../lib/firebase';

export interface UserProfileData {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfileData | null;
  loading: boolean;
  isGuest: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isVerified: boolean;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  syncUserProfile: (additionalData?: Partial<UserProfileData>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        const newProfile: UserProfileData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || '',
          email: firebaseUser.email || undefined,
          phoneNumber: firebaseUser.phoneNumber || undefined,
          emailVerified: firebaseUser.emailVerified,
          phoneVerified: !!firebaseUser.phoneNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newProfile);
        setUserProfile(newProfile);
      }
    } catch (err) {
      console.warn('[RODEX Auth Profile Warning]', err);
      // Fallback profile object if Firestore rules/permission restricts
      setUserProfile({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || '',
        email: firebaseUser.email || undefined,
        phoneNumber: firebaseUser.phoneNumber || undefined,
        emailVerified: firebaseUser.emailVerified,
        phoneVerified: !!firebaseUser.phoneNumber,
        createdAt: new Date().toISOString()
      });
    }
  }, []);

  // Sync / update user profile in Firestore
  const syncUserProfile = async (additionalData?: Partial<UserProfileData>) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    try {
      const updatedProfile: Partial<UserProfileData> = {
        uid,
        email: auth.currentUser.email || undefined,
        phoneNumber: auth.currentUser.phoneNumber || undefined,
        emailVerified: auth.currentUser.emailVerified,
        phoneVerified: !!auth.currentUser.phoneNumber,
        updatedAt: new Date().toISOString(),
        ...additionalData
      };
      await setDoc(userDocRef, updatedProfile, { merge: true });
      setUserProfile((prev) => (prev ? { ...prev, ...updatedProfile } : (updatedProfile as UserProfileData)));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
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
    setUser(null);
    setUserProfile(null);
    continueAsGuest();
  };

  const isEmailVerified = user?.emailVerified ?? false;
  const isPhoneVerified = !!user?.phoneNumber || (userProfile?.phoneVerified ?? false);
  const isVerified = isEmailVerified || isPhoneVerified;

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        isGuest: isGuest && !user,
        isEmailVerified,
        isPhoneVerified,
        isVerified,
        continueAsGuest,
        logout,
        refreshUser,
        syncUserProfile
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
