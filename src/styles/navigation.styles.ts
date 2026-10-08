import { StyleSheet } from 'react-native';
import { adminColors } from '@/styles/admin-theme';

export const navColors = {
  active: '#142C4C',
  background: '#395276',
  inactive: '#8AA3C3',
} as const;

export const bottomNavMetrics = {
  height: 73,
  floatingGap: 12,
} as const;

export const bottomNavStyles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  floatingShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  floatingBar: {
    backgroundColor: adminColors.surface,
    borderColor: adminColors.border,
    borderWidth: 1,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 6,
    width: '100%',
    maxWidth: 560,
    shadowColor: '#172F50',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 9,
  },
  floatingButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingHorizontal: 2,
    paddingVertical: 7,
    borderRadius: 20,
  },
  floatingButtonSelected: { backgroundColor: adminColors.blueSoft },
  floatingIndicatorTrack: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 6,
    bottom: 6,
  },
  floatingIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 20,
    backgroundColor: adminColors.blueSoft,
  },
  floatingLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: '100%',
  },
  floatingIcon: { position: 'relative' },
  floatingBadge: {
    position: 'absolute',
    right: -10,
    top: -5,
    backgroundColor: adminColors.red,
    borderColor: adminColors.surface,
    borderWidth: 2,
    borderRadius: 12,
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBadgeText: {
    color: adminColors.surface,
    fontFamily: 'InterBold',
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  navBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: navColors.background,
    justifyContent: 'center',
  },
  iconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  navButton: {
    alignItems: 'center',
    minHeight: 58,
    flex: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  navLabel: {
    fontFamily: 'Inter',
    fontSize: 9,
    includeFontPadding: false,
    lineHeight: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

export const navScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3EEEE',
    justifyContent: 'center',
    paddingBottom: bottomNavMetrics.height,
  },
  title: {
    color: navColors.active,
    fontFamily: 'JosefinSlabBold',
    fontSize: 32,
  },
});
