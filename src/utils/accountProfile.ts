export interface AuthProfileProvider {
  providerId: string;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
}

export interface AuthProfileIdentitySource {
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  providerData?: readonly AuthProfileProvider[];
}

/**
 * Resolve the name, avatar, and email Firebase exposes for the authenticated identity.
 * A linked Google provider is authoritative for all Google profile fields.
 * Never guess a photo from an email address: Gmail/password sign-in alone does
 * not grant access to that Google account's profile image.
 */
export function resolveAuthProfileIdentity(user: AuthProfileIdentitySource): {
  displayName: string;
  photoURL?: string;
  email?: string;
} {
  const googleProfile = user.providerData?.find((provider) => provider.providerId === 'google.com');
  return {
    displayName: googleProfile?.displayName || user.displayName || '',
    photoURL: googleProfile?.photoURL || user.photoURL || undefined,
    email: googleProfile?.email || user.email || undefined
  };
}
