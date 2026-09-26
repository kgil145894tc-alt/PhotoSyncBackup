import { StyleSheet } from 'react-native';

export const bookStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EEEE',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    backgroundColor: '#F3EEEE',
  },
  canvas: {
    position: 'relative',
    backgroundColor: '#F3EEEE',
  },
  backButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  logo: {
    position: 'absolute',
  },
  heroCard: {
    position: 'absolute',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
  },
  heroOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#8AA3C3',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  packageTitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  packageSubtitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  inclusionCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  inclusionRow: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
  },
  inclusionText: {
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  note: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
    textAlign: 'center',
  },
  price: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  bookButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  bookButtonText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
});
