export type PhotoSyncNotification = {
  bookingId: string | null;
  createdAt: string;
  id: string;
  isRead: boolean;
  message: string;
  title: string;
  userId: string;
};

export type NotificationFilter = 'all' | 'unread';
export type NotificationCursor = Pick<PhotoSyncNotification, 'createdAt' | 'id'>;

export type NotificationInbox = {
  items: PhotoSyncNotification[];
  hasMore: boolean;
  unreadCount: number;
  nextCursor?: NotificationCursor | null;
};
