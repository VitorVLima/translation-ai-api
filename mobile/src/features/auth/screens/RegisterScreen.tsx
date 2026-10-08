import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { establishSession } from '../auth.session';
import { useAuthNavigation } from '../auth-navigation';
import { GoogleSignInButton, type GoogleSignInErrorKind } from '../components/GoogleSignInButton';
import { PublicAuthScreen } from '../components/PublicAuthScreen';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { register, RegisterError } from '../auth.service';
import { getPasswordError } from '../password-rules';

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

export function RegisterScreen() {
  const styles = useThemedStyles(baseStyles);
  const { completeLogin } = useAuthNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  function keepPasswordControlsVisible() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  async function handleRegisterPress() {
    if (submittingRef.current) return;
    const nextEmailError = getEmailError(email);
    const nextPasswordError = getPasswordError(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setRequestError('');
    try {
      const user = await register({ email: email.trim(), password });
      router.replace({ pathname: '/verify-email', params: { email: user.email, sent: '1' } });
    } catch (error) {
      if (error instanceof RegisterError) {
        switch (error.kind) {
          case 'network': setRequestError('Não foi possível conectar ao servidor. Verifique sua conexão.'); break;
          case 'validation': setRequestError('Confira e-mail e senha.'); break;
          case 'conflict': setRequestError('Este e-mail já está em uso.'); break;
          case 'rateLimit': setRequestError('Muitas tentativas. Aguarde um pouco e tente novamente.'); break;
          default: setRequestError('Não foi possível criar sua conta agora. Tente novamente.');
        }
      } else {
        setRequestError('Não foi possível criar sua conta com segurança. Tente novamente.');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <PublicAuthScreen scrollRef={scrollRef} contentContainerStyle={styles.container} topSpacing={16} bottomSpacing={28}>
        <View style={styles.content}>
          <Pressable accessibilityLabel="Voltar para login" accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
          <View style={styles.brandRow}><Image accessible={false} source={require('../../../../assets/icon.png')} style={styles.brandIcon} /><Text accessibilityRole="header" style={styles.brand}>English<Text style={styles.brandAccent}>AI</Text></Text></View>
          <Text style={styles.subtitle}>Crie sua conta e comece sua{ '\n' }jornada no inglês.</Text>

          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <View style={[styles.inputFrame, emailError ? styles.inputFrameError : null]}><SymbolView accessible={false} name={{ ios: 'envelope', android: 'mail', web: 'mail' }} size={19} tintColor="#68617c" style={styles.fieldIcon} /><TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={(value) => { setEmail(value); if (emailError) setEmailError(getEmailError(value)); if (requestError) setRequestError(''); }} placeholder="seuemail@email.com" placeholderTextColor="#8b8aa5" style={styles.inputText} value={email} /></View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Senha</Text>
              <View style={[styles.inputFrame, passwordError ? styles.inputFrameError : null]}><SymbolView accessible={false} name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={19} tintColor="#68617c" style={styles.fieldIcon} /><TextInput accessibilityLabel="Senha" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setPassword(value); if (passwordError) setPasswordError(getPasswordError(value)); if (requestError) setRequestError(''); }} onFocus={keepPasswordControlsVisible} placeholder="Sua senha" placeholderTextColor="#8b8aa5" secureTextEntry={!showPassword} style={styles.inputText} value={password} /><Pressable accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} accessibilityRole="button" onPress={() => setShowPassword(!showPassword)} style={styles.passwordToggle}><SymbolView accessible={false} name={showPassword ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }} size={21} tintColor="#5145ca" /></Pressable></View>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>
            <PasswordRequirements password={password} />
            <Pressable accessibilityRole="button" accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }} disabled={isSubmitting} onPress={() => void handleRegisterPress()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{isSubmitting ? 'Criando conta...' : 'Criar conta'}</Text></Pressable>
            {requestError ? <Text accessibilityLiveRegion="polite" style={styles.requestError}>{requestError}</Text> : null}
          </View>

          <View accessibilityLabel="ou continue com" style={styles.separator}><View style={styles.separatorLine} /><Text style={styles.separatorText}>ou continue com</Text><View style={styles.separatorLine} /></View>
          <GoogleSignInButton onAuthenticated={async (response) => { await establishSession(response); await completeLogin(); router.replace('/'); }} onError={(kind) => setRequestError(getGoogleError(kind))} />
          <View style={styles.bottomRow}><Text style={styles.bottomText}>Já tem uma conta?</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.linkButton}><Text style={styles.linkText}>Entrar</Text></Pressable></View>
        </View>
        <StatusBar style="auto" />
    </PublicAuthScreen>
  );
}

const baseStyles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, paddingHorizontal: 22 },
  content: { maxWidth: 380, width: '100%' },
  backButton: { justifyContent: 'center', minHeight: 38, width: 42 },
  backText: { color: '#17143b', fontSize: 38, fontWeight: '300', lineHeight: 38 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center' },
  brandIcon: { borderRadius: 13, height: 44, width: 44 },
  brand: { color: '#141326', fontSize: 30, fontWeight: '800' },
  brandAccent: { color: '#6c44f5' },
  subtitle: { color: '#62688c', fontSize: 17, lineHeight: 23, marginTop: 8, textAlign: 'center' },
  formCard: { backgroundColor: '#fff', borderColor: '#eceaf5', borderRadius: 22, borderWidth: 1, marginTop: 18, padding: 16 },
  field: { marginBottom: 9 },
  label: { color: '#211d39', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  inputFrame: { alignItems: 'center', borderColor: '#dfe3ef', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 49 },
  inputFrameError: { borderColor: '#b42336' },
  fieldIcon: { height: 19, marginLeft: 13, width: 19 },
  inputText: { color: '#201b35', flex: 1, fontSize: 15, minHeight: 47, minWidth: 0, paddingHorizontal: 10, paddingVertical: 8 },
  passwordToggle: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  errorText: { color: '#b42336', fontSize: 12, marginTop: 3 },
  primaryButton: { alignItems: 'center', backgroundColor: '#5945f5', borderRadius: 13, justifyContent: 'center', minHeight: 50, marginTop: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  requestError: { color: '#b42336', fontSize: 12, marginTop: 8, textAlign: 'center' },
  separator: { alignItems: 'center', flexDirection: 'row', gap: 10, marginVertical: 13 },
  separatorLine: { backgroundColor: '#ddd9ea', flex: 1, height: 1 },
  separatorText: { color: '#6a6680', fontSize: 12.5 },
  bottomRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 9 },
  bottomText: { color: '#6a6680', fontSize: 13 },
  linkButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 5 },
  linkText: { color: '#5145ca', fontSize: 13, fontWeight: '700' },
});
