import React, { useState } from 'react';
import { OrbitalProvider, OrbitalCard } from '@/contexts/OrbitalContext';
import { OrbitRing } from './OrbitRing';
import { DockZone } from './DockZone';
import { Button } from '@/components/ui/button';
import { RotateCcw, Eye, Skull } from 'lucide-react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { PriceTicker } from '@/components/dashboard/PriceTicker';
import { IntakeWidget } from '@/components/dashboard/IntakeWidget';
import { AutopsyWidget } from '@/components/dashboard/AutopsyWidget';
import { CollapsedTab } from '@/components/dashboard/WidgetControls';
import { useNewsLayoutState, WidgetPosition } from '@/hooks/useNewsLayoutState';

export type NewsDock = "side" | "top" | "bottom";

// Inner component that uses the context
function OrbitalLayout() {
  const { setRotationAngle } = useOrbital();
  const {
    intakePosition,
    autopsyPosition,
    setIntakePosition,
    setAutopsyPosition,
    toggleIntakeCollapse,
    toggleAutopsyCollapse,
    dockIntakeToOrbit,
    dockAutopsyToOrbit,
    undockIntake,
    undockAutopsy,
  } = useNewsLayoutState();
  
  const handleResetView = () => {
    setRotationAngle(0);
  };

  // Convert position to dock for drag behavior
  const intakeDock: NewsDock = intakePosition === 'top' ? 'top' : intakePosition === 'bottom' ? 'bottom' : 'side';
  const autopsyDock: NewsDock = autopsyPosition === 'top' ? 'top' : autopsyPosition === 'bottom' ? 'bottom' : 'side';

  const handleIntakeDockChange = (dock: NewsDock) => {
    setIntakePosition(dock as WidgetPosition);
  };

  const handleAutopsyDockChange = (dock: NewsDock) => {
    setAutopsyPosition(dock as WidgetPosition);
  };

  const hasTopDocked = intakePosition === 'top' || autopsyPosition === 'top';
  const hasBottomDocked = intakePosition === 'bottom' || autopsyPosition === 'bottom';

  // Counts for collapsed tabs
  const intakeCount = 0; // Could be hot symbols count
  const autopsyCount = 0; // Could be missed moves count

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Dock Zone for orbit cards */}
      <DockZone zone="top" />
      
      {/* TOP NEWS DOCK SLOT */}
      {hasTopDocked && (
        <div className="w-full flex gap-3 px-3 pt-2 shrink-0">
          {intakePosition === 'top' && (
            <div className="flex-1 min-w-0 h-[280px]">
              <IntakeWidget 
                dock={intakeDock} 
                onDockChange={handleIntakeDockChange}
                onCollapse={toggleIntakeCollapse}
                onDockToOrbit={dockIntakeToOrbit}
                isInOrbit={false}
              />
            </div>
          )}
          {autopsyPosition === 'top' && (
            <div className="flex-1 min-w-0 h-[280px]">
              <AutopsyWidget 
                dock={autopsyDock} 
                onDockChange={handleAutopsyDockChange}
                onCollapse={toggleAutopsyCollapse}
                onDockToOrbit={dockAutopsyToOrbit}
                isInOrbit={false}
              />
            </div>
          )}
        </div>
      )}
      
      {/* Main Orbit Area - takes remaining space between docks */}
      <div className="flex-1 relative overflow-hidden min-h-0 z-10">
        <OrbitRing />
        
        {/* Intake Widget - LEFT (speculative, forward-looking) */}
        {intakePosition === 'side' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-40 w-[380px] max-w-[28vw] h-[calc(100%-2rem)] max-h-[500px]">
            <IntakeWidget 
              dock={intakeDock} 
              onDockChange={handleIntakeDockChange}
              onCollapse={toggleIntakeCollapse}
              onDockToOrbit={dockIntakeToOrbit}
              isInOrbit={false}
            />
          </div>
        )}
        
        {/* Intake Collapsed Tab */}
        {intakePosition === 'collapsed' && (
          <CollapsedTab
            icon={<Eye className="h-3 w-3" />}
            label="Intake"
            count={intakeCount}
            onClick={toggleIntakeCollapse}
            side="left"
          />
        )}
        
        {/* Autopsy Widget - RIGHT (ground truth, backward-looking) */}
        {autopsyPosition === 'side' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-40 w-[380px] max-w-[28vw] h-[calc(100%-2rem)] max-h-[500px]">
            <AutopsyWidget 
              dock={autopsyDock} 
              onDockChange={handleAutopsyDockChange}
              onCollapse={toggleAutopsyCollapse}
              onDockToOrbit={dockAutopsyToOrbit}
              isInOrbit={false}
            />
          </div>
        )}
        
        {/* Autopsy Collapsed Tab */}
        {autopsyPosition === 'collapsed' && (
          <CollapsedTab
            icon={<Skull className="h-3 w-3" />}
            label="Autopsy"
            count={autopsyCount}
            onClick={toggleAutopsyCollapse}
            side="right"
          />
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
          {intakePosition === 'bottom' && (
            <div className="flex-1 min-w-0 h-[280px]">
              <IntakeWidget 
                dock={intakeDock} 
                onDockChange={handleIntakeDockChange}
                onCollapse={toggleIntakeCollapse}
                onDockToOrbit={dockIntakeToOrbit}
                isInOrbit={false}
              />
            </div>
          )}
          {autopsyPosition === 'bottom' && (
            <div className="flex-1 min-w-0 h-[280px]">
              <AutopsyWidget 
                dock={autopsyDock} 
                onDockChange={handleAutopsyDockChange}
                onCollapse={toggleAutopsyCollapse}
                onDockToOrbit={dockAutopsyToOrbit}
                isInOrbit={false}
              />
            </div>
          )}
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
