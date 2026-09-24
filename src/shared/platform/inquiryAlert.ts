import {z} from 'zod';

/** Socket hints contain routing identity only. They are neither delivery/read
 * receipts nor authority to increment unread counts. Never preview guest text. */
export const inquiryAlertSchema=z.object({
  type:z.literal('new_message'),
  threadId:z.number().int().positive().safe(),
  messageId:z.number().int().positive().safe().optional(),
  notificationId:z.string().uuid().optional(),
});
export const inquiryAlertPreview='You have a new message in your Encho inbox.';

export function parseInquiryAlert(value:unknown){
  const result=inquiryAlertSchema.safeParse(value);
  return result.success?result.data:null;
}
