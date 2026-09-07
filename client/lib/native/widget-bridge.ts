import { isTauri } from "@/lib/db";

async function invokeIfTauri(command: string, args?: Record<string, unknown>): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(command, args);
}

export async function mirrorAuthToken(token: string): Promise<void> {
  await invokeIfTauri("mirror_auth_token", { token });
}

export async function clearMirroredAuthToken(): Promise<void> {
  await invokeIfTauri("clear_mirrored_auth_token");
}

export async function writeWidgetSnapshot(snapshotJson: string): Promise<void> {
  await invokeIfTauri("write_widget_snapshot", { snapshotJson });
}

export async function requestPinWidget(): Promise<void> {
  await invokeIfTauri("request_pin_widget");
}
