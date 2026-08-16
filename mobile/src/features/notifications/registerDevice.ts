import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../config/supabase";

export async function registerDeviceForNotifications(session: Session): Promise<string | null> {
  if (!Device.isDevice) return "Push notifications require a physical device.";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const permissions = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permissions.status !== "granted") return "Notification permission was not granted.";

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return "EXPO_PUBLIC_EAS_PROJECT_ID is required for push-token registration.";

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await getSupabaseClient().from("devices").upsert(
    {
      user_id: session.user.id,
      push_token: token,
      platform: "expo",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,push_token" },
  );

  return error ? "Unable to register this device for notifications." : null;
}
