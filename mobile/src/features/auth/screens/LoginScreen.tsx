import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { login, LoginError } from '../auth.service';
import { establishSession } from '../auth.session';
import { useAuthNavigation } from '../auth-navigation';
import { GoogleSignInButton, type GoogleSignInErrorKind } from '../components/GoogleSignInButton';
import { PublicAuthScreen } from '../components/PublicAuthScreen';

function getEmailError(value: string) {
  const trimmedEmail = value.trim();
  if (!trimmedEmail) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'Informe um e-mail válido.';
  return '';
}

function getGoogleError(kind: GoogleSignInErrorKind) {
  switch (kind) {
    case 'cancelled': return 'Autenticação com Google cancelada.';
    case 'conflict': return 'Este e-mail já possui uma conta com senha. Entre com e-mail e senha.';
    case 'invalid': return 'Não foi possível validar sua conta Google.';
    case 'network': return 'Não foi possível conectar ao servidor.';
    case 'rateLimit': return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'unavailable': return 'Login com Google está indisponível no momento.';
    default: return 'Não foi possível entrar com Google. Tente novamente.';
  }
}

export function LoginScreen() {
  const styles = useThemedStyles(baseStyles);
  const { loginNotice, completeLogin } = useAuthNavigation();
  const { email: verifiedEmailParam, verified } = useLocalSearchParams<{ email?: string; verified?: string }>();
  const verifiedEmail = typeof verifiedEmailParam === 'string' ? verifiedEmailParam.trim() : '';
  const [email, setEmail] = useState(verifiedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState(loginNotice);
  const [loginSuccess, setLoginSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (verified !== '1') return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (verifiedEmail) setEmail(verifiedEmail);
      setLoginError('');
      setLoginSuccess('E-mail confirmado. Você já pode entrar.');
    });
    return () => { active = false; };
  }, [verified, verifiedEmail]);

  function keepPasswordControlsVisible() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  async function handleLoginPress() {
    if (submittingRef.current) return;

    const nextEmailError = getEmailError(email);
    const nextPasswordError = password.trim() ? '' : 'Informe sua senha.';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setLoginError('');
    setLoginSuccess('');
    try {
      const response = await login({ email: email.trim(), password });
      await establishSession(response);
      setPassword('');
      setShowPassword(false);
      await completeLogin();
    } catch (error) {
      if (error instanceof LoginError) {
        switch (error.kind) {
          case 'network': setLoginError('Não foi possível conectar ao servidor. Verifique sua conexão.'); break;
          case 'invalidCredentials': setLoginError('E-mail ou senha incorretos.'); break;
          case 'emailUnverified':
            setPassword('');
            setShowPassword(false);
            router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
            return;
          case 'rateLimit': setLoginError('Muitas tentativas. Aguarde um pouco e tente novamente.'); break;
          case 'validation': setLoginError('Confira e-mail e senha e tente novamente.'); break;
          default: setLoginError('Não foi possível entrar agora. Tente novamente mais tarde.');
        }
      } else {
        setPassword('');
        setShowPassword(false);
        setLoginError('Não foi possível concluir o login com segurança. Tente novamente.');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <PublicAuthScreen scrollRef={scrollRef} contentContainerStyle={styles.container} topSpacing={28} bottomSpacing={40}>
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <Image accessible={false} source={require('../../../../assets/icon.png')} style={styles.brandIcon} />
            <Text accessibilityRole="header" style={styles.brand}>English<Text style={styles.brandAccent}>AI</Text></Text>
          </View>
          <Text style={styles.subtitle}>Entre para continuar praticando o seu inglês</Text>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <View style={[styles.inputFrame, emailError ? styles.inputFrameError : null]}>
                <SymbolView accessible={false} name={{ ios: 'envelope', android: 'mail', web: 'mail' }} size={19} tintColor="#68617c" style={styles.fieldIcon} />
                <TextInput accessibilityLabel="E-mail" accessibilityHint={emailError || undefined} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={(value) => { setEmail(value); if (emailError) setEmailError(getEmailError(value)); if (loginError) setLoginError(''); if (loginSuccess) setLoginSuccess(''); }} placeholder="seuemail@email.com" placeholderTextColor="#756f89" style={styles.inputText} value={email} />
              </View>
              {emailError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Senha</Text>
              <View style={[styles.inputFrame, passwordError ? styles.inputFrameError : null]}>
                <SymbolView accessible={false} name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={19} tintColor="#68617c" style={styles.fieldIcon} />
                <TextInput accessibilityLabel="Senha" accessibilityHint={passwordError || undefined} autoCapitalize="none" autoComplete="current-password" autoCorrect={false} onChangeText={(value) => { setPassword(value); if (passwordError) setPasswordError(value.trim() ? '' : 'Informe sua senha.'); if (loginError) setLoginError(''); if (loginSuccess) setLoginSuccess(''); }} onFocus={keepPasswordControlsVisible} placeholder="Sua senha" placeholderTextColor="#756f89" secureTextEntry={!showPassword} style={styles.inputText} value={password} />
                <Pressable accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} accessibilityRole="button" onPress={() => setShowPassword(!showPassword)} style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]}>
                  <SymbolView accessible={false} name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} size={21} tintColor="#5145ca" />
                </Pressable>
              </View>
              {passwordError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.forgotPassword}><Text style={styles.secondaryText}>Esqueci minha senha</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }} disabled={isSubmitting} onPress={() => void handleLoginPress()} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>{isSubmitting ? 'Entrando...' : 'Entrar'}</Text>
            </Pressable>
            {loginError ? <Text accessibilityLiveRegion="polite" style={styles.requestError}>{loginError}</Text> : null}
            {loginSuccess ? <Text accessibilityLiveRegion="polite" style={styles.requestSuccess}>{loginSuccess}</Text> : null}
          </View>

          <View accessibilityLabel="ou" style={styles.separator}><View style={styles.separatorLine} /><Text style={styles.separatorText}>ou</Text><View style={styles.separatorLine} /></View>
          <GoogleSignInButton onAuthenticated={async (response) => { await establishSession(response); await completeLogin(); }} onError={(kind) => setLoginError(getGoogleError(kind))} />
          <View style={styles.signupRow}><Text style={styles.signupText}>Não tem uma conta?</Text><Pressable accessibilityRole="button" onPress={() => router.push('/register')} style={styles.signupAction}><Text style={styles.secondaryText}>Cadastre-se</Text></Pressable></View>
        </View>
        <StatusBar style="auto" />
    </PublicAuthScreen>
  );
}

const baseStyles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  content: { maxWidth: 300, width: '100%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center' },
  brandIcon: { borderRadius: 13, height: 44, width: 44 },
  brand: { color: '#141326', fontSize: 30, fontWeight: '800' },
  brandAccent: { color: '#6c44f5' },
  subtitle: { alignSelf: 'center', color: '#4e5871', fontSize: 16, fontWeight: '400', lineHeight: 23, marginTop: 8, maxWidth: 216, textAlign: 'center' },
  form: { marginTop: 44 },
  field: { gap: 4, marginBottom: 9 },
  label: { color: '#141326', fontSize: 13, fontWeight: '600' },
  inputFrame: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0e4ee', borderRadius: 11, borderWidth: 1, flexDirection: 'row', minHeight: 48 },
  inputFrameError: { borderColor: '#b42336' },
  errorText: { color: '#b42336', fontSize: 12 },
  requestError: { color: '#b42336', fontSize: 12, marginTop: 8, textAlign: 'center' },
  requestSuccess: { color: '#247454', fontSize: 12, marginTop: 8, textAlign: 'center' },
  fieldIcon: { height: 19, marginLeft: 12, width: 19 },
  inputText: { color: '#201b35', flex: 1, fontSize: 14.5, minHeight: 46, minWidth: 0, paddingHorizontal: 10, paddingVertical: 9 },
  passwordToggle: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  forgotPassword: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 44 },
  secondaryText: { color: '#5145ca', fontSize: 13, fontWeight: '600' },
  button: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 10, justifyContent: 'center', marginTop: 6, minHeight: 48, paddingHorizontal: 32, paddingVertical: 10 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
  separator: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 14 },
  separatorLine: { backgroundColor: '#ddd9ea', flex: 1, height: 1 },
  separatorText: { color: '#5d5770', fontSize: 13 },
  signupRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  signupText: { color: '#5d5770', fontSize: 12.5 },
  signupAction: { justifyContent: 'center', minHeight: 48, paddingHorizontal: 6 },
});
