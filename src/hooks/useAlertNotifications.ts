import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Severity = "info" | "warn" | "crit";

type PerfAlertRow = {
  id: string;
  created_at: string;
  scope: string;
  scope_id: string;
  severity: Severity | string;
  type: string;
  title: string;
  message: string;
  metadata?: any;
  is_ack: boolean;
  acked_at?: string | null;
};

export type AlertNotifyOptions = {
  enabled?: boolean;
  toast?: boolean;   // default true
  desktop?: boolean; // default false
  sound?: boolean;   // default false
};

export function useAlertNotifications(options?: AlertNotifyOptions) {
  const { toast } = useToast();

  const optsRef = useRef<Required<AlertNotifyOptions>>({
    enabled: true,
    toast: true,
    desktop: false,
    sound: false,
  });

  // Keep options in a ref so the realtime callback always sees latest settings
  useEffect(() => {
    const next: Required<AlertNotifyOptions> = {
      enabled: options?.enabled ?? true,
      toast: options?.toast ?? true,
      desktop: options?.desktop ?? false,
      sound: options?.sound ?? false,
    };
    optsRef.current = next;
  }, [options?.enabled, options?.toast, options?.desktop, options?.sound]);

  const seenRef = useRef<Set<string>>(new Set());

  // Load per-tab dedupe set
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
      const arr = Array.from(seenRef.current).slice(-250);
      sessionStorage.setItem("seen_alert_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
  };

  const playSound = () => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;

      const ctx = new Ctx();
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
        ctx.close?.();
      }, 120);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!optsRef.current.enabled) return;

    const channel = supabase
      .channel("perf-alerts-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "performance_alerts" },
        (payload) => {
          const row = payload.new as Partial<PerfAlertRow> | null;
          if (!row?.id) return;

          // Don't notify acked alerts
          if (row.is_ack) return;

          // Dedupe per tab/session
          if (seenRef.current.has(row.id)) return;
          markSeen(row.id);

          const severity = String(row.severity ?? "info") as Severity | string;
          const title = String(row.title ?? "Performance Alert");
          const message = String(row.message ?? "");

          const opts = optsRef.current;

          if (opts.toast) {
            toast({
              title: `${String(severity).toUpperCase()}: ${title}`,
              description: message,
              variant: severity === "crit" ? "destructive" : "default",
            });
          }

          if (opts.desktop && "Notification" in window) {
            const show = () =>
              new Notification(`${String(severity).toUpperCase()}: ${title}`, {
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

          if (opts.sound) playSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  return null;
}
