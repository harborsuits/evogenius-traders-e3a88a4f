import React from 'react';
import { OrbitalProvider, OrbitalCard } from '@/contexts/OrbitalContext';
import { OrbitRing } from './OrbitRing';
import { DockZone } from './DockZone';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { PriceTicker } from '@/components/dashboard/PriceTicker';
import { IntakeWidget } from '@/components/dashboard/IntakeWidget';
import { AutopsyWidget } from '@/components/dashboard/AutopsyWidget';

// Inner component that uses the context
function OrbitalLayout() {
  const { setRotationAngle } = useOrbital();
  
  const handleResetView = () => {
    setRotationAngle(0);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Dock Zone - reserves layout space when cards docked */}
      <DockZone zone="top" />
      
      {/* Main Orbit Area - takes remaining space between docks */}
      <div className="flex-1 relative overflow-hidden min-h-0 z-10">
        <OrbitRing />
        
        {/* Intake Widget - LEFT (speculative, forward-looking) */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 w-[420px] max-w-[32vw] max-h-[calc(100%-2rem)]">
          <IntakeWidget />
        </div>
        
        {/* Autopsy Widget - RIGHT (ground truth, backward-looking) */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 w-[420px] max-w-[32vw] max-h-[calc(100%-2rem)]">
          <AutopsyWidget />
        </div>
        
        {/* Reset View Button */}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-2 right-2 z-50 bg-card/80 backdrop-blur h-7 px-2 text-xs"
          onClick={handleResetView}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>
      
      {/* Price Ticker Area */}
      <PriceTicker />
      
      {/* Bottom Dock Zone - reserves layout space when cards docked */}
      <DockZone zone="bottom" />
    </div>
  );
}

interface OrbitalCommandCenterProps {
  cards: OrbitalCard[];
}

export function OrbitalCommandCenter({ cards }: OrbitalCommandCenterProps) {
  return (
    <OrbitalProvider cards={cards}>
      <OrbitalLayout />
    </OrbitalProvider>
  );
}
