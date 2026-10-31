export function partitionDeletionResult(realIds: string[], demoIds: string[], existingIds: ReadonlySet<string>) {
  return {
    deletedAssetIds: [...demoIds, ...realIds.filter((id) => !existingIds.has(id))],
    failedAssetIds: realIds.filter((id) => existingIds.has(id))
  };
}

export function isDeletionCancelled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("User didn't grant write permission to requested files");
}

export function isDeletedAssetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Asset not found:')
    || message.includes("Couldn't find asset with id:")
    || message.includes('may have been deleted or is no longer accessible');
}
