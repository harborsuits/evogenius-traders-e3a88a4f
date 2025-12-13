import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { TradeModeToggle } from '@/components/dashboard/TradeModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SystemStatus } from '@/types/evotrader';
import { Dna, Bell, Settings, ExternalLink } from 'lucide-react';

interface HeaderProps {
  status: SystemStatus;
  generationNumber?: number;
}

export function Header({ status, generationNumber }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Dna className="h-8 w-8 text-primary animate-pulse-glow" />
              <div className="absolute inset-0 h-8 w-8 bg-primary/20 blur-lg rounded-full" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-mono text-xl font-bold gradient-text">
                EvoTrader
              </h1>
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                Evolutionary Crypto Trading
              </span>
            </div>
          </div>
          
          {generationNumber && (
            <Badge variant="glow" className="hidden md:flex">
              GEN_{String(generationNumber).padStart(3, '0')}
            </Badge>
          )}
        </div>

        {/* Trade Mode Toggle (center) */}
        <div className="hidden lg:flex">
          <TradeModeToggle />
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-4">
          <StatusIndicator status={status} size="md" />
          
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
          
          <Button variant="terminal" size="sm" className="hidden md:flex">
            <ExternalLink className="h-4 w-4" />
            Coinbase
          </Button>
        </div>
      </div>
      
      {/* Mobile trade mode toggle */}
      <div className="lg:hidden border-t border-border px-4 py-2 flex justify-center">
        <TradeModeToggle />
      </div>
    </header>
  );
}
