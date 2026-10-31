export type ExistingAnalysisState = {
  modifiedAt: number;
  visualHash: string | null;
  actualBytes: number | null;
  analysisVersion: number;
} | undefined;

export function shouldQueuePhotoAnalysis(state: ExistingAnalysisState, modifiedAt: number) {
  return !state || state.modifiedAt !== modifiedAt || state.analysisVersion < 2 || state.actualBytes === null;
}

export function resolvePhotoCreatedAt(creationTime: number, modificationTime: number) {
  if (Number.isFinite(creationTime) && creationTime > 0) return creationTime;
  return Number.isFinite(modificationTime) && modificationTime > 0 ? modificationTime : 0;
}
