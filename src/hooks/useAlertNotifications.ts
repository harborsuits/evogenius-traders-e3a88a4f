import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Realtime notifications for new performance_alerts rows.
 * - Toast always (when enabled)
 * - Optional Desktop Notifications (browser Notification API)
 * - Session dedupe so you don't get spam on reconnect
 */
export function useAlertNotifications(options?: {
  enabled?: boolean;
  toast?: boolean;
  desktop?: boolean;
  sound?: boolean;
}) {
  const { toast } = useToast();
  const opts = {
    enabled: true,
    toast: true,
    desktop: false,
    sound: false,
    ...(options ?? {}),
  };

  const seenRef = useRef<Set<string>>(new Set());

  // Load session dedupe (per tab)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("seen_alert_ids");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          seenRef.current = new Set(arr.filter((x) => typeof x === "string"));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const markSeen = (id: string) => {
    seenRef.current.add(id);
    try {
      // Cap stored ids to avoid unbounded growth
      const arr = Array.from(seenRef.current).slice(-250);
      sessionStorage.setItem("seen_alert_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
  };

  const playSound = () => {
    // super lightweight "beep" without external assets
    try {
      const ctx =
        new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 120);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!opts.enabled) return;

    const channel = supabase
      .channel("perf-alerts-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "performance_alerts" },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;

          // Only notify for un-acked alerts (new inserts should be false anyway)
          if (row.is_ack) return;

          // Deduplicate
          if (seenRef.current.has(row.id)) return;
          markSeen(row.id);

          const severity = String(row.severity || "info");
          const title = String(row.title || "Performance Alert");
          const message = String(row.message || "");

          // Toast
          if (opts.toast) {
            toast({
              title: `${severity.toUpperCase()}: ${title}`,
              description: message,
              variant: severity === "crit" ? "destructive" : "default",
            });
          }

          // Desktop Notification
          if (opts.desktop && "Notification" in window) {
            const show = () =>
              new Notification(`${severity.toUpperCase()}: ${title}`, {
                body: message,
              });

            if (Notification.permission === "granted") {
              show();
            } else if (Notification.permission === "default") {
              Notification.requestPermission().then((p) => {
                if (p === "granted") show();
              });
            }
          }

          // Sound
          if (opts.sound) playSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.enabled, opts.toast, opts.desktop, opts.sound, toast]);

  return null;
}
