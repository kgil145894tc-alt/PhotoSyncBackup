import { fallbackPortraitPackages } from '@/data/service-catalog';
import { type BookingDraft, type BookingInformation, type BookingSchedule } from '@/types/booking';
import { type PackageCatalogItem } from '@/types/services';

const draft: BookingDraft = {
  package: fallbackPortraitPackages[0],
};

export function getBookingDraft(): BookingDraft {
  return draft;
}

export function getSelectedPackage(): PackageCatalogItem {
  return draft.package ?? fallbackPortraitPackages[0];
}

export function setSelectedPackage(packageItem: PackageCatalogItem) {
  draft.package = packageItem;
}

export function setBookingSchedule(schedule: BookingSchedule) {
  draft.schedule = schedule;
}

export function setBookingInformation(information: BookingInformation) {
  draft.information = information;
}

export function clearBookingDraft() {
  draft.information = undefined;
  draft.package = fallbackPortraitPackages[0];
  draft.schedule = undefined;
}
