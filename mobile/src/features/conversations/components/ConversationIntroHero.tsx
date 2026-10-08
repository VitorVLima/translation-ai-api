import { useThemedStyles } from '../../../theme/useThemedStyles';
import { ArtworkSoftener } from '../../../components/ArtworkSoftener';
import { Image, StyleSheet, View } from 'react-native';

const heroImage = require('../../../../docs/hero-conversa.png');
const { width: imageWidth, height: imageHeight } = Image.resolveAssetSource(heroImage);

export function ConversationIntroHero() {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.card}>
      <Image
        accessibilityLabel="Pratique conversas em inglês com a IA por texto ou voz, com correções e diferentes temas."
        resizeMode="contain"
        source={heroImage}
        style={styles.image}
      />
      <ArtworkSoftener />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    aspectRatio: imageWidth / imageHeight,
    borderRadius: 18,
    borderColor: '#e5e7f0',
    borderWidth: 1,
    maxWidth: 420,
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
