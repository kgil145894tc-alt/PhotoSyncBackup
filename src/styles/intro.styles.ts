import { StyleSheet } from 'react-native';
import { authColors as colors } from '@/styles/auth-theme';

export const introStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9, 27, 48, 0.35)' },
  scroll: { flexGrow: 1 },
  hero: { flex: 1, minHeight: 350, width: '100%', maxWidth: 520, alignSelf: 'center',
    paddingHorizontal: 28, paddingBottom: 40, justifyContent: 'center' },
  actions: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24 },
  panel: { backgroundColor: colors.surface, borderRadius: 26, padding: 20, gap: 12,
    borderWidth: 1, borderColor: colors.border, boxShadow: '0px 12px 32px rgba(3, 14, 26, 0.24)' },
  button: { minHeight: 54, paddingVertical: 15, paddingHorizontal: 20, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  secondaryButton: { backgroundColor: colors.field, borderWidth: 1, borderColor: colors.controlBorder },
  buttonText: { color: colors.actionInk, fontFamily: 'InterSemiBold', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  secondaryText: { color: colors.ink },
});
