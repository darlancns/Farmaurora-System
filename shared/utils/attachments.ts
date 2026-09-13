export function getAttachmentPublicUrl(patientId: string, slotKey: string): string {
  return `/uploads/attachments/${patientId}/${slotKey}.png`;
}
