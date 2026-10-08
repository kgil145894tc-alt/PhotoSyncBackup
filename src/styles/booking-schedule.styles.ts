import { StyleSheet } from 'react-native';

export const bookingScheduleStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EEEE',
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    backgroundColor: '#F3EEEE',
  },
  canvas: {
    position: 'relative',
    backgroundColor: '#F3EEEE',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    opacity: 0.6,
  },
  backButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  logo: {
    position: 'absolute',
  },
  stepLine: {
    position: 'absolute',
    backgroundColor: '#D1E2F7',
  },
  stepCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
  heading: {
    position: 'absolute',
    color: '#142C4C',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
  helperText: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  calendarCard: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.24)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarArrow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPill: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#E0E0E0',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  selectText: {
    color: '#2B2B2B',
    fontFamily: 'Inter',
    includeFontPadding: false,
  },
  weekLabel: {
    position: 'absolute',
    color: '#777777',
    fontFamily: 'Inter',
    includeFontPadding: false,
    textAlign: 'center',
  },
  dayButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    color: '#2B2B2B',
    fontFamily: 'Inter',
    includeFontPadding: false,
    textAlign: 'center',
  },
  disabledDayText: {
    color: '#B9B9B9',
  },
  unavailableDayText: {
    color: '#ffffff',
    fontFamily: 'InterBold',
  },
  unavailableDay: {
    backgroundColor: '#E45F62',
    borderColor: '#B32B2B',
    borderWidth: 1,
  },
  selectedDay: {
    backgroundColor: '#D1E2F7',
  },
  timeAvailabilityText: {
    position: 'absolute',
    color: '#4C5E76',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    textAlign: 'right',
  },
  timeSlotList: {
    position: 'absolute',
  },
  timeSlotListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 6,
  },
  timeSlot: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.5)',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selectedTimeSlot: {
    backgroundColor: '#142C4C',
  },
  disabledTimeSlot: {
    backgroundColor: '#ECECEC',
    borderColor: '#C9C9C9',
  },
  timeText: {
    color: '#000000',
    fontFamily: 'Inter',
    includeFontPadding: false,
    textAlign: 'center',
  },
  selectedTimeText: {
    color: '#ffffff',
  },
  disabledTimeText: {
    color: '#8A8A8A',
  },
  slotStatusText: {
    color: '#E45F62',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    marginTop: 1,
    textAlign: 'center',
  },
  slotHintText: {
    color: '#4C77A5',
    fontFamily: 'InterBold',
    includeFontPadding: false,
    marginTop: 2,
    textAlign: 'center',
  },
  selectedSlotHintText: {
    color: '#D1E2F7',
  },
  noTimeCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(76, 94, 118, 0.18)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 112,
    paddingHorizontal: 18,
    width: '100%',
  },
  noTimeTitle: {
    color: '#142C4C',
    fontFamily: 'InterBold',
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 20,
    textAlign: 'center',
  },
  noTimeText: {
    color: '#4C5E76',
    fontFamily: 'Inter',
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 17,
    marginTop: 5,
    textAlign: 'center',
  },
  continueButton: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#142C4C',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  continueText: {
    color: '#ffffff',
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
  },
});
