import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession, restoreSession, subscribeToSessionInvalidation } from './auth.session';

type AuthRouteStatus = 'restoring' | 'authenticated' | 'unauthenticated';

type AuthNavigationValue = {
  status: AuthRouteStatus;
  loginNotice: string;
  completeLogin: () => void;
};

const AuthNavigationContext = createContext<AuthNavigationValue | null>(null);

export function AuthNavigationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthRouteStatus>('restoring');
  const [loginNotice, setLoginNotice] = useState('');

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToSessionInvalidation(() => {
      if (!active) return;
      setLoginNotice('Sua sessão não está disponível. Entre novamente.');
      setStatus('unauthenticated');
    });

    restoreSession()
      .then((result) => {
        if (!active) return;
        if (result.status === 'authenticated' && getSession()) {
          setStatus('authenticated');
          return;
        }
        if (result.status === 'unavailable') {
          setLoginNotice('Não foi possível restaurar sua sessão agora. Você pode entrar novamente.');
        }
        setStatus('unauthenticated');
      })
      .catch(() => {
        if (!active) return;
        setLoginNotice('Não foi possível restaurar sua sessão agora. Você pode entrar novamente.');
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function completeLogin() {
    if (!getSession()) return;
    setLoginNotice('');
    setStatus('authenticated');
  }

  return (
    <AuthNavigationContext.Provider value={{ status, loginNotice, completeLogin }}>
      {children}
    </AuthNavigationContext.Provider>
  );
}

export function useAuthNavigation(): AuthNavigationValue {
  const value = useContext(AuthNavigationContext);
  if (!value) throw new Error('AuthNavigationProvider is required');
  return value;
}
