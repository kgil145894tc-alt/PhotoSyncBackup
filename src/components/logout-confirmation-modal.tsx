import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type LogoutConfirmationModalProps = {
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
};

export function LogoutConfirmationModal({
  isLoading = false,
  onCancel,
  onConfirm,
  visible,
}: LogoutConfirmationModalProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(314, width - 48);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: cardWidth }]}>
          <Pressable
            accessibilityLabel="Close logout confirmation"
            accessibilityRole="button"
            disabled={isLoading}
            hitSlop={12}
            onPress={onCancel}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <CloseIcon />
          </Pressable>

          <View style={styles.iconCircle}>
            <LogoutSymbol />
          </View>

          <Text style={styles.title}>Are you sure you want to log out?</Text>

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityLabel="Cancel logout"
              accessibilityRole="button"
              disabled={isLoading}
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Confirm logout"
              accessibilityRole="button"
              disabled={isLoading}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.logoutButton,
                (pressed || isLoading) && styles.pressed,
              ]}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CloseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke="#142C4C" strokeLinecap="round" strokeWidth={3} />
    </Svg>
  );
}

function LogoutSymbol() {
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
      <Path
        d="M22 14H14C12.9 14 12 14.9 12 16V36C12 37.1 12.9 38 14 38H22"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={4}
      />
      <Path
        d="M31 18L39 26L31 34M39 26H22"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={4}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    minHeight: 307,
    overflow: 'hidden',
    paddingBottom: 50,
    paddingHorizontal: 20,
    paddingTop: 35,
  },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 36,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#AEB8C7',
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  title: {
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 28,
    marginTop: 35,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 18,
    width: '100%',
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#DCE4F3',
    borderRadius: 14,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#142C4C',
    borderRadius: 14,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  cancelText: {
    color: '#142C4C',
    fontFamily: 'Inter',
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 24,
  },
  logoutText: {
    color: '#ffffff',
    fontFamily: 'InterBold',
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.78,
  },
});
