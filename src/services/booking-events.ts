type BookingChangeListener = () => void;

const bookingChangeListeners = new Set<BookingChangeListener>();

export function emitBookingsChanged() {
  bookingChangeListeners.forEach((listener) => listener());
}

export function subscribeToBookingsChanged(listener: BookingChangeListener) {
  bookingChangeListeners.add(listener);

  return () => {
    bookingChangeListeners.delete(listener);
  };
}
