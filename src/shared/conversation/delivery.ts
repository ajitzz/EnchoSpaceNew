import {z} from 'zod';

/** Routing identity only; never notification preview text or delivery evidence. */
export const conversationNotificationPayloadSchema=z.object({
  type:z.literal('new_message'),
  threadId:z.number().int().positive().safe(),
  messageId:z.number().int().positive().safe(),
  notificationId:z.string().uuid(),
}).strict();
export type ConversationNotificationPayload=z.infer<typeof conversationNotificationPayloadSchema>;
export const conversationNotificationTables={outbox:'notification_intents',events:'notification_intent_events'} as const;
