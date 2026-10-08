import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
} from '../../../config/google';
import { loginWithGoogle, requestGoogleNonce, type GoogleLoginErrorKind } from '../auth.service';
import type { LoginResponse } from '../auth.types';
import {
  GoogleOneTapSignIn,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

export type GoogleSignInErrorKind = GoogleLoginErrorKind | 'cancelled' | 'unavailable';

export type GoogleSignInButtonProps = {
  onAuthenticated: (response: LoginResponse) => Promise<void>;
  onError: (kind: GoogleSignInErrorKind) => void;
};

export function GoogleSignInButton({ onAuthenticated, onError }: GoogleSignInButtonProps) {
  const styles = useThemedStyles(baseStyles);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function finish() {
    busyRef.current = false;
    setBusy(false);
  }

  function fail(kind: GoogleSignInErrorKind) {
    finish();
    onError(kind);
  }

  async function handlePress() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const serverNonce = await requestGoogleNonce();
      const nonceDigest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        serverNonce,
      );

      GoogleOneTapSignIn.configure({
        webClientId: GOOGLE_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        nonce: nonceDigest,
        scopes: ['email', 'profile'],
      });
      await GoogleOneTapSignIn.checkPlayServices();
      const result = await GoogleOneTapSignIn.presentExplicitSignIn();
      if (!isSuccessResponse(result)) {
        fail(result.type === 'cancelled' ? 'cancelled' : 'unexpected');
        return;
      }

      const credential = result.data?.idToken?.trim();
      if (!credential) {
        fail('unexpected');
        return;
      }
      const loginResponse = await loginWithGoogle({ credential, nonce: serverNonce });
      await onAuthenticated(loginResponse);
      finish();
    } catch (error: unknown) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
        fail('cancelled');
        return;
      }
      const kind = error && typeof error === 'object' && 'kind' in error
        ? (error as { kind?: GoogleSignInErrorKind }).kind
        : undefined;
      fail(kind === 'network' || kind === 'invalid' || kind === 'conflict' || kind === 'rateLimit' || kind === 'unexpected'
        ? kind
        : 'unavailable');
    }
  }

  return (
    <Pressable
      accessibilityLabel="Entrar com Google"
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => void handlePress()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator color="#5145ca" size="small" /> : <Image accessible={false} source={require('../../../../assets/google-g.png')} style={styles.logo} />}
      <Text style={styles.text}>{busy ? 'Entrando com Google...' : 'Entrar com Google'}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#dfe3ef',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  logo: { height: 20, width: 20 },
  pressed: { opacity: 0.78 },
  text: { color: '#151433', fontSize: 14, fontWeight: '700' },
});
