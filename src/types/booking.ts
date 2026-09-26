import { type PackageCatalogItem } from '@/types/services';

export type BookingInformation = {
  email: string;
  fullName: string;
  peopleCount?: string;
  sessionLocation?: string;
  sessionTheme?: string;
  notes: string;
  phone: string;
};

export type BookingSchedule = {
  bookingDate: string;
  displayDate: string;
  displayTime: string;
  endTime: string;
  startTime: string;
};

export type BookingDraft = {
  information?: BookingInformation;
  package?: PackageCatalogItem;
  schedule?: BookingSchedule;
};
