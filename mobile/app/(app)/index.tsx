import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { authenticatedFetch } from '../../src/api/authenticated-fetch';
import { getSession, SessionError } from '../../src/features/auth/auth.session';

export default function AuthenticatedScreen() {
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [sessionCheckMessage, setSessionCheckMessage] = useState('');
  const checkingSessionRef = useRef(false);

  async function handleCheckSession() {
    if (checkingSessionRef.current) return;
    const checkedSession = getSession();
    checkingSessionRef.current = true;
    setIsCheckingSession(true);
    setSessionCheckMessage('');
    try {
      // Duas chamadas protegidas permitem verificar single-flight em desenvolvimento.
      const results = await Promise.allSettled([
        authenticatedFetch('/api/v1/users/me'),
        authenticatedFetch('/api/v1/users/me'),
      ]);
      if (getSession() !== checkedSession) return;
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        const error: unknown = failure.reason;
        if (error instanceof SessionError && error.kind === 'network') {
          setSessionCheckMessage('Não foi possível conectar. Verifique sua conexão e reabra o app para tentar novamente.');
        } else if (error instanceof SessionError && error.kind === 'rateLimit') {
          setSessionCheckMessage('Muitas tentativas. Aguarde antes de reabrir o app.');
        } else {
          setSessionCheckMessage('Não foi possível verificar a sessão agora. Reabra o app para tentar novamente.');
        }
      } else if (results.every((result) => result.status === 'fulfilled' && result.value.status === 200)) {
        setSessionCheckMessage('Sessão verificada.');
      } else {
        setSessionCheckMessage('Não foi possível concluir a verificação agora.');
      }
    } finally {
      checkingSessionRef.current = false;
      setIsCheckingSession(false);
    }
  }

  return (
    <View style={styles.sessionScreen}>
      <Text accessibilityRole="header" style={styles.sessionTitle}>English<Text style={styles.brandAccent}>AI</Text></Text>
      <Text style={styles.sessionText}>Sessão autenticada.</Text>
      {__DEV__ && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isCheckingSession, busy: isCheckingSession }}
            disabled={isCheckingSession}
            onPress={handleCheckSession}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>{isCheckingSession ? 'Verificando...' : 'Verificar sessão'}</Text>
          </Pressable>
          {sessionCheckMessage ? <Text accessibilityLiveRegion="polite" style={styles.sessionText}>{sessionCheckMessage}</Text> : null}
        </>
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  sessionScreen: {
    alignItems: 'center',
    backgroundColor: '#f8f9ff',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  sessionTitle: {
    color: '#141326',
    fontSize: 28,
    fontWeight: '700',
  },
  sessionText: {
    color: '#4e5871',
    fontSize: 15,
    textAlign: 'center',
  },
  brandAccent: {
    color: '#a528eb',
  },
  button: {
    backgroundColor: '#5b50f5',
    borderRadius: 10,
    marginTop: 6,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '600',
  },
});
