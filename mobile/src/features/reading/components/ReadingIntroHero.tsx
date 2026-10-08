import { useThemedStyles } from '../../../theme/useThemedStyles';
import { ArtworkSoftener } from '../../../components/ArtworkSoftener';
import { SymbolView } from 'expo-symbols';
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

type Props = { image?: ImageSourcePropType };

// Pass a static require of mobile/docs/hero-leitura.png when the Reading artwork is supplied.
export function ReadingIntroHero({ image }: Props) {
  const styles = useThemedStyles(baseStyles);
  const asset = image ? Image.resolveAssetSource(image) : null;
  if (image && asset?.width && asset.height) {
    return <View style={[styles.imageCard, { aspectRatio: asset.width / asset.height }]}>
      <Image accessibilityLabel="Pratique sua leitura em inglês" resizeMode="contain" source={image} style={styles.image} />
      <ArtworkSoftener />
    </View>;
  }

  return <View style={styles.card}>
    <View pointerEvents="none" style={styles.orb} />
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>LEITURA EM INGLÊS</Text>
      <Text style={styles.title}>Pratique sua leitura em inglês</Text>
      <Text style={styles.description}>Leia, compreenda e responda a três perguntas para acompanhar sua evolução.</Text>
    </View>
    <View style={styles.book}>
      <SymbolView accessible={false} name={{ ios: 'book.closed.fill', android: 'menu_book', web: 'menu_book' }} size={42} tintColor="#ffffff" />
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  imageCard: { alignSelf: 'center', borderColor: '#e5e7f0', borderRadius: 18, borderWidth: 1, maxWidth: 420, overflow: 'hidden', width: '100%' },
  image: { height: '100%', width: '100%' },
  card: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#ebe8ff', borderRadius: 18, flexDirection: 'row', minHeight: 146, overflow: 'hidden', padding: 17, width: '100%' },
  orb: { backgroundColor: '#d9d3ff', borderRadius: 85, height: 170, position: 'absolute', right: -43, top: -55, width: 170 },
  copy: { flex: 1, paddingRight: 8 },
  eyebrow: { color: '#5b50f5', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  title: { color: '#171528', fontSize: 19, fontWeight: '800', lineHeight: 24, marginTop: 6 },
  description: { color: '#625d7f', fontSize: 11, lineHeight: 16, marginTop: 6 },
  book: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 35, height: 70, justifyContent: 'center', width: 70 },
});
