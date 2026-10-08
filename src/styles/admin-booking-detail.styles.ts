import { StyleSheet } from 'react-native';

import { adminColors } from '@/styles/admin-theme';

// Kept local to booking details so catalog and calendar surfaces retain their own layout.
export const adminBookingDetailStyles = StyleSheet.create({
  adminBookingDetailScroller: {
    backgroundColor: adminColors.canvas, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, flex: 1, overflow: 'hidden',
  },
  adminBookingDetailPanel: {
    backgroundColor: adminColors.canvas, flexGrow: 1,
    paddingHorizontal: 18, paddingTop: 22,
  },
  adminBookingDetailLoading: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 16, borderWidth: 1, color: adminColors.muted,
    fontFamily: 'Inter', fontSize: 14, lineHeight: 22,
    marginBottom: 14, padding: 16, includeFontPadding: false,
  },
  adminBookingDetailStatusPill: {
    alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12,
    flexDirection: 'row', gap: 8, minHeight: 36,
    paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%',
  },
  adminBookingDetailPendingPill: { backgroundColor: adminColors.amberSoft },
  adminBookingDetailConfirmedPill: { backgroundColor: adminColors.greenSoft },
  adminBookingDetailRejectedPill: { backgroundColor: adminColors.redSoft },
  adminBookingDetailStatusText: {
    flexShrink: 1, fontFamily: 'InterSemiBold', fontSize: 12,
    includeFontPadding: false, lineHeight: 18,
  },
  adminBookingDetailPendingText: { color: adminColors.amber },
  adminBookingDetailConfirmedText: { color: adminColors.green },
  adminBookingDetailRejectedText: { color: adminColors.red },
  adminBookingDetailClientBlock: {
    alignItems: 'flex-start', backgroundColor: adminColors.surface,
    borderColor: adminColors.border, borderRadius: 20, borderWidth: 1,
    flexDirection: 'row', gap: 14, marginTop: 16, padding: 16,
  },
  clientBlockStacked: { flexDirection: 'column' },
  adminBookingDetailAvatar: {
    backgroundColor: adminColors.blueSoft, borderRadius: 18,
    height: 64, width: 64,
  },
  adminBookingDetailClientCopy: { flex: 1, minWidth: 0, gap: 8 },
  adminBookingDetailClientName: {
    color: adminColors.ink, fontFamily: 'InterBold', fontSize: 20,
    includeFontPadding: false, lineHeight: 28,
  },
  adminBookingDetailContactRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  adminBookingDetailContactText: {
    color: adminColors.muted, flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: 13,
    includeFontPadding: false, lineHeight: 21,
  },
  adminBookingDetailSectionTitle: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 15,
    includeFontPadding: false, lineHeight: 23, marginTop: 24, marginBottom: 10,
  },
  adminBookingDetailServiceCard: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14,
  },
  serviceCardStacked: { flexDirection: 'column' },
  adminBookingDetailServiceImage: {
    backgroundColor: adminColors.canvas, borderRadius: 14, height: 122, width: 94,
  },
  serviceImageStacked: { height: 156, width: '100%' },
  adminBookingDetailServiceCopy: { flex: 1, minWidth: 0 },
  adminBookingDetailServiceTitle: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 16,
    includeFontPadding: false, lineHeight: 24,
  },
  adminBookingDetailServicePrice: {
    color: adminColors.blue, fontFamily: 'InterBold', fontSize: 20,
    includeFontPadding: false, lineHeight: 28, marginTop: 6, marginBottom: 6,
  },
  adminBookingDetailInclusionRow: {
    alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 6,
  },
  adminBookingDetailInclusionText: {
    color: adminColors.muted, flex: 1, fontFamily: 'Inter', fontSize: 13,
    includeFontPadding: false, lineHeight: 20,
  },
  adminBookingDetailDateTimeRow: { flexDirection: 'row', gap: 10 },
  detailRowStacked: { flexDirection: 'column' },
  stackedItem: { flex: 0, flexBasis: 'auto', flexShrink: 0, width: '100%' },
  adminBookingDetailDateTimeCard: {
    alignItems: 'center', backgroundColor: adminColors.surface,
    borderColor: adminColors.border, borderRadius: 16, borderWidth: 1,
    flex: 1, flexDirection: 'row', gap: 10, minHeight: 78, padding: 14,
  },
  adminBookingDetailDateTimeCopy: { flex: 1, minWidth: 0 },
  adminBookingDetailDateTimePrimary: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 14,
    includeFontPadding: false, lineHeight: 22,
  },
  adminBookingDetailDateTimeSecondary: {
    color: adminColors.muted, fontFamily: 'Inter', fontSize: 12,
    includeFontPadding: false, lineHeight: 19, marginTop: 3,
  },
  adminBookingDetailNotesBox: {
    alignItems: 'flex-start', backgroundColor: adminColors.blueSoft,
    borderRadius: 16, flexDirection: 'row', gap: 12, padding: 16,
  },
  adminBookingDetailNotesText: {
    color: adminColors.ink, flex: 1, fontFamily: 'Inter', fontSize: 14,
    includeFontPadding: false, lineHeight: 23,
  },
  adminBookingDetailMetaPanel: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 16, borderWidth: 1, gap: 14, marginTop: 12, padding: 16,
  },
  adminBookingDetailMetaRow: { gap: 5 },
  adminBookingDetailMetaLabel: {
    color: adminColors.muted, fontFamily: 'InterMedium', fontSize: 12,
    includeFontPadding: false, lineHeight: 18,
  },
  adminBookingDetailMetaValue: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 14,
    includeFontPadding: false, lineHeight: 22,
  },
  adminBookingDetailActionRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  adminBookingDetailRejectButton: {
    alignItems: 'center', backgroundColor: adminColors.surface,
    borderColor: '#ECCCD0', borderRadius: 14, borderWidth: 1,
    flex: 1, flexDirection: 'row', gap: 8, minHeight: 52,
    paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center',
  },
  adminBookingDetailRejectText: {
    color: adminColors.red, flexShrink: 1, fontFamily: 'InterSemiBold', fontSize: 14,
    includeFontPadding: false, lineHeight: 22, textAlign: 'center',
  },
  adminBookingDetailConfirmButton: {
    alignItems: 'center', backgroundColor: adminColors.blue, borderRadius: 14,
    flex: 1, flexDirection: 'row', gap: 8, minHeight: 52,
    paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center',
  },
  adminBookingDetailConfirmText: {
    color: adminColors.surface, flexShrink: 1, fontFamily: 'InterSemiBold', fontSize: 14,
    includeFontPadding: false, lineHeight: 22, textAlign: 'center',
  },
  resolvedRequestPanel: {
    backgroundColor: adminColors.surface, borderColor: adminColors.border,
    borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16,
  },
  resolvedRequestTitle: {
    color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 15,
    includeFontPadding: false, lineHeight: 23,
  },
  resolvedRequestText: {
    color: adminColors.muted, fontFamily: 'Inter', fontSize: 13,
    includeFontPadding: false, lineHeight: 21, marginTop: 6,
  },
  rejectionReasonBox: { backgroundColor: adminColors.redSoft, borderRadius: 12, marginTop: 14, padding: 12 },
  rejectionReasonLabel: { color: adminColors.red, fontFamily: 'InterSemiBold', fontSize: 12, lineHeight: 18, includeFontPadding: false },
  rejectionReasonText: { color: adminColors.ink, fontFamily: 'Inter', fontSize: 13, lineHeight: 21, marginTop: 5, includeFontPadding: false },
  modalKeyboardAvoider: { flex: 1 },
  bookingDecisionModalOverlay: {
    alignItems: 'center', backgroundColor: 'rgba(12, 25, 44, 0.48)', flex: 1,
    justifyContent: 'center', paddingHorizontal: 16,
  },
  modalScroll: { flexGrow: 0, maxHeight: '100%', maxWidth: 440, width: '100%' },
  modalScrollContent: { flexGrow: 1 },
  bookingDecisionModalCard: {
    alignItems: 'center', backgroundColor: adminColors.surface,
    borderColor: adminColors.border, borderRadius: 24, borderWidth: 1,
    paddingBottom: 24, paddingHorizontal: 20, paddingTop: 56, width: '100%',
  },
  bookingDecisionModalClose: {
    alignItems: 'center', backgroundColor: adminColors.canvas,
    borderRadius: 22, height: 44, justifyContent: 'center',
    position: 'absolute', right: 12, top: 12, width: 44, zIndex: 2,
  },
  bookingDecisionSuccessIconWrap: {
    alignItems: 'center', backgroundColor: adminColors.greenSoft,
    borderRadius: 36, height: 72, justifyContent: 'center', width: 72,
  },
  bookingDecisionWarningIconWrap: {
    alignItems: 'center', backgroundColor: adminColors.redSoft,
    borderRadius: 36, height: 72, justifyContent: 'center', width: 72,
  },
  bookingDecisionModalTitle: {
    color: adminColors.ink, fontFamily: 'InterBold', fontSize: 21,
    includeFontPadding: false, lineHeight: 29, marginTop: 18, textAlign: 'center',
  },
  bookingDecisionModalMessage: {
    color: adminColors.muted, fontFamily: 'Inter', fontSize: 14,
    includeFontPadding: false, lineHeight: 23, marginTop: 10, textAlign: 'center',
  },
  bookingDecisionReasonInput: {
    backgroundColor: adminColors.canvas, borderColor: adminColors.border,
    borderRadius: 12, borderWidth: 1, color: adminColors.ink,
    fontFamily: 'Inter', fontSize: 14, lineHeight: 22, includeFontPadding: false,
    marginTop: 20, minHeight: 100, padding: 14, textAlignVertical: 'top', width: '100%',
  },
  bookingDecisionModalActions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  bookingDecisionCancelButton: {
    alignItems: 'center', backgroundColor: adminColors.canvas,
    borderColor: adminColors.border, borderRadius: 14, borderWidth: 1,
    flex: 1, minHeight: 50, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 14,
  },
  bookingDecisionCancelText: { color: adminColors.ink, fontFamily: 'InterSemiBold', fontSize: 14, lineHeight: 22, includeFontPadding: false, textAlign: 'center' },
  bookingDecisionRejectButton: {
    alignItems: 'center', backgroundColor: adminColors.red,
    borderRadius: 14, flex: 1, minHeight: 50, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 14,
  },
  bookingDecisionRejectText: { color: adminColors.surface, fontFamily: 'InterSemiBold', fontSize: 14, lineHeight: 22, includeFontPadding: false, textAlign: 'center' },
  bookingDecisionOkButton: {
    alignItems: 'center', backgroundColor: adminColors.blue, borderRadius: 14,
    minHeight: 50, justifyContent: 'center', marginTop: 24,
    paddingHorizontal: 14, paddingVertical: 14, width: '100%',
  },
  bookingDecisionOkText: { color: adminColors.surface, fontFamily: 'InterSemiBold', fontSize: 14, lineHeight: 22, includeFontPadding: false, textAlign: 'center' },
});
