export const colors = {
  background: "#0B1020",
  surface: "#151C31",
  surfaceMuted: "#1C2642",
  text: "#F7F8FC",
  textMuted: "#AAB4CF",
  accent: "#8B9CFF",
  accentStrong: "#6F7FF2",
  success: "#51D39B",
  warning: "#FFC857",
  danger: "#FF7E8A",
  border: "#293556",
};

export const radius = { card: 20, control: 14, pill: 999 };

export function formatElapsed(iso: string | null): string | null {
  if (!iso) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatLastSeen(iso: string | null): string {
  if (!iso) return "No tracker updates yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Updated just now";
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `Updated ${Math.floor(seconds / 3600)}h ago`;
  return `Updated ${Math.floor(seconds / 86_400)}d ago`;
}
