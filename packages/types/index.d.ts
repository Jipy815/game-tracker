export type NotificationPayload = {
  user_id?: string;
  status?: string;
  current_game?: string | null;
};

export type QueueItem = {
  id: string;
  payload: NotificationPayload;
  attempts: number;
};

export const MAX_ATTEMPTS = 5;
