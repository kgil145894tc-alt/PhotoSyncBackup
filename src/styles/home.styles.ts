import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EEEE',
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
  },
  contentPanel: {
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
  notificationButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#ED2314',
    borderColor: '#ffffff',
    borderWidth: 1,
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    textAlign: 'center',
  },
  cameraIcon: {
    position: 'absolute',
  },
  photographerName: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Italianno',
    includeFontPadding: false,
  },
  photographyRow: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photographyLine: {
    height: 1,
    backgroundColor: '#ffffff',
  },
  photographyText: {
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  headline: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  subtitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  bookButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#4C77A5',
    justifyContent: 'center',
  },
  bookButtonText: {
    color: '#ffffff',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  highlightsTitle: {
    position: 'absolute',
    color: '#162B4A',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  panelDot: {
    position: 'absolute',
    backgroundColor: '#162B4A',
  },
  highlightImage: {
    position: 'absolute',
    shadowColor: '#142C4C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
    elevation: 4,
  },
  highlightLabel: {
    position: 'absolute',
    color: '#162B4A',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    textAlign: 'center',
  },
});
