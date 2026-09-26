import { StyleSheet } from 'react-native';

export const bookingInformationStyles = StyleSheet.create({
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
  backgroundImage: {
    position: 'absolute',
    top: 0,
    opacity: 0.6,
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
  stepLine: {
    position: 'absolute',
  },
  stepCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  heading: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  helperText: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  sectionTitle: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  sectionHint: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  fieldLabelRow: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
  },
  fieldLabel: {
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  requiredMark: {
    color: '#ED2314',
  },
  input: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.5)',
    borderWidth: 1,
    color: '#142C4C',
    fontFamily: 'Inter',
    includeFontPadding: false,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  notesInput: {
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  studioLocationButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#EAF2FA',
    borderColor: 'rgba(76, 94, 118, 0.22)',
    borderWidth: 1,
    justifyContent: 'center',
  },
  studioLocationText: {
    color: '#142C4C',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    textAlign: 'center',
  },
  nextButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  nextText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
});
