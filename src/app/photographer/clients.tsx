import { PhotographerPlaceholderScreen } from '@/components/photographer-placeholder-screen';

export default function PhotographerClientsScreen() {
  return (
    <PhotographerPlaceholderScreen
      description="Review client records, contact details, booking history, and verification status."
      eyebrow="Photographer View"
      items={[
        {
          badge: 'Verified',
          meta: '2 bookings · briancainglet@gmail.com',
          title: 'Brian Cainglet',
        },
        {
          badge: 'New',
          meta: '1 pending request · carla@example.com',
          title: 'Carla Mendoza',
        },
        {
          badge: 'Active',
          meta: '3 completed sessions · rivera@example.com',
          title: 'Rivera Family',
        },
      ]}
      title="Clients"
    />
  );
}
