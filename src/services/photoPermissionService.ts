import { Linking } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import type { PhotoPermissionState } from '@/types/photo';

const granularPermissions: MediaLibrary.GranularPermission[] = ['photo'];

function normalizePermission(permission: MediaLibrary.PermissionResponse): PhotoPermissionState {
  return {
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
    accessPrivileges: permission.granted ? (permission.accessPrivileges ?? 'all') : 'none'
  };
}

export async function getPhotoPermissionState() {
  return normalizePermission(await MediaLibrary.getPermissionsAsync(false, granularPermissions));
}

export async function requestPhotoPermission() {
  return normalizePermission(await MediaLibrary.requestPermissionsAsync(false, granularPermissions));
}

export async function ensurePhotoPermission() {
  const current = await getPhotoPermissionState();
  return current.granted ? current : requestPhotoPermission();
}

export async function chooseMorePhotos() {
  await MediaLibrary.presentPermissionsPickerAsync(['photo']);
  return getPhotoPermissionState();
}

export async function openPhotoPermissionSettings() {
  await Linking.openSettings();
}
