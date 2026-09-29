import { useEffect } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { AuthNavigationProvider, useAuthNavigation } from '../src/features/auth/auth-navigation';

void SplashScreen.preventAutoHideAsync();

function AuthenticatedRoutes() {
  const { status } = useAuthNavigation();

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'restoring') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthNavigationProvider>
      <AuthenticatedRoutes />
    </AuthNavigationProvider>
  );
}
