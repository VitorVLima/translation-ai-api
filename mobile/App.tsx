import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          EnglishAI
        </Text>
        <Text style={styles.subtitle}>Aprenda inglês praticando.</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setStarted(true);
            setCount(count + 1);
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Começar</Text>
        </Pressable>

        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {started ? `Começando... (${count})` : ''}
        </Text>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7ff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    color: '#5b50f5',
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#4b4560',
    fontSize: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#5b50f5',
    borderRadius: 12,
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  message: {
    color: '#4b4560',
    fontSize: 16,
    marginTop: 24,
    minHeight: 24,
    textAlign: 'center',
  },
});
