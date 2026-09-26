import { StyleSheet } from 'react-native';

export const bookingSuccessStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAF4FF',
    overflow: 'hidden',
  },
  canvas: {
    position: 'relative',
    backgroundColor: '#EAF4FF',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
  },
  checkOuter: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#BCD0EA',
    justifyContent: 'center',
  },
  checkInner: {
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  title: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  message: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
    textAlign: 'center',
  },
  cameraIcon: {
    position: 'absolute',
  },
  homeButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  homeButtonText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
});
