import { useWindowDimensions } from 'react-native';
import { bottomNavMetrics } from '@/styles/navigation.styles';

export function useBottomNavHeight(variant: 'client' | 'admin' = 'client') {
  const { fontScale, width } = useWindowDimensions();
  // Both roles have five floating tabs. Reserve the gap and wrapped labels,
  // including when the bar stops growing on a tablet.
  const labelWidth = Math.max(28, (Math.min(width, 584) - 36) / 5 - 4);
  const longestLabelWidth = variant === 'admin' ? 50 : 45;
  const labelLines = Math.max(1, Math.ceil(longestLabelWidth * fontScale / labelWidth));
  return Math.max(bottomNavMetrics.height, 56 + 14 * fontScale * labelLines)
    + bottomNavMetrics.floatingGap;
}
