const appJson = require('./app.json');

module.exports = ({ config }) => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID?.trim();
  const base = { ...appJson.expo, ...config };
  const releaseBuild = process.env.NODE_ENV === 'production' || process.env.EAS_BUILD_PROFILE === 'production';
  if (releaseBuild) {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      throw new Error('A production build requires a valid EXPO_PUBLIC_API_URL');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('A production build requires an HTTPS EXPO_PUBLIC_API_URL');
    }
  }

  return {
    ...base,
    android: {
      ...appJson.expo.android,
      ...config.android,
      package: config.android?.package || appJson.expo.android.package || 'com.englishai.app',
    },
    ios: {
      ...appJson.expo.ios,
      ...config.ios,
      bundleIdentifier: config.ios?.bundleIdentifier || appJson.expo.ios.bundleIdentifier || 'com.englishai.app',
    },
    plugins: [
      ...(config.plugins || appJson.expo.plugins || []),
      'expo-asset',
      'expo-font',
      '@react-native-community/datetimepicker',
      ...(iosUrlScheme
        ? [['react-native-nitro-google-signin', { iosUrlScheme }]]
        : []),
    ],
  };
};
