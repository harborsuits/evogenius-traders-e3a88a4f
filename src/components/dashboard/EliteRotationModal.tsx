import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGenerationSelection } from '@/hooks/useGenerationSelection';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Copy, Crown, Users, Baby, Wrench, Skull, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface EliteRotationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BreedingEvent {
  id: string;
  triggered_at: string;
  metadata: {
    elite_count?: number;
    parent_count?: number;
    offspring_count?: number;
    removed_count?: number;
    promoted_elites?: Array<{ agent_id: string; fitness?: number; strategy_template?: string }>;
    parents?: Array<{ agent_id: string; strategy_template?: string }>;
    offspring?: Array<{ agent_id: string; created_at?: string }>;
    [key: string]: unknown;
  };
}

interface EliteFlagsEvent {
  id: string;
  triggered_at: string;
  metadata: {
    elite_count?: number;
    elite_ids?: string[];
    source?: string;
  };
}

interface TuningEvent {
  id: string;
  triggered_at: string;
  metadata: {
    gate?: string;
    previous_offset?: number;
    new_offset?: number;
    effective_thresholds?: Record<string, number>;
    [key: string]: unknown;
  };
}

export function EliteRotationModal({ open, onOpenChange }: EliteRotationModalProps) {
  const { currentGenNumber, compareGenNumber, currentGenId, compareGenId, generations } = useGenerationSelection();

  // Fetch generation time bounds
  const compareGen = generations.find(g => g.generation_number === compareGenNumber);
  const currentGen = generations.find(g => g.generation_number === currentGenNumber);

  const startTime = compareGen?.start_time ?? null;
  const endTime = currentGen?.end_time ?? null;

  // Fetch control events for rotation
  const { data: events, isLoading } = useQuery({
    queryKey: ['elite-rotation-events', startTime, endTime],
    queryFn: async () => {
      if (!startTime) return { breeding: [], eliteFlags: [], tuning: [] };

      let query = supabase
        .from('control_events')
        .select('id, action, triggered_at, metadata')
        .in('action', ['selection_breeding', 'elite_flags_updated', 'adaptive_tuning_update'])
        .gte('triggered_at', startTime)
        .order('triggered_at', { ascending: false })
        .limit(100);

      if (endTime) {
        query = query.lte('triggered_at', endTime);
      }

      const { data } = await query;

      const breeding: BreedingEvent[] = [];
      const eliteFlags: EliteFlagsEvent[] = [];
      const tuning: TuningEvent[] = [];

      (data ?? []).forEach(evt => {
        const meta = evt.metadata as Record<string, unknown> ?? {};
        if (evt.action === 'selection_breeding') {
          breeding.push({ id: evt.id, triggered_at: evt.triggered_at, metadata: meta as BreedingEvent['metadata'] });
        } else if (evt.action === 'elite_flags_updated') {
          eliteFlags.push({ id: evt.id, triggered_at: evt.triggered_at, metadata: meta as EliteFlagsEvent['metadata'] });
        } else if (evt.action === 'adaptive_tuning_update') {
          tuning.push({ id: evt.id, triggered_at: evt.triggered_at, metadata: meta as TuningEvent['metadata'] });
        }
      });

      return { breeding, eliteFlags, tuning };
    },
    enabled: open && !!startTime,
    refetchOnWindowFocus: false,
  });

  const hasData = (events?.breeding?.length ?? 0) > 0 || 
                  (events?.eliteFlags?.length ?? 0) > 0 || 
                  (events?.tuning?.length ?? 0) > 0;

  const copyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast({ title: 'Copied to clipboard' });
  };

  const latestBreeding = events?.breeding[0];
  const latestEliteFlags = events?.eliteFlags[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Crown className="h-5 w-5 text-yellow-500" />
            Elite Rotation
            {compareGenNumber !== null && currentGenNumber !== null && (
              <Badge variant="outline" className="ml-2 text-xs">
                GEN {compareGenNumber} → GEN {currentGenNumber}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[70vh] pr-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading rotation events...</div>
          ) : !hasData ? (
            <div className="text-center py-12 space-y-2">
              <Skull className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground text-sm">No rotation events recorded for this generation window.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Breeding Summary */}
              {latestBreeding && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      Breeding Summary
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => copyJson(latestBreeding)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy JSON
                    </Button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(latestBreeding.triggered_at), { addSuffix: true })}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-mono font-bold text-yellow-500">
                          {latestBreeding.metadata.elite_count ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Elites</div>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-mono font-bold text-blue-500">
                          {latestBreeding.metadata.parent_count ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Parents</div>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-mono font-bold text-green-500">
                          {latestBreeding.metadata.offspring_count ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Offspring</div>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-lg font-mono font-bold text-destructive">
                          {latestBreeding.metadata.removed_count ?? 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Removed</div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <Separator />

              {/* Promoted Elites */}
              {(latestBreeding?.metadata.promoted_elites?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Crown className="h-4 w-4 text-yellow-500" />
                    Promoted Elites
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {latestBreeding?.metadata.promoted_elites?.map((elite) => (
                      <div 
                        key={elite.agent_id}
                        className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded p-2"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-yellow-500" />
                          <span className="text-xs font-mono">{elite.agent_id.slice(0, 8)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {elite.strategy_template && (
                            <Badge variant="secondary" className="text-[9px]">
                              {elite.strategy_template.replace('_', ' ')}
                            </Badge>
                          )}
                          {elite.fitness !== undefined && (
                            <span className="text-[10px] font-mono text-primary">
                              {elite.fitness.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Parents */}
              {(latestBreeding?.metadata.parents?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    Parents
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {latestBreeding?.metadata.parents?.map((parent) => (
                      <Badge 
                        key={parent.agent_id}
                        variant="outline"
                        className="text-[10px] font-mono bg-blue-500/10 border-blue-500/30"
                      >
                        {parent.agent_id.slice(0, 8)}
                        {parent.strategy_template && (
                          <span className="ml-1 text-muted-foreground">
                            ({parent.strategy_template.replace('_', ' ')})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Offspring */}
              {(latestBreeding?.metadata.offspring?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Baby className="h-4 w-4 text-green-500" />
                    Offspring
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {latestBreeding?.metadata.offspring?.map((child) => (
                      <Badge 
                        key={child.agent_id}
                        variant="outline"
                        className="text-[10px] font-mono bg-green-500/10 border-green-500/30"
                      >
                        {child.agent_id.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              {/* Elite Flags Update */}
              {latestEliteFlags && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Crown className="h-4 w-4 text-primary" />
                      Elite Flags Updated
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => copyJson(latestEliteFlags)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy JSON
                    </Button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(latestEliteFlags.triggered_at), { addSuffix: true })}
                      {latestEliteFlags.metadata.source && (
                        <span className="ml-2">• Source: {latestEliteFlags.metadata.source}</span>
                      )}
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Elite count:</span>{' '}
                      <span className="font-mono font-bold text-yellow-500">
                        {latestEliteFlags.metadata.elite_count ?? 0}
                      </span>
                    </div>
                    {latestEliteFlags.metadata.elite_ids && latestEliteFlags.metadata.elite_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {latestEliteFlags.metadata.elite_ids.map(id => (
                          <Badge key={id} variant="outline" className="text-[9px] font-mono">
                            {id.slice(0, 8)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <Separator />

              {/* Tuning Changes */}
              {(events?.tuning?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-amber-500" />
                    Tuning Changes ({events?.tuning.length})
                  </h3>
                  <div className="space-y-2">
                    {events?.tuning.slice(0, 5).map((evt) => (
                      <div 
                        key={evt.id}
                        className="bg-muted/30 rounded-lg p-2 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatDistanceToNow(new Date(evt.triggered_at), { addSuffix: true })}
                          </span>
                          <Badge variant="secondary" className="text-[9px]">
                            {evt.metadata.gate ?? 'unknown gate'}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono">
                          <span className="text-muted-foreground">Offset:</span>{' '}
                          <span className="text-destructive">{evt.metadata.previous_offset?.toFixed(4) ?? '—'}</span>
                          <span className="mx-1">→</span>
                          <span className="text-primary">{evt.metadata.new_offset?.toFixed(4) ?? '—'}</span>
                        </div>
                        {evt.metadata.effective_thresholds && (
                          <div className="text-[10px] text-muted-foreground">
                            Thresholds: {JSON.stringify(evt.metadata.effective_thresholds)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
