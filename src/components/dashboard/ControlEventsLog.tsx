import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History } from 'lucide-react';

interface ControlEvent {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  triggered_at: string;
  metadata: { source?: string } | null;
}

const useControlEvents = (limit: number = 25) => {
  return useQuery({
    queryKey: ['control-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as ControlEvent[];
    },
  });
};

const useControlEventsRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('control-events-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'control_events' },
        () => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'control-events',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};

const getActionBadgeVariant = (action: string) => {
  switch (action.toLowerCase()) {
    case 'start':
      return 'default'; // cyan/terminal
    case 'pause':
      return 'secondary'; // amber/warning
    case 'stop':
      return 'destructive'; // red/danger
    default:
      return 'outline';
  }
};

const getActionBadgeClass = (action: string) => {
  switch (action.toLowerCase()) {
    case 'start':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30';
    case 'pause':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30';
    case 'stop':
      return 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30';
    default:
      return '';
  }
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
};

export const ControlEventsLog = () => {
  useControlEventsRealtime();
  const { data: events = [], isLoading } = useControlEvents();

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-mono text-sm font-medium">Control Events</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {events.length} events
        </span>
      </div>

      <ScrollArea className="h-[200px]">
        {isLoading ? (
          <div className="text-xs text-muted-foreground font-mono text-center py-4">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-xs text-muted-foreground font-mono text-center py-4">
            No control events yet
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-2 rounded bg-muted/30 text-xs font-mono"
              >
                <span className="text-muted-foreground w-16 shrink-0">
                  {formatTime(event.triggered_at)}
                </span>
                <Badge 
                  variant="outline" 
                  className={`uppercase text-[10px] px-2 ${getActionBadgeClass(event.action)}`}
                >
                  {event.action}
                </Badge>
                <span className="text-muted-foreground">
                  {event.previous_status ?? '—'} → {event.new_status ?? '—'}
                </span>
                {event.metadata?.source && (
                  <span className="text-muted-foreground/50 ml-auto">
                    {event.metadata.source}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
