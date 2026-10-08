import { Animated, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FloatingNavIndicator } from '@/components/floating-nav-indicator';

import { PHOTOGRAPHER_TAB_ITEMS, type TabIconName, type TabRoute } from '@/navigation/tab-navigation';
import { adminColors } from '@/styles/admin-theme';
import { bottomNavMetrics, bottomNavStyles as styles } from '@/styles/navigation.styles';

type Props = {
  currentIndex: number;
  height: number;
  bottomInset: number;
  leftInset?: number;
  rightInset?: number;
  hidden?: boolean;
  containerStyle?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  pendingCount: number | null;
  onNavigate: (route: TabRoute) => void;
};

export function AdminFloatingNav({ currentIndex, height, bottomInset, leftInset = 0,
  rightInset = 0, hidden = false, containerStyle, pendingCount, onNavigate }: Props) {
  return (
    <Animated.View testID="admin-floating-nav" pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      aria-hidden={hidden} style={[styles.floatingShell, {
      bottom: bottomInset + bottomNavMetrics.floatingGap,
      paddingLeft: Math.max(12, leftInset), paddingRight: Math.max(12, rightInset),
    }, containerStyle]}>
      <View style={[styles.floatingBar, { minHeight: height - bottomNavMetrics.floatingGap }]}>
        <FloatingNavIndicator currentIndex={currentIndex} count={PHOTOGRAPHER_TAB_ITEMS.length} />
        {PHOTOGRAPHER_TAB_ITEMS.map((item, index) => {
          const selected = index === currentIndex;
          const color = selected ? adminColors.blue : adminColors.muted;
          const badge = item.icon === 'requests' && pendingCount !== null && pendingCount > 0;
          return (
            <Pressable key={item.route} accessibilityRole="tab"
              disabled={hidden}
              aria-selected={selected}
              accessibilityLabel={badge ? `${item.accessibilityLabel}, ${pendingCount} pending` : item.accessibilityLabel}
              accessibilityState={{ selected }}
              onPress={() => { if (!selected && !hidden) onNavigate(item.route); }}
              style={({ pressed }) => [styles.floatingButton,
                pressed && { opacity: 0.7 }]}>
              <View style={styles.floatingIcon}>
                <AdminTabIcon name={item.icon} color={color} />
                {badge ? <View style={styles.floatingBadge}>
                  <Text style={styles.floatingBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                </View> : null}
              </View>
              <Text style={[styles.floatingLabel, { color }]}>
                {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

function AdminTabIcon({ name, color }: { name: TabIconName; color: string }) {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {name === 'home' ? <Path d="M3 10L12 3L21 10V20H15V14H9V20H3V10Z" />
      : name === 'requests' ? <><Rect x={5} y={4} width={14} height={17} rx={3} />
        <Path d="M9 3H15V6H9V3ZM9 11H15M9 15H13" /></>
      : name === 'calendar' ? <><Rect x={3} y={5} width={18} height={16} rx={3} />
        <Path d="M7 3V7M17 3V7M3 10H21M8 14H9M15 14H16M8 17H9" /></>
      : name === 'services' ? <><Rect x={3} y={6} width={18} height={15} rx={3} />
        <Path d="M8 6V3H16V6M3 12H21M10 12V15H14V12" /></>
      : <><Circle cx={12} cy={8} r={4} /><Path d="M4 21V19C4 15.7 7.6 14 12 14S20 15.7 20 19V21" /></>}
  </Svg>;
}
