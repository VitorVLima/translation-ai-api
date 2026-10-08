import { useEffect } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthNavigationProvider, useAuthNavigation } from '../src/features/auth/auth-navigation';
import { ProfileBootstrapErrorScreen } from '../src/features/auth/screens/ProfileBootstrapErrorScreen';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

function AuthenticatedRoutes() {
  const { status, publicEntry, privateEntry, retryProfileLoad } = useAuthNavigation();
  const { colors, resolved } = useTheme();

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'restoring') return null;
  if (status === 'profile-error') return <ProfileBootstrapErrorScreen onRetry={retryProfileLoad} />;

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={status === 'unauthenticated' && publicEntry === 'onboarding'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'unauthenticated'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'authenticated' && privateEntry === 'initial-setup'}>
          <Stack.Screen name="initial-setup" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'authenticated' && privateEntry === 'app'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthNavigationProvider>
        <AuthenticatedRoutes />
      </AuthNavigationProvider>
    </ThemeProvider>
  );
}
