export type CalendarSlotStatus = 'available' | 'booked' | 'unavailable';

export type CalendarTimeSlot = {
  bookingId?: string;
  clientName?: string;
  endTime: string;
  id: string;
  isCustom?: boolean;
  isSaved?: boolean;
  reason?: string | null;
  startTime: string;
  status: CalendarSlotStatus;
};

export type CalendarDaySummary = {
  date: string;
  hasAvailable: boolean;
  hasBooked: boolean;
  hasFullDayUnavailable: boolean;
  hasUnavailable: boolean;
};

export type CalendarGridDay = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
};
