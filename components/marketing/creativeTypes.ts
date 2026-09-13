export type CreativeFormat = 'SQUARE' | 'PORTRAIT' | 'STORY' | 'LANDSCAPE';
export type CreativeState = 'QUEUED' | 'PROCESSING' | 'HOST_REVIEW' | 'ADMIN_REVIEW' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
export interface CreativeRecord {
  id: string;
  cursor: string;
  listingId: number;
  hostId: number;
  listingTitle: string;
  sourceAssetId: string;
  format: CreativeFormat;
  state: CreativeState;
  manifestHash: string | null;
  source: { hash: string; byteLength: number; width: number; height: number } | null;
  output: { hash: string; byteLength: number; width: number; height: number } | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
  cdnVerifiedAt: string | null;
  hostConfirmedAt: string | null;
  adminReviewedAt: string | null;
  reviewNote: string | null;
  errorCode: string | null;
}
export interface CreativePage { items: CreativeRecord[]; nextCursor: string | null; }
