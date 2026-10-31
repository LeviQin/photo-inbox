export type PhotoStatus = 'active' | 'kept' | 'trashed';
export type ReviewSource = 'all' | 'screenshot' | 'large' | 'recent' | 'year';
export type ReviewTarget = 10 | 20 | 30 | 50;
export type SimilarityLevel = 'strict' | 'balanced' | 'loose';
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
  visualHash: string | null;
  averageColor: string | null;
  exactHash: string | null;
  actualBytes: number | null;
  analysisVersion: number;
  estimatedBytes: number;
  searchText: string;
  aiDescription: string | null;
  searchHit?: { label: string; snippet: string | null };
}

export interface DashboardStats {
  total: number;
  active: number;
  pending: number;
  kept: number;
  trashed: number;
  screenshots: number;
  categoryCounts: Record<PhotoCategory, number>;
  analysisPending: number;
  estimatedBytes: number;
  storageBytes: number;
  measuredBytes: number;
  measuredCount: number;
  measuredTrashedCount: number;
  sizeCoverage: number;
  reclaimableBytes: number;
}

export interface PhotoCursor {
  createdAt: number;
  id: string;
}

export interface PhotoPage {
  items: PhotoRecord[];
  nextCursor: PhotoCursor | null;
}

export interface PhotoPermissionState {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges: 'all' | 'limited' | 'none';
}

export interface SimilarGroup {
  id: string;
  items: PhotoRecord[];
  bestId: string;
  kind: 'exact' | 'similar';
}

export interface ReviewPreferences {
  dailyTarget: ReviewTarget;
  similarityLevel: SimilarityLevel;
  galleryColumns: 3 | 4 | 5;
}

export interface ReviewSourceSummary {
  counts: Record<Exclude<ReviewSource, 'year'>, number>;
  years: Array<{ year: number; count: number }>;
}

export interface ReviewSession {
  id: number;
  source: ReviewSource;
  sourceValue: string | null;
  targetCount: number;
  startedAt: number;
  completed: boolean;
  items: PhotoRecord[];
  keptCount: number;
  trashedCount: number;
  canUndo: boolean;
}
