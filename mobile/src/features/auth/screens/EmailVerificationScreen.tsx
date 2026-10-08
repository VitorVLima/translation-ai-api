import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  resendEmailVerification,
  ResendEmailVerificationError,
  verifyEmail,
  VerifyEmailError,
} from '../auth.service';
import { PublicAuthScreen } from '../components/PublicAuthScreen';
import { VerificationCodeInput } from '../components/VerificationCodeInput';

const DEV_AUTH_UI_RESEND_COOLDOWN_SECONDS = 60;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function EmailVerificationScreen() {
  const styles = useThemedStyles(baseStyles);
  const { email: emailParam, sent } = useLocalSearchParams<{ email?: string; sent?: string }>();
  const email = typeof emailParam === 'string' ? emailParam.trim() : '';
  const hasEmail = isEmail(email);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(sent === '1' ? 'Enviamos um código de 6 dígitos para o seu e-mail.' : 'Informe o código enviado para o seu e-mail.');
  const [error, setError] = useState(hasEmail ? '' : 'Não foi possível identificar o e-mail da conta. Volte ao login e tente novamente.');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendUntil, setResendUntil] = useState(() => sent === '1' ? Date.now() + DEV_AUTH_UI_RESEND_COOLDOWN_SECONDS * 1000 : 0);
  const [resendSeconds, setResendSeconds] = useState(() => sent === '1' ? DEV_AUTH_UI_RESEND_COOLDOWN_SECONDS : 0);
  const verifyingRef = useRef(false);
  const resendingRef = useRef(false);

  useEffect(() => {
    if (!resendUntil) return;

    const updateRemainingSeconds = () => {
      const remaining = Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (!remaining) setResendUntil(0);
    };

    const timer = setInterval(updateRemainingSeconds, 1000);
    return () => clearInterval(timer);
  }, [resendUntil]);

  function startResendCooldown(seconds = DEV_AUTH_UI_RESEND_COOLDOWN_SECONDS) {
    const duration = Math.max(1, seconds);
    setResendSeconds(duration);
    setResendUntil(Date.now() + duration * 1000);
  }

  async function handleVerify() {
    if (verifyingRef.current || !hasEmail) return;
    if (!/^\d{6}$/.test(code)) {
      setMessage('');
      setError('Informe um código de 6 dígitos.');
      return;
    }

    verifyingRef.current = true;
    setIsVerifying(true);
    setError('');
    setMessage('');
    try {
      await verifyEmail({ email, code });
      router.replace({ pathname: '/login', params: { email, verified: '1' } });
    } catch (requestError) {
      if (requestError instanceof VerifyEmailError) {
        switch (requestError.kind) {
          case 'network': setError('Não foi possível conectar ao servidor. Verifique sua conexão.'); break;
          case 'invalidCode': setError('Código incorreto ou expirado.'); break;
          case 'rateLimit': setError('Muitas tentativas. Aguarde antes de tentar novamente.'); break;
          default: setError('Não foi possível confirmar o e-mail agora. Tente novamente.');
        }
      } else {
        setError('Não foi possível confirmar o e-mail agora. Tente novamente.');
      }
    } finally {
      verifyingRef.current = false;
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (resendingRef.current || !hasEmail || resendSeconds > 0) return;

    resendingRef.current = true;
    setIsResending(true);
    setError('');
    setMessage('');
    try {
      await resendEmailVerification({ email });
      startResendCooldown();
      setMessage('Um novo código foi enviado para o seu e-mail.');
    } catch (requestError) {
      if (requestError instanceof ResendEmailVerificationError) {
        switch (requestError.kind) {
          case 'network': setError('Não foi possível conectar ao servidor. Verifique sua conexão.'); break;
          case 'validation': setError('Não foi possível reenviar para este e-mail.'); break;
          case 'rateLimit':
            if (requestError.retryAfterSeconds) startResendCooldown(requestError.retryAfterSeconds);
            setError('Muitas tentativas. Aguarde antes de reenviar o código.');
            break;
          default: setError('Não foi possível reenviar o código agora. Tente novamente.');
        }
      } else {
        setError('Não foi possível reenviar o código agora. Tente novamente.');
      }
    } finally {
      resendingRef.current = false;
      setIsResending(false);
    }
  }

  return (
    <PublicAuthScreen contentContainerStyle={styles.container} topSpacing={28} bottomSpacing={28}>
        <View style={styles.content}>
          <Pressable accessibilityLabel="Voltar para login" accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={styles.iconCircle}>
            <SymbolView accessible={false} name={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }} size={34} tintColor="#5b50f5" />
          </View>
          <Text accessibilityRole="header" style={styles.title}>Verifique seu e-mail</Text>
          <Text style={styles.description}>Enviamos um código de verificação para</Text>
          <Text selectable style={styles.email}>{hasEmail ? email : 'seu e-mail'}</Text>

          <VerificationCodeInput
            accessibilityLabel="Código de confirmação de 6 dígitos"
            editable={!isVerifying && !isResending}
            label="Código de confirmação"
            value={code}
            onChangeText={(value) => {
              setCode(value);
              if (error) setError('');
              if (message) setMessage('');
            }}
          />

          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={styles.messageText}>{message}</Text> : null}

          <Pressable accessibilityRole="button" accessibilityState={{ busy: isResending || resendSeconds > 0, disabled: isResending || resendSeconds > 0 || !hasEmail }} disabled={isResending || resendSeconds > 0 || !hasEmail} onPress={() => void handleResend()} style={({ pressed }) => [styles.resendButton, pressed && styles.pressed]}>
            <Text style={[styles.resendText, (isResending || resendSeconds > 0 || !hasEmail) && styles.resendTextDisabled]}>{isResending ? 'Reenviando...' : resendSeconds > 0 ? `Reenviar e-mail em ${resendSeconds}s` : 'Reenviar e-mail'}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityState={{ busy: isVerifying, disabled: isVerifying || !hasEmail }} disabled={isVerifying || !hasEmail} onPress={() => void handleVerify()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (!hasEmail || isVerifying) && styles.primaryButtonDisabled]}>
            <Text style={styles.primaryButtonText}>{isVerifying ? 'Confirmando...' : 'Confirmar e-mail'}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.loginButton}>
            <Text style={styles.loginText}>Voltar para o login</Text>
          </Pressable>
        </View>
        <StatusBar style="auto" />
    </PublicAuthScreen>
  );
}

const baseStyles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  content: { maxWidth: 340, width: '100%' },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 22, minHeight: 40, width: 42 },
  backText: { color: '#17143b', fontSize: 38, fontWeight: '300', lineHeight: 38 },
  iconCircle: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#eceaff', borderRadius: 30, height: 60, justifyContent: 'center', width: 60 },
  title: { color: '#17143b', fontSize: 25, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  description: { color: '#62688c', fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  email: { color: '#302a58', fontSize: 14, fontWeight: '700', lineHeight: 21, textAlign: 'center' },
  errorText: { color: '#b42336', fontSize: 12.5, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  messageText: { color: '#247454', fontSize: 12.5, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  resendButton: { alignSelf: 'center', justifyContent: 'center', marginTop: 16, minHeight: 40, paddingHorizontal: 8 },
  resendText: { color: '#5145ca', fontSize: 13, fontWeight: '700' },
  resendTextDisabled: { color: '#77748b' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5945f5', borderRadius: 13, justifyContent: 'center', marginTop: 14, minHeight: 50 },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  loginButton: { alignSelf: 'center', justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 8 },
  loginText: { color: '#5145ca', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
