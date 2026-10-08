import { StyleSheet } from 'react-native';

import { adminColors } from '@/styles/admin-theme';

export const serviceFormStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminColors.canvas },
  header: {
    alignItems: 'center', backgroundColor: adminColors.surface,
    borderBottomColor: adminColors.border, borderBottomWidth: 1,
    flexDirection: 'row', gap: 12, paddingBottom: 16,
  },
  backButton: {
    alignItems: 'center', backgroundColor: adminColors.blueSoft, borderRadius: 14,
    height: 44, justifyContent: 'center', width: 44,
  },
  headerTitle: {
    color: adminColors.ink, flex: 1, fontFamily: 'InterSemiBold', fontSize: 21,
    includeFontPadding: false, lineHeight: 29,
  },
  scrollContent: { gap: 16, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 },
  sectionCard: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 2,
  },
  field: { marginBottom: 18 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  compactField: { flexBasis: 112, flexGrow: 1, flexShrink: 1 },
  errorBox: {
    backgroundColor: adminColors.redSoft, borderColor: '#EDC6CC', borderRadius: 14,
    borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14,
  },
  errorText: {
    color: adminColors.red, fontFamily: 'InterMedium', fontSize: 14,
    includeFontPadding: false, lineHeight: 21,
  },
  dropdownField: { marginBottom: 18 },
  label: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 14,
    includeFontPadding: false, lineHeight: 21, marginBottom: 8,
  },
  required: { color: adminColors.red },
  input: {
    backgroundColor: adminColors.canvas, borderColor: adminColors.border, borderRadius: 12,
    borderWidth: 1, color: adminColors.ink, fontFamily: 'Inter', fontSize: 15,
    minHeight: 52, paddingVertical: 14, includeFontPadding: false, paddingHorizontal: 14,
  },
  textarea: { minHeight: 108, paddingTop: 14, textAlignVertical: 'top' },
  selectInput: {
    alignItems: 'center', backgroundColor: adminColors.canvas, borderColor: adminColors.border,
    borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10,
    minHeight: 52, paddingVertical: 14, justifyContent: 'space-between', paddingHorizontal: 14,
  },
  selectInputOpen: { borderColor: adminColors.blue, backgroundColor: adminColors.blueSoft },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  lockedInput: {
    alignItems: 'center', backgroundColor: adminColors.blueSoft, borderColor: adminColors.border,
    borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 52,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  inputText: {
    color: adminColors.ink, flex: 1, fontFamily: 'InterMedium', fontSize: 15,
    includeFontPadding: false, lineHeight: 22,
  },
  categoryList: { marginTop: 8 },
  categoryMenu: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 14, borderWidth: 1, maxHeight: 236, padding: 6,
  },
  categoryOption: {
    backgroundColor: adminColors.surface, borderRadius: 10, minHeight: 48,
    justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 12,
  },
  activeCategoryOption: { backgroundColor: adminColors.blueSoft },
  categoryText: {
    color: adminColors.ink, fontFamily: 'InterMedium', fontSize: 14,
    includeFontPadding: false, lineHeight: 21,
  },
  activeCategoryText: { color: adminColors.blue },
  photoRow: { marginBottom: 10 },
  photoBox: {
    alignItems: 'center', backgroundColor: adminColors.blueSoft, borderColor: '#B8CDEE',
    borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, minHeight: 176,
    justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 24, paddingVertical: 24,
  },
  photoBoxWithPreview: { aspectRatio: 4 / 3, borderStyle: 'solid', paddingHorizontal: 0, paddingVertical: 0 },
  photoPreview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  photoEditBadge: {
    alignItems: 'center', backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 14, borderWidth: 1, bottom: 12, height: 44,
    justifyContent: 'center', position: 'absolute', right: 12, width: 44,
  },
  photoText: {
    color: adminColors.muted, fontFamily: 'Inter', fontSize: 14,
    includeFontPadding: false, lineHeight: 21, marginTop: 12, textAlign: 'center',
  },
  browseText: { color: adminColors.blue, fontFamily: 'InterSemiBold' },
  hint: {
    color: adminColors.muted, fontFamily: 'Inter', fontSize: 12,
    includeFontPadding: false, lineHeight: 18, marginBottom: 18,
  },
  inclusionsHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 12 },
  inclusionsLabel: { flex: 1, marginBottom: 0 },
  iconButton: { alignItems: 'center', backgroundColor: adminColors.blue, borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  inclusionRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 12 },
  inclusionInput: {
    backgroundColor: adminColors.canvas, borderColor: adminColors.border, borderRadius: 12,
    borderWidth: 1, color: adminColors.ink, flex: 1, fontFamily: 'Inter', fontSize: 14,
    minHeight: 48, includeFontPadding: false, paddingHorizontal: 12, paddingVertical: 12,
  },
  removeInclusionButton: { alignItems: 'center', backgroundColor: adminColors.redSoft, borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  activeRow: {
    alignItems: 'center', borderTopColor: adminColors.border, borderTopWidth: 1,
    flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 16, marginBottom: 4,
  },
  activeSwitchTrack: {
    backgroundColor: '#CED8E6', borderRadius: 16, height: 30,
    justifyContent: 'center', paddingHorizontal: 3, width: 54,
  },
  activeSwitchTrackOn: { backgroundColor: adminColors.blue },
  activeSwitchThumb: { backgroundColor: adminColors.surface, borderRadius: 12, height: 24, width: 24 },
  activeSwitchThumbOn: { alignSelf: 'flex-end' },
  activeText: { color: adminColors.ink, flex: 1, fontFamily: 'InterMedium', fontSize: 14, includeFontPadding: false, lineHeight: 21 },
  footer: {
    backgroundColor: adminColors.surface, borderTopColor: adminColors.border,
    borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cancelButton: {
    alignItems: 'center', backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 14, borderWidth: 1, flexBasis: 100, flexGrow: 1,
    justifyContent: 'center', minHeight: 52, paddingHorizontal: 14, paddingVertical: 14,
  },
  cancelText: { color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 15, includeFontPadding: false, lineHeight: 22, textAlign: 'center' },
  saveButton: {
    alignItems: 'center', backgroundColor: adminColors.blue, borderRadius: 14,
    flexBasis: 144, flexGrow: 1, flexDirection: 'row', gap: 8,
    justifyContent: 'center', minHeight: 52, paddingHorizontal: 14, paddingVertical: 14,
  },
  saveText: { color: adminColors.surface, flexShrink: 1, fontFamily: 'InterSemiBold', fontSize: 15, includeFontPadding: false, lineHeight: 22, textAlign: 'center' },
  pressed: { opacity: 0.72 },
  confirmOverlay: { alignItems: 'center', backgroundColor: 'rgba(23, 47, 80, 0.44)', flex: 1, justifyContent: 'center', padding: 20 },
  confirmCard: { backgroundColor: adminColors.surface, borderColor: adminColors.border, borderWidth: 1, borderRadius: 22, maxWidth: 420, padding: 22, width: '100%' },
  confirmTitle: { color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 21, includeFontPadding: false, lineHeight: 29, marginBottom: 10 },
  confirmMessage: { color: adminColors.muted, fontFamily: 'Inter', fontSize: 14, includeFontPadding: false, lineHeight: 21 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 },
  confirmCancelButton: { alignItems: 'center', backgroundColor: adminColors.canvas, borderRadius: 12, flexBasis: 100, flexGrow: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
  confirmCancelText: { color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 14, includeFontPadding: false, lineHeight: 21, textAlign: 'center' },
  confirmDeleteButton: { alignItems: 'center', backgroundColor: adminColors.red, borderRadius: 12, flexBasis: 100, flexGrow: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
  confirmDeleteText: { color: adminColors.surface, fontFamily: 'InterSemiBold', fontSize: 14, includeFontPadding: false, lineHeight: 21, textAlign: 'center' },
});
