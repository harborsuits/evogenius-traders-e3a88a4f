import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface ArmSession {
  id: string;
  created_at: string;
  expires_at: string;
  spent_at: string | null;
  spent_by_request_id: string | null;
  max_live_orders: number;
  orders_executed: number;
  mode: string;
  metadata: Record<string, unknown> | null;
}

interface ControlEvent {
  id: string;
  action: string;
  triggered_at: string;
  metadata: Record<string, unknown> | null;
}

export function ArmSessionHistory() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['arm-session-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arm_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as ArmSession[];
    },
    refetchInterval: 30000,
  });

  const { data: events } = useQuery({
    queryKey: ['arm-related-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['live_armed', 'live_disarmed', 'live_trade_executed', 'candidate_created'])
        .order('triggered_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as ControlEvent[];
    },
    refetchInterval: 30000,
  });

  const getSessionOutcome = (session: ArmSession): { label: string; color: string; icon: React.ReactNode } => {
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    if (session.spent_at) {
      return { 
        label: 'Traded', 
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: <CheckCircle2 className="h-3 w-3" />
      };
    }
    
    if (now > expiresAt) {
      return { 
        label: 'Expired', 
        color: 'bg-muted text-muted-foreground border-muted',
        icon: <Clock className="h-3 w-3" />
      };
    }
    
    return { 
      label: 'Active', 
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      icon: <Shield className="h-3 w-3" />
    };
  };

  const getSessionEvents = (session: ArmSession) => {
    if (!events) return [];
    
    const sessionStart = new Date(session.created_at);
    const sessionEnd = session.spent_at 
      ? new Date(session.spent_at) 
      : new Date(session.expires_at);
    
    return events.filter(event => {
      const eventTime = new Date(event.triggered_at);
      return eventTime >= sessionStart && eventTime <= sessionEnd;
    });
  };

  const getGateFailures = (sessionEvents: ControlEvent[]) => {
    const candidates = sessionEvents.filter(e => e.action === 'candidate_created');
    const failures: string[] = [];
    
    candidates.forEach(c => {
      const meta = c.metadata as Record<string, unknown> | null;
      if (meta?.gate_results) {
        const gates = meta.gate_results as Record<string, unknown>;
        Object.entries(gates).forEach(([gate, result]) => {
          const r = result as { passed?: boolean };
          if (r && r.passed === false && !failures.includes(gate)) {
            failures.push(gate);
          }
        });
      }
    });
    
    return failures;
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            ARM Session History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-sm">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          ARM Session History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {!sessions || sessions.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-4">
              No ARM sessions yet
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const outcome = getSessionOutcome(session);
                const sessionEvents = getSessionEvents(session);
                const gateFailures = getGateFailures(sessionEvents);
                const candidateCount = sessionEvents.filter(e => e.action === 'candidate_created').length;
                
                return (
                  <div 
                    key={session.id} 
                    className="p-3 rounded-lg bg-muted/30 border border-border space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={outcome.color}>
                          {outcome.icon}
                          <span className="ml-1">{outcome.label}</span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {session.orders_executed}/{session.max_live_orders} orders
                      </span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(session.created_at), 'MMM d, HH:mm')} → {format(new Date(session.expires_at), 'HH:mm')}
                    </div>
                    
                    {candidateCount > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">{candidateCount} candidates</span>
                        {gateFailures.length > 0 && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Failed: {gateFailures.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    
                    {session.spent_at && (
                      <div className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Trade executed at {format(new Date(session.spent_at), 'HH:mm:ss')}
                      </div>
                    )}
                    
                    {outcome.label === 'Expired' && candidateCount === 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3" />
                        No candidates during window
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
