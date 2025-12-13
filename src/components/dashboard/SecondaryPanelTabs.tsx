import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ManualPaperTrade } from './ManualPaperTrade';
import { CoinbaseBalances } from './CoinbaseBalances';
import { ControlEventsLog } from './ControlEventsLog';
import { DecisionLog } from './DecisionLog';
import { ConfigViewer } from './ConfigViewer';
import { CoinbasePanel } from './CoinbasePanel';
import { SystemConfig } from '@/types/evotrader';
import { Wallet, Activity, Settings } from 'lucide-react';

interface SecondaryPanelTabsProps {
  config: SystemConfig;
}

export function SecondaryPanelTabs({ config }: SecondaryPanelTabsProps) {
  return (
    <Tabs defaultValue="trading" className="w-full">
      <TabsList className="w-full grid grid-cols-3 mb-4">
        <TabsTrigger value="trading" className="flex items-center gap-1.5 text-xs">
          <Wallet className="h-3.5 w-3.5" />
          Trading
        </TabsTrigger>
        <TabsTrigger value="system" className="flex items-center gap-1.5 text-xs">
          <Activity className="h-3.5 w-3.5" />
          System
        </TabsTrigger>
        <TabsTrigger value="config" className="flex items-center gap-1.5 text-xs">
          <Settings className="h-3.5 w-3.5" />
          Config
        </TabsTrigger>
      </TabsList>

      <TabsContent value="trading" className="space-y-4 mt-0">
        <ManualPaperTrade />
        <CoinbaseBalances />
      </TabsContent>

      <TabsContent value="system" className="space-y-4 mt-0">
        <DecisionLog />
        <ControlEventsLog />
      </TabsContent>

      <TabsContent value="config" className="space-y-4 mt-0">
        <CoinbasePanel />
        <ConfigViewer config={config} />
      </TabsContent>
    </Tabs>
  );
}
