export interface Broadcast {
  id: string;
  type: "info" | "success" | "warning" | "danger" | string;
  title: string;
  message: string;
}
