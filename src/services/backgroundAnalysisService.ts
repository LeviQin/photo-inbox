import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { processPendingPhotoAnalysis } from '@/services/visualHashService';
import { processPendingPhotoOcr } from '@/services/localOcrService';

const TASK_NAME = 'photo-inbox-local-analysis';

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      await Promise.all([
        processPendingPhotoAnalysis({ maxItems: 120 }),
        processPendingPhotoOcr(24)
      ]);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerAnalysisBackgroundTask() {
  if (!(await TaskManager.isAvailableAsync())) return false;
  if (await TaskManager.isTaskRegisteredAsync(TASK_NAME)) return true;
  if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
  return true;
}
