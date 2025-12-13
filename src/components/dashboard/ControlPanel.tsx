import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemStatus } from '@/types/evotrader';
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  AlertTriangle,
  Terminal,
  Loader2,
  Rocket
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ControlPanelProps {
  status: SystemStatus;
  generationId?: string | null;
  onStart?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onRefresh?: () => void;
}

const PLACEHOLDER_ID = '11111111-1111-1111-1111-111111111111';

export function ControlPanel({ 
  status, 
  generationId,
  onStart, 
  onPause, 
  onStop, 
  onRefresh 
}: ControlPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isGenerationMissing = !generationId || generationId === PLACEHOLDER_ID;

  const startNewGeneration = async () => {
    setLoading('generation');
    
    try {
      const { data, error } = await supabase.functions.invoke('generation-start');

      if (error) {
        console.error('[ControlPanel] Generation start error:', error);
        toast({
          title: "Failed to Start Generation",
          description: error.message || "Could not start new generation",
          variant: "destructive",
        });
        return;
      }

      if (data?.skipped) {
        toast({
          title: "Generation Already Active",
          description: `Generation ${data.generation_id?.substring(0, 8)} is already running.`,
        });
        return;
      }

      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();

      toast({
        title: "Generation Started",
        description: `Generation #${data.generation_number} has begun. Agents are now linked and ready.`,
      });

    } catch (err) {
      console.error('[ControlPanel] Unexpected error:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const executeAction = async (action: 'start' | 'pause' | 'stop') => {
    setLoading(action);
    
    try {
      const { data, error } = await supabase.functions.invoke('system-control', {
        body: { action }
      });

      if (error) {
        console.error('[ControlPanel] Error:', error);
        toast({
          title: "Action Failed",
          description: error.message || "Could not execute action",
          variant: "destructive",
        });
        return;
      }

      // Invalidate system state and control events to trigger refetch
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'system-state' 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'control-events' 
      });

      const messages = {
        start: { title: "System Starting", desc: "Initializing trading agents..." },
        pause: { title: "System Paused", desc: "All trading activity suspended." },
        stop: { title: "System Stopped", desc: "Generation terminated. Calculating fitness scores..." },
      };

      toast({
        title: messages[action].title,
        description: messages[action].desc,
        variant: action === 'stop' ? 'destructive' : 'default',
      });

      // Call optional callbacks
      if (action === 'start') onStart?.();
      if (action === 'pause') onPause?.();
      if (action === 'stop') onStop?.();

    } catch (err) {
      console.error('[ControlPanel] Unexpected error:', err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast({
      title: "Data Refreshed",
      description: "All data has been reloaded.",
    });
    onRefresh?.();
  };

  return (
    <Card variant="terminal" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            System Control
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Generation Start Button - shown when generation is missing */}
        {isGenerationMissing && (
          <Button 
            variant="glow"
            size="sm"
            onClick={startNewGeneration}
            disabled={loading !== null}
            className="w-full mb-2"
          >
            {loading === 'generation' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Start New Generation
          </Button>
        )}

        {isGenerationMissing && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 text-warning text-xs mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-mono">No active generation. Start one to enable trading.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="terminal"
            size="sm"
            onClick={() => executeAction('start')}
            disabled={status === 'running' || loading !== null || isGenerationMissing}
            className="w-full"
          >
            {loading === 'start' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start
          </Button>
          
          <Button 
            variant="warning"
            size="sm"
            onClick={() => executeAction('pause')}
            disabled={status !== 'running' || loading !== null}
            className="w-full"
          >
            {loading === 'pause' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            Pause
          </Button>
        </div>
        
        <Button 
          variant="danger"
          size="sm"
          onClick={() => executeAction('stop')}
          disabled={status === 'stopped' || loading !== null}
          className="w-full"
        >
          {loading === 'stop' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          Emergency Stop
        </Button>
        
        <div className="pt-2 border-t border-border">
          <Button 
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading !== null}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Data
          </Button>
        </div>
        
        {status === 'error' && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-mono">System error detected</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
