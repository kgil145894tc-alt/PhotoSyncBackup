import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
import type { ClientNavScrollProps } from '@/hooks/use-client-nav-scroll';

export function MobilePage({
  children,
  title,
  back = true,
  footerInset = 0,
  onBack,
  refreshControl,
  scrollable = true,
  navScroll,
}: {
  children: ReactNode;
  title: string;
  back?: boolean;
  footerInset?: number;
  onBack?: () => void;
  refreshControl?: ScrollViewProps['refreshControl'];
  scrollable?: boolean;
  navScroll?: ClientNavScrollProps;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={Platform.OS !== 'web'}
    >
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        <View
          style={[styles.heroContent, styles.brandRow, { paddingVertical: 16 }]}
        >
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack ?? (() => router.back())}
              style={styles.iconButton}
            >
              <Text style={[styles.heroText, { fontSize: 28 }]}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={styles.brand}>{title}</Text>
          {back ? <View style={{ width: 44 }} /> : null}
        </View>
      </View>
      {scrollable ? <KeyboardFormScrollView
        {...navScroll}
        refreshControl={refreshControl}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + footerInset + 24 },
        ]}
      >
        {children}
      </KeyboardFormScrollView> : <View style={styles.scroll}>{children}</View>}
    </KeyboardAvoidingView>
  );
}

export function FlowSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View
      accessibilityLabel={`Booking step ${step} of 3`}
      style={[styles.wrapRow, { justifyContent: 'center' }]}
    >
      {['Schedule', 'Information', 'Review'].map((label, index) => (
        <View
          key={label}
          style={[styles.chip, index + 1 <= step && styles.selectedChip]}
        >
          <Text style={styles.badgeText}>
            {index + 1}. {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
