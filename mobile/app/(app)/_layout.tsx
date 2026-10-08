import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../src/i18n';
import { useTheme } from '../../src/theme/ThemeProvider';

const TAB_CONTENT_HEIGHT = 60;

function TabIcon({ color, name }: { color: ColorValue; name: SymbolViewProps['name'] }) {
  return <SymbolView accessible={false} name={name} size={24} tintColor={color} />;
}

export default function PrivateLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 3,
        },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: TAB_CONTENT_HEIGHT + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarAccessibilityLabel: t('navigation.home'),
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'house.fill', android: 'home', web: 'home' }} />
          ),
          tabBarLabel: t('navigation.home'),
          title: t('navigation.home'),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          tabBarAccessibilityLabel: t('navigation.practice'),
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'target', android: 'target', web: 'target' }} />
          ),
          tabBarLabel: t('navigation.practice'),
          title: t('navigation.practice'),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          tabBarAccessibilityLabel: t('navigation.conversations'),
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} />
          ),
          tabBarLabel: t('navigation.conversations'),
          title: t('navigation.conversations'),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          tabBarAccessibilityLabel: t('navigation.progress'),
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'chart.bar.fill', android: 'leaderboard', web: 'leaderboard' }} />
          ),
          tabBarLabel: t('navigation.progress'),
          title: t('navigation.progress'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: t('navigation.profile'),
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'person.fill', android: 'person', web: 'person' }} />
          ),
          tabBarLabel: t('navigation.profile'),
          title: t('navigation.profile'),
        }}
      />
    </Tabs>
  );
}
