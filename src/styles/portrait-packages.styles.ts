import { StyleSheet } from 'react-native';

export const portraitPackageStyles = StyleSheet.create({
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
  backButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  headline: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  scriptHeadline: {
    color: '#ffffff',
    fontFamily: 'Italianno',
    includeFontPadding: false,
  },
  heroTagline: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Italianno',
    includeFontPadding: false,
  },
  description: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
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
  packageImage: {
    position: 'absolute',
  },
  packageName: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  price: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  detailsList: {
    position: 'absolute',
  },
  detailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  detailBullet: {
    backgroundColor: '#515354',
  },
  details: {
    flexShrink: 1,
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  moreDetails: {
    color: '#4C77A5',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#8AA3C3',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  selectButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  selectButtonText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
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
  skeletonButton: {
    position: 'absolute',
    backgroundColor: '#CBD4DF',
  },
  emptyPackagesCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.15)',
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyPackagesTitle: {
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    fontSize: 22,
    includeFontPadding: false,
    lineHeight: 31,
  },
  emptyPackagesText: {
    color: '#4C5E76',
    fontFamily: 'Inter',
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 18,
    marginTop: 8,
  },
});
