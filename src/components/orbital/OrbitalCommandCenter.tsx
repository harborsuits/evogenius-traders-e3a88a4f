import React, { useState } from 'react';
import { OrbitalProvider, OrbitalCard } from '@/contexts/OrbitalContext';
import { OrbitRing } from './OrbitRing';
import { DockZone } from './DockZone';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { PriceTicker } from '@/components/dashboard/PriceTicker';
import { IntakeWidget } from '@/components/dashboard/IntakeWidget';
import { AutopsyWidget } from '@/components/dashboard/AutopsyWidget';

export type NewsDock = "side" | "top" | "bottom";

// Inner component that uses the context
function OrbitalLayout() {
  const { setRotationAngle } = useOrbital();
  const [intakeDock, setIntakeDock] = useState<NewsDock>("side");
  const [autopsyDock, setAutopsyDock] = useState<NewsDock>("side");
  
  const handleResetView = () => {
    setRotationAngle(0);
  };

  const Intake = <IntakeWidget dock={intakeDock} onDockChange={setIntakeDock} />;
  const Autopsy = <AutopsyWidget dock={autopsyDock} onDockChange={setAutopsyDock} />;

  const hasTopDocked = intakeDock === "top" || autopsyDock === "top";
  const hasBottomDocked = intakeDock === "bottom" || autopsyDock === "bottom";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Dock Zone for orbit cards */}
      <DockZone zone="top" />
      
      {/* TOP NEWS DOCK SLOT */}
      {hasTopDocked && (
        <div className="w-full flex gap-3 px-3 pt-2 shrink-0">
          <div className="flex-1 min-w-0 h-[280px]">
            {intakeDock === "top" ? Intake : null}
          </div>
          <div className="flex-1 min-w-0 h-[280px]">
            {autopsyDock === "top" ? Autopsy : null}
          </div>
        </div>
      )}
      
      {/* Main Orbit Area - takes remaining space between docks */}
      <div className="flex-1 relative overflow-hidden min-h-0 z-10">
        <OrbitRing />
        
        {/* Intake Widget - LEFT (speculative, forward-looking) */}
        {intakeDock === "side" && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-40 w-[380px] max-w-[28vw] h-[calc(100%-2rem)] max-h-[500px]">
            {Intake}
          </div>
        )}
        
        {/* Autopsy Widget - RIGHT (ground truth, backward-looking) */}
        {autopsyDock === "side" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-40 w-[380px] max-w-[28vw] h-[calc(100%-2rem)] max-h-[500px]">
            {Autopsy}
          </div>
        )}
        
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
      
      {/* BOTTOM NEWS DOCK SLOT */}
      {hasBottomDocked && (
        <div className="w-full flex gap-3 px-3 pb-2 shrink-0">
          <div className="flex-1 min-w-0 h-[280px]">
            {intakeDock === "bottom" ? Intake : null}
          </div>
          <div className="flex-1 min-w-0 h-[280px]">
            {autopsyDock === "bottom" ? Autopsy : null}
          </div>
        </div>
      )}
      
      {/* Bottom Dock Zone for orbit cards */}
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
