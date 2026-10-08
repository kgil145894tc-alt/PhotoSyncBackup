import { Animated, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FloatingNavIndicator } from '@/components/floating-nav-indicator';

import { CLIENT_TAB_ITEMS, type TabIconName, type TabRoute } from '@/navigation/tab-navigation';
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
  onNavigate: (route: TabRoute) => void;
};

export function ClientFloatingNav({ currentIndex, height, bottomInset, leftInset = 0,
  rightInset = 0, hidden = false, containerStyle, onNavigate }: Props) {
  return (
    <Animated.View testID="client-floating-nav" pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      aria-hidden={hidden} style={[styles.floatingShell, {
      bottom: bottomInset + bottomNavMetrics.floatingGap,
      paddingLeft: Math.max(12, leftInset), paddingRight: Math.max(12, rightInset),
    }, containerStyle]}>
      <View style={[styles.floatingBar, { minHeight: height - bottomNavMetrics.floatingGap }]}>
        <FloatingNavIndicator currentIndex={currentIndex} count={CLIENT_TAB_ITEMS.length} />
        {CLIENT_TAB_ITEMS.map((item, index) => {
          const selected = index === currentIndex;
          const color = selected ? adminColors.blue : adminColors.muted;
          return (
            <Pressable key={item.route} accessibilityRole="tab"
              disabled={hidden}
              aria-selected={selected}
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected }}
              onPress={() => { if (!selected && !hidden) onNavigate(item.route); }}
              style={({ pressed }) => [styles.floatingButton,
                pressed && { opacity: 0.7 }]}>
              <ClientTabIcon name={item.icon} color={color} />
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

function ClientTabIcon({ name, color }: { name: TabIconName; color: string }) {
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {name === 'home' ? <Path d="M3 10L12 3L21 10V20H15V14H9V20H3V10Z" />
      : name === 'services' ? <><Path d="M3 7H7L9 4H15L17 7H21V20H3V7Z" />
        <Circle cx={12} cy={13} r={4} /></>
      : name === 'book' ? <><Rect x={3} y={5} width={18} height={16} rx={3} />
        <Path d="M7 3V7M17 3V7M3 10H21M8 14H9M15 14H16M8 17H9" /></>
      : name === 'about' ? <><Circle cx={12} cy={12} r={9} />
        <Path d="M12 11V17M12 7H12.01" /></>
      : <><Circle cx={12} cy={8} r={4} />
        <Path d="M4 21V19C4 15.7 7.6 14 12 14S20 15.7 20 19V21" /></>}
  </Svg>;
}
