import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { 
  Eye, 
  Settings,
  AlertTriangle,
  TrendingUp,
  Wrench,
  ChevronRight
} from 'lucide-react';

export function SystemAuditDrawer({ compact }: { compact?: boolean }) {
  const [activeTab, setActiveTab] = React.useState<'updates' | 'frozen' | 'retighten'>('updates');
  
  // Fetch summary counts for badge
  const { data: summaryCounts } = useQuery({
    queryKey: ['audit-summary-counts'],
    queryFn: async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const [updates, frozen, retighten] = await Promise.all([
        supabase
          .from('control_events')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'adaptive_tuning_update')
          .gte('triggered_at', oneDayAgo.toISOString()),
        supabase
          .from('control_events')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'adaptive_tuning_frozen')
          .gte('triggered_at', oneDayAgo.toISOString()),
        supabase
          .from('control_events')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'adaptive_tuning_retighten')
          .gte('triggered_at', oneDayAgo.toISOString()),
      ]);
      
      return {
        updates: updates.count || 0,
        frozen: frozen.count || 0,
        retighten: retighten.count || 0,
        total: (updates.count || 0) + (frozen.count || 0) + (retighten.count || 0),
      };
    },
    refetchInterval: 60000,
  });
  
  // Fetch detailed events for selected tab
  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit-events-drawer', activeTab],
    queryFn: async () => {
      const actionMap = {
        updates: 'adaptive_tuning_update',
        frozen: 'adaptive_tuning_frozen',
        retighten: 'adaptive_tuning_retighten',
      };
      
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', actionMap[activeTab])
        .order('triggered_at', { ascending: false })
        .limit(30);
      
      return events ?? [];
    },
    refetchInterval: 30000,
  });
  
  const formatEventSummary = (meta: any, type: string) => {
    if (type === 'updates') {
      const trigger = meta?.trigger ?? 'unknown';
      const offsetsChanged = Object.keys(meta?.offsets_new ?? {}).length;
      return `${trigger} → ${offsetsChanged} offsets`;
    }
    if (type === 'frozen') {
      return meta?.reason ?? 'frozen';
    }
    if (type === 'retighten') {
      return `retighten: ${meta?.reason ?? 'conditions improved'}`;
    }
    return 'event';
  };
  
  const getEventDetails = (meta: any, type: string) => {
    if (type === 'updates') {
      const offsets = meta?.offsets_new ?? {};
      return Object.entries(offsets)
        .map(([k, v]) => `${k}: ${(v as number).toFixed(4)}`)
        .join(', ') || 'No offsets';
    }
    if (type === 'frozen') {
      const duration = meta?.freeze_duration_min ?? '?';
      return `Duration: ${duration}min`;
    }
    return '';
  };
  
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="w-full space-y-3 text-left hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
            <Settings className="h-4 w-4 text-primary" />
            System Audit
            {summaryCounts && summaryCounts.total > 0 && (
              <Badge variant="secondary" className="text-[8px] px-1.5 py-0 ml-auto">
                {summaryCounts.total} (24h)
              </Badge>
            )}
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </div>
          
          {/* Mini summary */}
          <div className="grid grid-cols-3 gap-1">
            <div className={cn(
              "rounded p-1.5 text-center",
              summaryCounts?.updates ? "bg-primary/10" : "bg-muted/20"
            )}>
              <div className={cn(
                "text-sm font-bold",
                summaryCounts?.updates ? "text-primary" : "text-muted-foreground"
              )}>
                {summaryCounts?.updates || 0}
              </div>
              <div className="text-[8px] text-muted-foreground">Updates</div>
            </div>
            <div className={cn(
              "rounded p-1.5 text-center",
              summaryCounts?.frozen ? "bg-destructive/10" : "bg-muted/20"
            )}>
              <div className={cn(
                "text-sm font-bold",
                summaryCounts?.frozen ? "text-destructive" : "text-muted-foreground"
              )}>
                {summaryCounts?.frozen || 0}
              </div>
              <div className="text-[8px] text-muted-foreground">Frozen</div>
            </div>
            <div className={cn(
              "rounded p-1.5 text-center",
              summaryCounts?.retighten ? "bg-success/10" : "bg-muted/20"
            )}>
              <div className={cn(
                "text-sm font-bold",
                summaryCounts?.retighten ? "text-success" : "text-muted-foreground"
              )}>
                {summaryCounts?.retighten || 0}
              </div>
              <div className="text-[8px] text-muted-foreground">Retighten</div>
            </div>
          </div>
        </button>
      </SheetTrigger>
      
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            <Settings className="h-5 w-5 text-primary" />
            System Audit Log
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {/* Tab selector */}
          <div className="flex gap-2">
            {([
              { key: 'updates', label: 'Updates', icon: Wrench, color: 'text-primary' },
              { key: 'frozen', label: 'Frozen', icon: AlertTriangle, color: 'text-destructive' },
              { key: 'retighten', label: 'Retighten', icon: TrendingUp, color: 'text-success' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs transition-colors",
                  activeTab === tab.key 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {summaryCounts && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 ml-1">
                    {summaryCounts[tab.key]}
                  </Badge>
                )}
              </button>
            ))}
          </div>
          
          {/* Events list */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
          ) : !auditData || auditData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No {activeTab} events yet
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2 pr-4">
                {auditData.map((event, i) => {
                  const meta = event.metadata as any;
                  const triggeredAt = new Date(event.triggered_at);
                  const timeAgo = formatDistanceToNow(triggeredAt, { addSuffix: true });
                  const details = getEventDetails(meta, activeTab);
                  
                  return (
                    <div 
                      key={i} 
                      className={cn(
                        "p-3 rounded-lg border",
                        activeTab === 'frozen' ? 'bg-destructive/5 border-destructive/20' :
                        activeTab === 'retighten' ? 'bg-success/5 border-success/20' :
                        'bg-muted/20 border-border/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className={cn(
                            "text-sm font-medium",
                            activeTab === 'frozen' ? 'text-destructive' :
                            activeTab === 'retighten' ? 'text-success' :
                            'text-primary'
                          )}>
                            {formatEventSummary(meta, activeTab)}
                          </div>
                          {details && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {details}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {timeAgo}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
