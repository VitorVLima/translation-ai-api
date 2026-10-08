import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PasswordResetError, requestPasswordReset, resetPassword, validatePasswordResetCode } from '../auth.service';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { PublicAuthScreen } from '../components/PublicAuthScreen';
import { VerificationCodeInput } from '../components/VerificationCodeInput';
import { getPasswordError } from '../password-rules';

type Phase = 'request' | 'code' | 'password' | 'success';
type Activity = 'request' | 'verify' | 'resend' | 'reset' | null;
const RESEND_COOLDOWN_SECONDS = 60;

function emailError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Informe um e-mail válido.';
  return '';
}

function maskEmail(value: string) {
  const [name, domain] = value.split('@');
  return name && domain ? `${name[0]}***@${domain}` : 'seu e-mail';
}

function serverError(error: PasswordResetError) {
  switch (error.kind) {
    case 'network': return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
    case 'validation': return 'Confira os dados informados e tente novamente.';
    case 'invalidCode': return 'Código inválido ou expirado. Confira ou solicite um novo código.';
    case 'rateLimit': return 'Muitas tentativas. Aguarde antes de tentar novamente.';
    default: return 'Não foi possível concluir a recuperação agora. Tente novamente.';
  }
}

export function PasswordRecoveryScreen() {
  const styles = useThemedStyles(baseStyles);
  const [phase, setPhase] = useState<Phase>('request');
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activity, setActivity] = useState<Activity>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const busyRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const busy = activity !== null;

  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(remaining);
      if (!remaining) setCooldownUntil(0);
    };
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  function startCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
    const duration = Math.max(1, seconds);
    setCooldownSeconds(duration);
    setCooldownUntil(Date.now() + duration * 1000);
  }

  function goToLogin() {
    if (busyRef.current) return;
    setEmail(''); setPendingEmail(''); setCode(''); setPassword(''); setConfirmation('');
    router.replace('/login');
  }

  const goBack = useCallback(() => {
    if (busyRef.current) return;
    setError(''); setMessage('');
    if (phase === 'password') {
      setPassword(''); setConfirmation(''); setPhase('code');
    } else if (phase === 'code') {
      setEmail(pendingEmail); setPendingEmail(''); setCode(''); setPhase('request');
    } else {
      setEmail(''); setPendingEmail(''); setCode(''); setPassword(''); setConfirmation('');
      router.replace('/login');
    }
  }, [phase, pendingEmail]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]));

  async function submitRequest() {
    if (busyRef.current || phase !== 'request') return;
    const validation = emailError(email);
    setError(validation); setMessage('');
    if (validation) return;
    busyRef.current = true; setActivity('request');
    try {
      const normalizedEmail = email.trim();
      await requestPasswordReset({ email: normalizedEmail });
      setPendingEmail(normalizedEmail); setEmail(''); setCode(''); setPhase('code'); startCooldown();
      setMessage('Se o e-mail estiver cadastrado, enviaremos um código de recuperação.');
    } catch (requestError) {
      setError(requestError instanceof PasswordResetError ? serverError(requestError) : 'Não foi possível solicitar o código agora.');
    } finally { busyRef.current = false; setActivity(null); }
  }

  async function resend() {
    if (busyRef.current || phase !== 'code' || !pendingEmail || cooldownSeconds > 0) return;
    busyRef.current = true; setActivity('resend'); setError(''); setMessage('');
    try {
      await requestPasswordReset({ email: pendingEmail });
      startCooldown(); setCode('');
      setMessage('Se o e-mail estiver cadastrado, um novo código foi enviado.');
    } catch (requestError) {
      if (requestError instanceof PasswordResetError && requestError.retryAfterSeconds) startCooldown(requestError.retryAfterSeconds);
      setError(requestError instanceof PasswordResetError ? serverError(requestError) : 'Não foi possível reenviar o código agora.');
    } finally { busyRef.current = false; setActivity(null); }
  }

  async function confirmCode() {
    if (busyRef.current || phase !== 'code' || !pendingEmail) return;
    if (!/^\d{6}$/.test(code)) { setError('Informe um código de 6 dígitos.'); return; }
    busyRef.current = true; setActivity('verify'); setError(''); setMessage('');
    try {
      await validatePasswordResetCode({ email: pendingEmail, code });
      setPhase('password');
    } catch (requestError) {
      if (requestError instanceof PasswordResetError && requestError.retryAfterSeconds) startCooldown(requestError.retryAfterSeconds);
      setError(requestError instanceof PasswordResetError ? serverError(requestError) : 'Não foi possível confirmar o código agora.');
    } finally { busyRef.current = false; setActivity(null); }
  }

  async function submitReset() {
    if (busyRef.current || phase !== 'password' || !pendingEmail) return;
    const validation = getPasswordError(password);
    setError('');
    if (validation) { setError(validation); return; }
    if (password !== confirmation) { setError('As senhas não coincidem.'); return; }
    busyRef.current = true; setActivity('reset');
    try {
      await resetPassword({ email: pendingEmail, code, newPassword: password });
      setCode(''); setPassword(''); setConfirmation(''); setPendingEmail(''); setPhase('success');
    } catch (requestError) {
      if (requestError instanceof PasswordResetError && requestError.kind === 'invalidCode') {
        setPassword(''); setConfirmation(''); setPhase('code');
      }
      setError(requestError instanceof PasswordResetError ? serverError(requestError) : 'Não foi possível alterar a senha agora.');
    } finally { busyRef.current = false; setActivity(null); }
  }

  return (
    <PublicAuthScreen scrollRef={scrollRef} contentContainerStyle={styles.container} topSpacing={28} bottomSpacing={28}>
      <View style={styles.content}>
        <Pressable accessibilityLabel={phase === 'request' || phase === 'success' ? 'Voltar para login' : phase === 'code' ? 'Voltar para recuperar senha' : 'Voltar para o código'} accessibilityRole="button" onPress={phase === 'success' ? goToLogin : goBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.iconCircle}>
          <SymbolView accessible={false} name={phase === 'code' ? { ios: 'envelope.fill', android: 'mail', web: 'mail' } : { ios: 'lock.rotation', android: 'lock', web: 'lock' }} size={34} tintColor="#5b50f5" />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{phase === 'request' ? 'Recuperar senha' : phase === 'code' ? 'Código de recuperação' : phase === 'password' ? 'Criar nova senha' : 'Senha alterada!'}</Text>
        <Text style={styles.description}>{phase === 'request' ? 'Informe o e-mail da sua conta. Enviaremos um código para confirmar sua identidade.' : phase === 'code' ? 'Enviamos um código para:' : phase === 'password' ? 'Escolha uma nova senha para sua conta.' : 'Sua senha foi redefinida. Entre usando a nova senha.'}</Text>
        {phase === 'code' ? <Text selectable style={styles.email}>{maskEmail(pendingEmail)}</Text> : null}

        {phase === 'request' ? <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <View style={[styles.inputFrame, error ? styles.inputFrameError : null]}>
              <SymbolView accessible={false} name={{ ios: 'envelope', android: 'mail', web: 'mail' }} size={19} tintColor="#68617c" style={styles.fieldIcon} />
              <TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={(value) => { setEmail(value); setError(''); }} placeholder="seuemail@email.com" placeholderTextColor="#756f89" style={styles.inputText} value={email} />
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ busy: activity === 'request', disabled: busy }} disabled={busy} onPress={() => void submitRequest()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{activity === 'request' ? 'Enviando...' : 'Enviar código'}</Text></Pressable>
        </View> : null}

        {phase === 'code' ? <>
          <VerificationCodeInput accessibilityLabel="Código de recuperação de 6 dígitos" editable={!busy} label="Código de recuperação" value={code} onChangeText={(value) => { setCode(value); setError(''); setMessage(''); }} />
          {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={styles.messageText}>{message}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ busy: activity === 'resend', disabled: busy || cooldownSeconds > 0 }} disabled={busy || cooldownSeconds > 0} onPress={() => void resend()} style={styles.resendButton}>
            <Text style={[styles.secondaryText, (busy || cooldownSeconds > 0) && styles.disabledText]}>{activity === 'resend' ? 'Reenviando...' : cooldownSeconds > 0 ? `Reenviar código em ${cooldownSeconds}s` : 'Reenviar código'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ busy: activity === 'verify', disabled: busy || code.length !== 6 }} disabled={busy || code.length !== 6} onPress={() => void confirmCode()} style={[styles.primaryButton, code.length !== 6 && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{activity === 'verify' ? 'Confirmando...' : 'Confirmar código'}</Text></Pressable>
        </> : null}

        {phase === 'password' ? <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Nova senha</Text>
            <View style={[styles.inputFrame, error ? styles.inputFrameError : null]}>
              <SymbolView accessible={false} name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={19} tintColor="#68617c" style={styles.fieldIcon} />
              <TextInput accessibilityLabel="Nova senha" autoCapitalize="none" autoComplete="new-password" autoCorrect={false} onChangeText={(value) => { setPassword(value); setError(''); }} onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))} placeholder="Sua nova senha" placeholderTextColor="#756f89" secureTextEntry={!showPassword} style={styles.inputText} value={password} />
              <Pressable accessibilityLabel={showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'} accessibilityRole="button" onPress={() => setShowPassword(!showPassword)} style={styles.toggle}><SymbolView accessible={false} name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} size={21} tintColor="#5145ca" /></Pressable>
            </View>
          </View>
          <PasswordRequirements password={password} />
          <View style={styles.field}>
            <Text style={styles.label}>Confirmar nova senha</Text>
            <View style={[styles.inputFrame, error ? styles.inputFrameError : null]}>
              <SymbolView accessible={false} name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={19} tintColor="#68617c" style={styles.fieldIcon} />
              <TextInput accessibilityLabel="Confirmar nova senha" autoCapitalize="none" autoComplete="new-password" autoCorrect={false} onChangeText={(value) => { setConfirmation(value); setError(''); }} onFocus={() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))} placeholder="Repita sua nova senha" placeholderTextColor="#756f89" secureTextEntry={!showConfirmation} style={styles.inputText} value={confirmation} />
              <Pressable accessibilityLabel={showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'} accessibilityRole="button" onPress={() => setShowConfirmation(!showConfirmation)} style={styles.toggle}><SymbolView accessible={false} name={showConfirmation ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} size={21} tintColor="#5145ca" /></Pressable>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ busy: activity === 'reset', disabled: busy }} disabled={busy} onPress={() => void submitReset()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{activity === 'reset' ? 'Redefinindo...' : 'Redefinir senha'}</Text></Pressable>
        </View> : null}

        {phase === 'success' ? <Pressable accessibilityRole="button" onPress={goToLogin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Entrar</Text></Pressable> : null}
        {phase !== 'code' && error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
        {phase === 'request' && message ? <Text accessibilityLiveRegion="polite" style={styles.messageText}>{message}</Text> : null}
        {phase === 'request' ? <Pressable accessibilityRole="button" onPress={goToLogin} style={styles.loginButton}><Text style={styles.secondaryText}>Voltar para entrar</Text></Pressable> : null}
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
  form: { marginTop: 28 },
  field: { gap: 4, marginBottom: 12 },
  label: { color: '#211d39', fontSize: 13, fontWeight: '700' },
  inputFrame: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe3ef', borderRadius: 11, borderWidth: 1, flexDirection: 'row', minHeight: 48 },
  inputFrameError: { borderColor: '#b42336' },
  fieldIcon: { height: 19, marginLeft: 12, width: 19 },
  inputText: { color: '#201b35', flex: 1, fontSize: 14.5, minHeight: 46, minWidth: 0, paddingHorizontal: 10, paddingVertical: 9 },
  toggle: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  primaryButton: { alignItems: 'center', backgroundColor: '#5945f5', borderRadius: 13, justifyContent: 'center', marginTop: 14, minHeight: 50 },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  resendButton: { alignSelf: 'center', justifyContent: 'center', marginTop: 16, minHeight: 40, paddingHorizontal: 8 },
  secondaryText: { color: '#5145ca', fontSize: 13, fontWeight: '700' },
  disabledText: { color: '#77748b' },
  loginButton: { alignSelf: 'center', justifyContent: 'center', marginTop: 12, minHeight: 42, paddingHorizontal: 8 },
  errorText: { color: '#b42336', fontSize: 12.5, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  messageText: { color: '#247454', fontSize: 12.5, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
