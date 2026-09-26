import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  getTabItems,
  getTabRouteIndex,
  setStackSlideAnimation,
  TabIconName,
} from '@/navigation/tab-navigation';
import { bottomNavMetrics, bottomNavStyles as styles, navColors } from '@/styles/navigation.styles';

export function BottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const currentIndex = getTabRouteIndex(pathname);
  const tabItems = getTabItems(pathname);

  return (
    <View
      style={[
        styles.navBar,
        {
          height: bottomNavMetrics.height + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}>
      <View style={styles.iconRow}>
        {tabItems.map((item, targetIndex) => {
          const isActive = currentIndex === targetIndex;

          return (
            <Pressable
              accessibilityLabel={item.accessibilityLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              hitSlop={12}
              key={item.route}
              onPress={() => {
                if (!isActive) {
                  setStackSlideAnimation(
                    targetIndex < currentIndex ? 'slide_from_left' : 'slide_from_right',
                  );
                  router.push(item.route as never);
                }
              }}
              style={styles.navButton}>
              <NavIcon name={item.icon} color={isActive ? navColors.active : navColors.inactive} />
              <Text style={[styles.navLabel, { color: isActive ? navColors.active : navColors.inactive }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NavIcon({ color, name }: { color: string; name: TabIconName }) {
  switch (name) {
    case 'home':
      return (
        <Svg width={35} height={32} viewBox="0 0 35 32" fill="none">
          <Path
            d="M34.2756 15.3007L18.3732 0.340713C18.2587 0.232708 18.1227 0.147021 17.973 0.088557C17.8233 0.0300931 17.6628 0 17.5007 0C17.3386 0 17.1781 0.0300931 17.0284 0.088557C16.8787 0.147021 16.7427 0.232708 16.6282 0.340713L0.725819 15.3007C0.26253 15.7368 0 16.3293 0 16.9471C0 18.2301 1.10803 19.2733 2.47087 19.2733H4.14643V29.948C4.14643 30.5914 4.69852 31.1111 5.38187 31.1111H15.0299V22.9696H19.3539V31.1111H29.6196C30.3029 31.1111 30.855 30.5914 30.855 29.948V19.2733H32.5306C33.1869 19.2733 33.8162 19.0297 34.2795 18.59C35.2408 17.6813 35.2408 16.2093 34.2756 15.3007Z"
            fill={color}
          />
        </Svg>
      );
    case 'services':
      return (
        <Svg width={34} height={29} viewBox="0 0 34 29" fill="none">
          <Path
            d="M30.8519 4.46154H25.5L24.225 0.844506C24.1369 0.597002 23.9755 0.383062 23.7628 0.231911C23.5501 0.0807594 23.2965 -0.000232087 23.0366 4.99544e-07H10.9634C10.4322 4.99544e-07 9.95602 0.338599 9.77893 0.844506L8.5 4.46154H3.14815C1.4088 4.46154 0 5.88764 0 7.64835V25.8132C0 27.5739 1.4088 29 3.14815 29H30.8519C32.5912 29 34 27.5739 34 25.8132V7.64835C34 5.88764 32.5912 4.46154 30.8519 4.46154ZM17 22.6264C13.5213 22.6264 10.7037 19.7742 10.7037 16.2527C10.7037 12.7313 13.5213 9.87912 17 9.87912C20.4787 9.87912 23.2963 12.7313 23.2963 16.2527C23.2963 19.7742 20.4787 22.6264 17 22.6264ZM13.2222 16.2527C13.2222 17.267 13.6202 18.2397 14.3287 18.9568C15.0372 19.674 15.9981 20.0769 17 20.0769C18.0019 20.0769 18.9628 19.674 19.6713 18.9568C20.3798 18.2397 20.7778 17.267 20.7778 16.2527C20.7778 15.2385 20.3798 14.2658 19.6713 13.5486C18.9628 12.8315 18.0019 12.4286 17 12.4286C15.9981 12.4286 15.0372 12.8315 14.3287 13.5486C13.6202 14.2658 13.2222 15.2385 13.2222 16.2527Z"
            fill={color}
          />
        </Svg>
      );
    case 'book':
      return (
        <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
          <Path
            d="M0 27.84C0 28.4816 0.518375 29 1.16 29H27.84C28.4816 29 29 28.4816 29 27.84V12.615H0V27.84ZM27.84 2.61H21.75V0.29C21.75 0.1305 21.6195 0 21.46 0H19.43C19.2705 0 19.14 0.1305 19.14 0.29V2.61H9.86V0.29C9.86 0.1305 9.7295 0 9.57 0H7.54C7.3805 0 7.25 0.1305 7.25 0.29V2.61H1.16C0.518375 2.61 0 3.12837 0 3.77V10.15H29V3.77C29 3.12837 28.4816 2.61 27.84 2.61Z"
            fill={color}
          />
        </Svg>
      );
    case 'about':
      return (
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          <Path
            clipRule="evenodd"
            d="M16 0C24.8366 0 32 7.16339 32 16C32 24.8365 24.8366 32 16 32C7.16347 32 0 24.8365 0 16C0 7.16339 7.16347 0 16 0ZM17.6035 14.4H14.4035V24H17.6035V14.4ZM16.0162 7.59997C14.8497 7.59997 14.0035 8.44147 14.0035 9.57779C14.0035 10.7601 14.8274 11.6 16.0162 11.6C17.1589 11.6 18.0035 10.76 18.0035 9.59999C18.0035 8.44154 17.1589 7.59997 16.0162 7.59997Z"
            fill={color}
            fillRule="evenodd"
          />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={30} height={31} viewBox="0 0 30 31" fill="none">
          <Path
            d="M15 15.5C19.1421 15.5 22.5 12.1421 22.5 8C22.5 3.85786 19.1421 0.5 15 0.5C10.8579 0.5 7.5 3.85786 7.5 8C7.5 12.1421 10.8579 15.5 15 15.5ZM15 18C7.25 18 1 22.25 1 27.5C1 29.1569 2.34315 30.5 4 30.5H26C27.6569 30.5 29 29.1569 29 27.5C29 22.25 22.75 18 15 18Z"
            fill={color}
          />
        </Svg>
      );
    case 'dashboard':
      return (
        <Svg width={34} height={34} viewBox="0 0 34 34" fill="none">
          <Path d="M3 4.5C3 3.7 3.7 3 4.5 3H14.5C15.3 3 16 3.7 16 4.5V14.5C16 15.3 15.3 16 14.5 16H4.5C3.7 16 3 15.3 3 14.5V4.5ZM18 4.5C18 3.7 18.7 3 19.5 3H29.5C30.3 3 31 3.7 31 4.5V10.5C31 11.3 30.3 12 29.5 12H19.5C18.7 12 18 11.3 18 10.5V4.5ZM18 15.5C18 14.7 18.7 14 19.5 14H29.5C30.3 14 31 14.7 31 15.5V29.5C31 30.3 30.3 31 29.5 31H19.5C18.7 31 18 30.3 18 29.5V15.5ZM3 19.5C3 18.7 3.7 18 4.5 18H14.5C15.3 18 16 18.7 16 19.5V29.5C16 30.3 15.3 31 14.5 31H4.5C3.7 31 3 30.3 3 29.5V19.5Z" fill={color} />
        </Svg>
      );
    case 'requests':
      return (
        <Svg width={33} height={33} viewBox="0 0 33 33" fill="none">
          <Path d="M8 3H21L28 10V29C28 29.8 27.3 30.5 26.5 30.5H8C7.2 30.5 6.5 29.8 6.5 29V4.5C6.5 3.7 7.2 3 8 3ZM20 4.5V10.5H26L20 4.5ZM11 15H23V17.5H11V15ZM11 20H23V22.5H11V20ZM11 25H18V27.5H11V25Z" fill={color} />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          <Path d="M7 2C7.8 2 8.5 2.7 8.5 3.5V5H23.5V3.5C23.5 2.7 24.2 2 25 2C25.8 2 26.5 2.7 26.5 3.5V5H28C29.7 5 31 6.3 31 8V27C31 28.7 29.7 30 28 30H4C2.3 30 1 28.7 1 27V8C1 6.3 2.3 5 4 5H5.5V3.5C5.5 2.7 6.2 2 7 2ZM4 13V27H28V13H4ZM7 16H11V20H7V16ZM14 16H18V20H14V16ZM21 16H25V20H21V16ZM7 22H11V26H7V22ZM14 22H18V26H14V22Z" fill={color} />
        </Svg>
      );
    case 'clients':
      return (
        <Svg width={38} height={31} viewBox="0 0 38 31" fill="none">
          <Path d="M14 15.5C18.1 15.5 21.5 12.1 21.5 8C21.5 3.9 18.1 0.5 14 0.5C9.9 0.5 6.5 3.9 6.5 8C6.5 12.1 9.9 15.5 14 15.5ZM14 18C6.2 18 0 22.1 0 27.2C0 29 1.5 30.5 3.3 30.5H24.7C26.5 30.5 28 29 28 27.2C28 22.1 21.8 18 14 18ZM28.5 15.5C31.6 15.5 34 13.1 34 10C34 6.9 31.6 4.5 28.5 4.5C27.5 4.5 26.5 4.8 25.7 5.3C26.2 6.8 26.2 8.5 25.8 10C25.4 11.6 24.6 13 23.5 14.1C24.6 15 26.5 15.5 28.5 15.5ZM29.4 18C28.3 18 27.2 18.1 26.2 18.4C28.7 20.5 30.5 23.5 30.5 27.2C30.5 28.3 30.2 29.5 29.6 30.5H34.8C36.6 30.5 38 29.1 38 27.3C38 22.2 34.2 18 29.4 18Z" fill={color} />
        </Svg>
      );
    case 'notifications':
      return (
        <Svg width={31} height={33} viewBox="0 0 31 33" fill="none">
          <Path d="M15.5 33C17.6 33 19.4 31.5 19.8 29.5H11.2C11.6 31.5 13.4 33 15.5 33ZM26 22.5V14C26 8.8 22.8 4.5 18 3.2V1.5C18 0.7 17.3 0 16.5 0H14.5C13.7 0 13 0.7 13 1.5V3.2C8.2 4.5 5 8.8 5 14V22.5L1.4 26.1C0.5 27 1.1 28.5 2.4 28.5H28.6C29.9 28.5 30.5 27 29.6 26.1L26 22.5Z" fill={color} />
        </Svg>
      );
  }
}
