import { StyleSheet } from 'react-native';

export const servicesStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EEEE',
    overflow: 'hidden',
  },
  canvas: {
    position: 'relative',
    backgroundColor: '#F3EEEE',
  },
  listScrollView: {
    position: 'absolute',
  },
  listScrollContent: {
    backgroundColor: '#F3EEEE',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(7, 18, 32, 0.48)',
  },
  backgroundPanel: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#F3EEEE',
  },
  brandTitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  eyebrow: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  title: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  scriptTitle: {
    color: '#70A2E3',
    fontFamily: 'Italianno',
    includeFontPadding: false,
  },
  capturedTitle: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  titlePhraseRow: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
  },
  subtitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  cameraIcon: {
    position: 'absolute',
  },
  titleCameraIcon: {
    flexShrink: 0,
  },
  card: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  cardPressable: {
    flex: 1,
  },
  cardImage: {
    position: 'absolute',
  },
  cardCategory: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  cardTitle: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  cardDescription: {
    position: 'absolute',
    color: '#515354',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  arrowButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#EEE7E7',
    justifyContent: 'center',
  },
  skeletonCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  skeletonImage: {
    position: 'absolute',
    backgroundColor: '#DDD5D5',
  },
  skeletonLine: {
    position: 'absolute',
    backgroundColor: '#E7DFDF',
  },
  skeletonLineStrong: {
    position: 'absolute',
    backgroundColor: '#D9D0D0',
  },
  skeletonCircle: {
    position: 'absolute',
    backgroundColor: '#EEE7E7',
  },
});
