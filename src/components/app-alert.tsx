import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type AppAlertOptions = {
  message?: string;
  title: string;
};

type AlertListener = (alert: AppAlertOptions) => void;

const AppAlertContext = createContext<(title: string, message?: string) => void>(() => undefined);
let alertListener: AlertListener | null = null;

export function showAppAlert(title: string, message?: string) {
  alertListener?.({ message, title });
}

export function useAppAlert() {
  return useContext(AppAlertContext);
}

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AppAlertOptions | null>(null);
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(314, width - 48);

  useEffect(() => {
    alertListener = setAlert;

    return () => {
      if (alertListener === setAlert) {
        alertListener = null;
      }
    };
  }, []);

  const contextValue = useMemo(
    () => (title: string, message?: string) => {
      setAlert({ message, title });
    },
    [],
  );

  function closeAlert() {
    setAlert(null);
  }

  return (
    <AppAlertContext.Provider value={contextValue}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={closeAlert}
        statusBarTranslucent
        transparent
        visible={alert !== null}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { width: cardWidth }]}>
            <Pressable
              accessibilityLabel="Close message"
              accessibilityRole="button"
              hitSlop={12}
              onPress={closeAlert}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <CloseIcon />
            </Pressable>

            <View style={styles.iconCircle}>
              <InfoIcon />
            </View>

            <Text style={styles.title}>{alert?.title}</Text>
            {alert?.message ? <Text style={styles.message}>{alert.message}</Text> : null}

            <Pressable
              accessibilityLabel="OK"
              accessibilityRole="button"
              onPress={closeAlert}
              style={({ pressed }) => [styles.okButton, pressed && styles.pressed]}>
              <Text style={styles.okText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

function CloseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke="#142C4C" strokeLinecap="round" strokeWidth={3} />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52" fill="none">
      <Path d="M26 14V29" stroke="#142C4C" strokeLinecap="round" strokeWidth={4} />
      <Path d="M26 37H26.1" stroke="#142C4C" strokeLinecap="round" strokeWidth={5} />
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
    paddingBottom: 34,
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
    marginTop: 30,
    textAlign: 'center',
  },
  message: {
    color: '#395276',
    fontFamily: 'Inter',
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },
  okButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#142C4C',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    marginTop: 24,
  },
  okText: {
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
