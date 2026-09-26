export type BookingStatus = 'cancelled' | 'completed' | 'confirmed' | 'expired' | 'pending' | 'rejected';

export type AdminBookingRequest = {
  bookingDate: string;
  clientEmail: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  endTime: string;
  id: string;
  notes: string | null;
  packageInclusions: string[];
  packageImageUrl?: string | null;
  packageName: string;
  packagePrice: number;
  peopleCount: string;
  rejectionReason: string | null;
  serviceName: string;
  sessionTheme: string;
  shootLocation: string;
  specialRequests: string;
  startTime: string;
  status: BookingStatus;
};
