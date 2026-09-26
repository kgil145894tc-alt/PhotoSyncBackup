import { StyleSheet } from 'react-native';

export const bookingReviewStyles = StyleSheet.create({
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
    backgroundColor: '#142C4C',
  },
  stepCircle: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  stepText: {
    color: '#ffffff',
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
  packageCard: {
    position: 'absolute',
    backgroundColor: '#142C4C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  packageImage: {
    position: 'absolute',
    borderColor: '#ffffff',
    borderWidth: 0.5,
  },
  packageTitle: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  packagePrice: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  editButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.3)',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  detailsHeader: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.3)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
  },
  separator: {
    position: 'absolute',
    backgroundColor: 'rgba(76, 94, 118, 0.24)',
  },
  row: {
    position: 'absolute',
    alignItems: 'center',
    flexDirection: 'row',
  },
  rowLabel: {
    color: '#4C5E76',
    fontFamily: 'InterBold',
    includeFontPadding: false,
  },
  rowValue: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  notesValue: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  confirmButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    justifyContent: 'center',
  },
  confirmText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
});
