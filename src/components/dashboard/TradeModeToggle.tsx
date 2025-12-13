import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTradeMode, setTradeMode } from '@/hooks/usePaperTrading';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, FlaskConical, Zap } from 'lucide-react';

export function TradeModeToggle() {
  const { data: tradeMode, isLoading } = useTradeMode();
  const [showConfirm, setShowConfirm] = useState(false);
  const [switching, setSwitching] = useState(false);
  const queryClient = useQueryClient();

  const isPaper = tradeMode === 'paper';

  const handleToggle = () => {
    if (isPaper) {
      // Switching to LIVE - require confirmation
      setShowConfirm(true);
    } else {
      // Switching to PAPER - no confirmation needed
      switchMode('paper');
    }
  };

  const switchMode = async (mode: 'paper' | 'live') => {
    setSwitching(true);
    try {
      await setTradeMode(mode);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'trade-mode' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-state' });
      
      toast({
        title: mode === 'live' ? '⚠️ LIVE MODE ENABLED' : 'Paper Mode Enabled',
        description:
          mode === 'live'
            ? 'Real money trades will be executed!'
            : 'Trades will be simulated with no real funds.',
        variant: mode === 'live' ? 'destructive' : 'default',
      });
    } catch (err) {
      console.error('[TradeModeToggle] Error:', err);
      toast({
        title: 'Failed to switch mode',
        description: 'Could not update trade mode.',
        variant: 'destructive',
      });
    } finally {
      setSwitching(false);
      setShowConfirm(false);
    }
  };

  if (isLoading) {
    return <Badge variant="outline" className="animate-pulse">Loading...</Badge>;
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className={`h-4 w-4 ${isPaper ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-mono ${isPaper ? 'text-foreground' : 'text-muted-foreground'}`}>
            Paper
          </span>
        </div>
        
        <Switch
          checked={!isPaper}
          onCheckedChange={handleToggle}
          disabled={switching}
          className="data-[state=checked]:bg-destructive"
        />
        
        <div className="flex items-center gap-2">
          <Zap className={`h-4 w-4 ${!isPaper ? 'text-destructive' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-mono ${!isPaper ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
            Live
          </span>
        </div>

        <Badge
          variant={isPaper ? 'glow' : 'danger'}
          className={`ml-2 ${isPaper ? '' : 'animate-pulse'}`}
        >
          {isPaper ? 'PAPER MODE' : 'LIVE MODE'}
        </Badge>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-background border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Enable LIVE Trading?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to enable <strong className="text-destructive">LIVE TRADING MODE</strong>.
              </p>
              <p>
                This means <strong>real money</strong> will be used for all trades executed by the system.
              </p>
              <p className="text-destructive font-medium">
                Are you absolutely sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => switchMode('live')}
              className="bg-destructive hover:bg-destructive/90"
            >
              Yes, Enable Live Trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
