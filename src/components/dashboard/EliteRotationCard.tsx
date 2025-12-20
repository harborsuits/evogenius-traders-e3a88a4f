import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGenerationSelection } from '@/hooks/useGenerationSelection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Users, Baby, Expand, Skull } from 'lucide-react';
import { EliteRotationModal } from './EliteRotationModal';

export function EliteRotationCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const { currentGenNumber, compareGenNumber, generations } = useGenerationSelection();

  const compareGen = generations.find(g => g.generation_number === compareGenNumber);
  const currentGen = generations.find(g => g.generation_number === currentGenNumber);
  const startTime = compareGen?.start_time ?? null;
  const endTime = currentGen?.end_time ?? null;

  const { data: summary, isLoading } = useQuery({
    queryKey: ['elite-rotation-summary', startTime, endTime],
    queryFn: async () => {
      if (!startTime) return null;

      let query = supabase
        .from('control_events')
        .select('action, metadata')
        .eq('action', 'selection_breeding')
        .gte('triggered_at', startTime)
        .order('triggered_at', { ascending: false })
        .limit(1);

      if (endTime) {
        query = query.lte('triggered_at', endTime);
      }

      const { data } = await query;
      if (!data || data.length === 0) return null;

      const meta = data[0].metadata as Record<string, unknown> ?? {};
      return {
        eliteCount: (meta.elite_count as number) ?? 0,
        parentCount: (meta.parent_count as number) ?? 0,
        offspringCount: (meta.offspring_count as number) ?? 0,
      };
    },
    enabled: !!startTime,
    refetchInterval: 30000,
  });

  return (
    <>
      <div className="h-full flex flex-col p-3 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Elite Rotation</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2"
            onClick={() => setModalOpen(true)}
          >
            <Expand className="h-3 w-3" />
          </Button>
        </div>

        {compareGenNumber !== null && currentGenNumber !== null && (
          <Badge variant="outline" className="text-[10px] font-mono w-fit">
            GEN {compareGenNumber} → GEN {currentGenNumber}
          </Badge>
        )}

        {isLoading ? (
          <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
        ) : !summary ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <Skull className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">No rotation yet</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-center">
              <Crown className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
              <div className="text-lg font-mono font-bold text-yellow-500">{summary.eliteCount}</div>
              <div className="text-[10px] text-muted-foreground">Elites</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2 text-center">
              <Users className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <div className="text-lg font-mono font-bold text-blue-500">{summary.parentCount}</div>
              <div className="text-[10px] text-muted-foreground">Parents</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-center">
              <Baby className="h-4 w-4 text-green-500 mx-auto mb-1" />
              <div className="text-lg font-mono font-bold text-green-500">{summary.offspringCount}</div>
              <div className="text-[10px] text-muted-foreground">Offspring</div>
            </div>
          </div>
        )}
      </div>

      <EliteRotationModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
