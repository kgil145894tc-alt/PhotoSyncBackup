import { StyleSheet } from 'react-native';

export const authRouteStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#021526',
  },
  logo: {
    position: 'absolute',
  },
  wordmark: {
    position: 'absolute',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontFamily: 'JosefinSlabBold',
    includeFontPadding: false,
  },
  dot: {
    backgroundColor: '#FFFFFF',
  },
  panel: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: '#FFFFFF',
    borderWidth: 1,
  },
  panelIcon: {
    position: 'absolute',
  },
  label: {
    position: 'absolute',
    color: '#FFFFFF',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  input: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    borderWidth: 1,
    boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
    color: '#142C4C',
    fontFamily: 'Inter',
    elevation: 4,
  },
  actionButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#FFFFFF',
    borderWidth: 1,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    fontWeight: '500',
    includeFontPadding: false,
  },
  footerButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  authMessageText: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 8,
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
    opacity: 0.95,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
});
