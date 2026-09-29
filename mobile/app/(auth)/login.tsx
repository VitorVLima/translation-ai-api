import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { login, LoginError } from '../../src/features/auth/auth.service';
import { establishSession } from '../../src/features/auth/auth.session';
import { useAuthNavigation } from '../../src/features/auth/auth-navigation';

function getEmailError(value: string) {
  const trimmedEmail = value.trim();
  if (!trimmedEmail) return 'Informe seu e-mail.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'Informe um e-mail válido.';
  return '';
}

export default function LoginScreen() {
  const { loginNotice, completeLogin } = useAuthNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState(loginNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

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
    try {
      const response = await login({ email: email.trim(), password });
      await establishSession(response);
      setPassword('');
      setShowPassword(false);
      completeLogin();
      Alert.alert('Login realizado com sucesso.');
    } catch (error) {
      if (error instanceof LoginError) {
        switch (error.kind) {
          case 'network':
            setLoginError('Não foi possível conectar ao servidor. Verifique sua conexão.');
            break;
          case 'invalidCredentials':
            setLoginError('E-mail ou senha incorretos.');
            break;
          case 'emailUnverified':
            setLoginError('Confirme seu e-mail antes de entrar.');
            break;
          case 'rateLimit':
            setLoginError('Muitas tentativas. Aguarde um pouco e tente novamente.');
            break;
          case 'validation':
            setLoginError('Confira e-mail e senha e tente novamente.');
            break;
          default:
            setLoginError('Não foi possível entrar agora. Tente novamente mais tarde.');
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          English<Text style={styles.brandAccent}>AI</Text>
        </Text>
        <Text style={styles.subtitle}>
          Entre para continuar praticando o seu inglês
        </Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <View style={[styles.inputFrame, emailError ? styles.inputFrameError : null]}>
              <SymbolView
                accessible={false}
                name={{ ios: 'envelope', android: 'mail', web: 'mail' }}
                size={19}
                tintColor="#68617c"
                style={styles.fieldIcon}
              />
              <TextInput
                accessibilityLabel="E-mail"
                accessibilityHint={emailError || undefined}
                style={styles.inputText}
                placeholder="seuemail@email.com"
                placeholderTextColor="#756f89"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (emailError) setEmailError(getEmailError(value));
                  if (loginError) setLoginError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>
            {emailError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{emailError}</Text> : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Senha</Text>
            <View style={[styles.inputFrame, passwordError ? styles.inputFrameError : null]}>
              <SymbolView
                accessible={false}
                name={{ ios: 'lock', android: 'lock', web: 'lock' }}
                size={19}
                tintColor="#68617c"
                style={styles.fieldIcon}
              />
              <TextInput
                accessibilityLabel="Senha"
                accessibilityHint={passwordError || undefined}
                style={styles.inputText}
                placeholder="Sua senha"
                placeholderTextColor="#756f89"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (passwordError) setPasswordError(value.trim() ? '' : 'Informe sua senha.');
                  if (loginError) setLoginError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onPress={() => setShowPassword(!showPassword)}
                style={({ pressed }) => [styles.passwordToggle, pressed && styles.buttonPressed]}
              >
                <SymbolView
                  accessible={false}
                  name={showPassword
                    ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                    : { ios: 'eye', android: 'visibility', web: 'visibility' }}
                  size={21}
                  tintColor="#5145ca"
                />
              </Pressable>
            </View>
            {passwordError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.forgotPassword}
          >
            <Text style={styles.secondaryText}>Esqueceu sua senha?</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            disabled={isSubmitting}
            onPress={handleLoginPress}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>{isSubmitting ? 'Entrando...' : 'Entrar'}</Text>
          </Pressable>
          {loginError ? <Text accessibilityLiveRegion="polite" style={styles.requestError}>{loginError}</Text> : null}

          <View style={styles.separator} accessibilityLabel="ou">
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.separatorLine} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.googleButton}
          >
            <Image
              accessible={false}
              source={require('../../assets/google-g.png')}
              style={styles.googleLogo}
            />
            <Text style={styles.googleButtonText}>Continuar com Google</Text>
          </Pressable>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Não tem uma conta?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.signupAction}
            >
              <Text style={styles.secondaryText}>Cadastre-se</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <StatusBar style="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  content: {
    width: '100%',
    maxWidth: 300,
  },
  title: {
    color: '#141326',
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  brandAccent: {
    color: '#a528eb',
  },
  subtitle: {
    alignSelf: 'center',
    color: '#4e5871',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 216,
    textAlign: 'center',
  },
  form: {
    marginTop: 44,
  },
  field: {
    gap: 4,
    marginBottom: 9,
  },
  label: {
    color: '#141326',
    fontSize: 13,
    fontWeight: '600',
  },
  inputFrame: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e0e4ee',
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: 'row',
    minHeight: 48,
  },
  inputFrameError: {
    borderColor: '#b42336',
  },
  errorText: {
    color: '#b42336',
    fontSize: 12,
  },
  requestError: {
    color: '#b42336',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  fieldIcon: {
    height: 19,
    marginLeft: 12,
    width: 19,
  },
  inputText: {
    color: '#201b35',
    flex: 1,
    fontSize: 14.5,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  passwordToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryText: {
    color: '#5145ca',
    fontSize: 13,
    fontWeight: '600',
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
  separator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  separatorLine: {
    backgroundColor: '#ddd9ea',
    flex: 1,
    height: 1,
  },
  separatorText: {
    color: '#5d5770',
    fontSize: 13,
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e0e4ee',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  googleLogo: {
    height: 20,
    width: 20,
  },
  googleButtonText: {
    color: '#302a42',
    fontSize: 13,
    fontWeight: '600',
  },
  signupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
  },
  signupText: {
    color: '#5d5770',
    fontSize: 12.5,
  },
  signupAction: {
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 6,
  },
});
