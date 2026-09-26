import { StyleSheet } from 'react-native';

export const navColors = {
  active: '#142C4C',
  background: '#395276',
  inactive: '#8AA3C3',
} as const;

export const bottomNavMetrics = {
  height: 73,
} as const;

export const bottomNavStyles = StyleSheet.create({
  appShell: {
    flex: 1,
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
    paddingHorizontal: 30,
  },
  navButton: {
    alignItems: 'center',
    height: 58,
    justifyContent: 'center',
    minWidth: 54,
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
