import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemStatus } from '@/types/evotrader';
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  AlertTriangle,
  Terminal
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ControlPanelProps {
  status: SystemStatus;
  onStart?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onRefresh?: () => void;
}

export function ControlPanel({ 
  status, 
  onStart, 
  onPause, 
  onStop, 
  onRefresh 
}: ControlPanelProps) {
  const handleStart = () => {
    toast({
      title: "System Starting",
      description: "Initializing trading agents...",
    });
    onStart?.();
  };

  const handlePause = () => {
    toast({
      title: "System Paused",
      description: "All trading activity suspended.",
    });
    onPause?.();
  };

  const handleStop = () => {
    toast({
      title: "System Stopped",
      description: "Generation terminated. Calculating fitness scores...",
      variant: "destructive",
    });
    onStop?.();
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
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="terminal"
            size="sm"
            onClick={handleStart}
            disabled={status === 'running'}
            className="w-full"
          >
            <Play className="h-4 w-4" />
            Start
          </Button>
          
          <Button 
            variant="warning"
            size="sm"
            onClick={handlePause}
            disabled={status !== 'running'}
            className="w-full"
          >
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        </div>
        
        <Button 
          variant="danger"
          size="sm"
          onClick={handleStop}
          disabled={status === 'stopped'}
          className="w-full"
        >
          <Square className="h-4 w-4" />
          Emergency Stop
        </Button>
        
        <div className="pt-2 border-t border-border">
          <Button 
            variant="ghost"
            size="sm"
            onClick={onRefresh}
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
