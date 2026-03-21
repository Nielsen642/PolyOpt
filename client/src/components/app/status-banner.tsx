import { Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function StatusBanner() {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        isOnline
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
          : "border-amber-500/20 bg-amber-500/5 text-amber-300"
      }`}
    >
      {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {isOnline
        ? "Online. Realtime analytics and notifications are active."
        : "Offline mode. Cached pages remain available and live updates will resume when the connection returns."}
    </div>
  );
}
