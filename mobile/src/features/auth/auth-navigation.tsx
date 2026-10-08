import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession, restoreSession, subscribeToSessionInvalidation } from './auth.session';
import { getOnboardingHidden } from './onboarding-preference.storage';
import { getProfile } from '../profile/profile.service';
import type { ProfileResponse } from '../profile/profile.types';

type AuthRouteStatus = 'restoring' | 'authenticated' | 'unauthenticated' | 'profile-error';

type AuthNavigationValue = {
  status: AuthRouteStatus;
  publicEntry: 'onboarding' | 'login';
  privateEntry: 'initial-setup' | 'app';
  profile: ProfileResponse | null;
  loginNotice: string;
  completeLogin: () => Promise<void>;
  completeInitialSetup: (profile: ProfileResponse) => void;
  retryProfileLoad: () => void;
};

const AuthNavigationContext = createContext<AuthNavigationValue | null>(null);

export function AuthNavigationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthRouteStatus>('restoring');
  const [publicEntry, setPublicEntry] = useState<'onboarding' | 'login'>('onboarding');
  const [privateEntry, setPrivateEntry] = useState<'initial-setup' | 'app'>('initial-setup');
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loginNotice, setLoginNotice] = useState('');

  useEffect(() => {
    let active = true;
    let restorationComplete = false;
    let invalidatedDuringRestoration = false;
    const unsubscribe = subscribeToSessionInvalidation(() => {
      if (!active) return;
      if (!restorationComplete) {
        invalidatedDuringRestoration = true;
        return;
      }
      setLoginNotice('Sua sessão não está disponível. Entre novamente.');
      setPublicEntry('login');
      setStatus('unauthenticated');
    });

    Promise.allSettled([restoreSession(), getOnboardingHidden()])
      .then(async ([sessionResult, preferenceResult]) => {
        if (!active) return;
        restorationComplete = true;
        if (invalidatedDuringRestoration) {
          setLoginNotice('Sua sessão não está disponível. Entre novamente.');
          setPublicEntry('login');
          setStatus('unauthenticated');
          return;
        }
        const result = sessionResult.status === 'fulfilled' ? sessionResult.value : null;
        if (result?.status === 'authenticated' && getSession()) {
          try {
            const currentProfile = await getProfile();
            if (!active || !getSession()) return;
            setProfile(currentProfile);
            setPrivateEntry(currentProfile.initialSetupCompleted ? 'app' : 'initial-setup');
            setStatus('authenticated');
          } catch {
            if (active) setStatus(getSession() ? 'profile-error' : 'unauthenticated');
          }
          return;
        }
        if (!result || result.status === 'unavailable') {
          setLoginNotice('Não foi possível restaurar sua sessão agora. Você pode entrar novamente.');
        }
        // Falha de leitura local: mostrar a introdução, sem bloquear a entrada.
        setPublicEntry(preferenceResult.status === 'fulfilled' && preferenceResult.value ? 'login' : 'onboarding');
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function completeLogin() {
    if (!getSession()) return;
    setLoginNotice('');
    setStatus('restoring');
    try {
      const currentProfile = await getProfile();
      if (!getSession()) { setStatus('unauthenticated'); return; }
      setProfile(currentProfile);
      setPrivateEntry(currentProfile.initialSetupCompleted ? 'app' : 'initial-setup');
      setStatus('authenticated');
    } catch {
      setStatus(getSession() ? 'profile-error' : 'unauthenticated');
    }
  }

  function completeInitialSetup(currentProfile: ProfileResponse) {
    if (!currentProfile.initialSetupCompleted) return;
    setProfile(currentProfile);
    setPrivateEntry('app');
    setStatus('authenticated');
  }

  function retryProfileLoad() { void completeLogin(); }

  return (
    <AuthNavigationContext.Provider value={{ status, publicEntry, privateEntry, profile, loginNotice, completeLogin, completeInitialSetup, retryProfileLoad }}>
      {children}
    </AuthNavigationContext.Provider>
  );
}

export function useAuthNavigation(): AuthNavigationValue {
  const value = useContext(AuthNavigationContext);
  if (!value) throw new Error('AuthNavigationProvider is required');
  return value;
}
