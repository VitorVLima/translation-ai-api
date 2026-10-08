import { useCallback, useRef } from 'react';
import { useFocusEffect, useNavigation } from 'expo-router';
import { BackHandler, Platform } from 'react-native';

export function useDeterministicBack(onBack: () => boolean | void, enabled = true): void {
  const navigation = useNavigation();
  const isRedirecting = useRef(false);

  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    isRedirecting.current = false;
    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', (event) => {
      // Intercept the navigator action before the Stack pops its history.
      if (event.data.action.type !== 'GO_BACK' && event.data.action.type !== 'POP') return;
      if (isRedirecting.current) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      isRedirecting.current = true;
      // A local panel may consume Back without starting a route transition.
      if (onBack() === false) isRedirecting.current = false;
    });

    // React Navigation's beforeRemove does not consume every native Android
    // back event when a tab navigator owns the active stack. Register the
    // focused screen's native handler and return true to stop the default pop.
    const hardwareBackSubscription = Platform.OS === 'android'
      ? BackHandler.addEventListener('hardwareBackPress', () => {
        if (isRedirecting.current) return true;
        isRedirecting.current = true;
        if (onBack() === false) isRedirecting.current = false;
        return true;
      })
      : null;

    return () => {
      hardwareBackSubscription?.remove();
      unsubscribeBeforeRemove();
    };
  }, [enabled, navigation, onBack]));
}
