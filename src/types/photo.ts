export type PhotoStatus = 'active' | 'kept' | 'trashed';
export type PhotoCategory =
  | 'screenshot'
  | 'document'
  | 'travel'
  | 'food'
  | 'pet'
  | 'portrait'
  | 'other';

export interface PhotoRecord {
  id: string;
  assetId: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  createdAt: number;
  modifiedAt: number;
  category: PhotoCategory;
  status: PhotoStatus;
  favorite: boolean;
  aiScore: number;
  estimatedBytes: number;
  searchText: string;
}

export interface DashboardStats {
  total: number;
  active: number;
  kept: number;
  trashed: number;
  screenshots: number;
  estimatedBytes: number;
  reclaimableBytes: number;
}

export interface SimilarGroup {
  id: string;
  items: PhotoRecord[];
  bestId: string;
}
