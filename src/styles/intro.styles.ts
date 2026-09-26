import { StyleSheet } from 'react-native';

export const introStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#021526',
  },
  logo: {
    position: 'absolute',
  },
  wordmark: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomhuria',
    includeFontPadding: false,
  },
  wordmarkAccent: {
    color: '#70A2E3',
  },
  tagline: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taglineText: {
    color: '#ffffff',
    fontFamily: 'JosefinSlabBold',
    includeFontPadding: false,
  },
  dot: {
    backgroundColor: '#ffffff',
  },
  continueText: {
    position: 'absolute',
    left: 0,
    color: '#ffffff',
    fontFamily: 'JosefinSlab',
    includeFontPadding: false,
    textAlign: 'center',
  },
  authPrompt: {
    position: 'absolute',
    left: 0,
    color: '#ffffff',
    fontFamily: 'JosefinSlabBold',
    includeFontPadding: false,
    paddingHorizontal: 34,
    textAlign: 'center',
  },
  authActions: {
    position: 'absolute',
  },
  authButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#ffffff',
    borderWidth: 1,
    justifyContent: 'center',
  },
  authButtonText: {
    color: '#ffffff',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
});
