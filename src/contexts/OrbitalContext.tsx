import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export interface OrbitalCard {
  id: string;
  title: string;
  type: 'cockpit' | 'drillable';
  drilldownPath?: string;
  component: React.ComponentType<{ compact?: boolean }>;
}

export type DockZone = 'top' | 'bottom' | null;

interface DockState {
  top: string[]; // max 3 card IDs
  bottom: string[]; // max 1 card ID
}

const DOCK_STATE_KEY = 'orbital-dock-state';

function loadDockState(): DockState {
  try {
    const saved = localStorage.getItem(DOCK_STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.top) && Array.isArray(parsed.bottom)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load dock state from localStorage:', e);
  }
  return { top: [], bottom: [] };
}

function saveDockState(state: DockState): void {
  try {
    localStorage.setItem(DOCK_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save dock state to localStorage:', e);
  }
}

interface OrbitalContextValue {
  cards: OrbitalCard[];
  orbitCards: string[];
  dockState: DockState;
  rotationAngle: number;
  isDragging: boolean;
  draggedCardId: string | null;
  hoverZone: DockZone;
  
  setRotationAngle: (angle: number) => void;
  rotateOrbit: (delta: number) => void;
  dockCard: (cardId: string, zone: 'top' | 'bottom') => void;
  undockCard: (cardId: string) => void;
  startDrag: (cardId: string) => void;
  endDrag: () => void;
  setHoverZone: (zone: DockZone) => void;
  getCardById: (id: string) => OrbitalCard | undefined;
  isCardDocked: (cardId: string) => boolean;
}

const OrbitalContext = createContext<OrbitalContextValue | null>(null);

export function useOrbital() {
  const context = useContext(OrbitalContext);
  if (!context) {
    throw new Error('useOrbital must be used within OrbitalProvider');
  }
  return context;
}

interface OrbitalProviderProps {
  children: React.ReactNode;
  cards: OrbitalCard[];
}

const MAX_TOP_DOCK = 3;
const MAX_BOTTOM_DOCK = 1;

export function OrbitalProvider({ children, cards }: OrbitalProviderProps) {
  const [dockState, setDockState] = useState<DockState>(loadDockState);
  const [orbitCards, setOrbitCards] = useState<string[]>(() => {
    const docked = [...dockState.top, ...dockState.bottom];
    return cards.map(c => c.id).filter(id => !docked.includes(id));
  });
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Persist dock state changes
  useEffect(() => {
    saveDockState(dockState);
  }, [dockState]);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<DockZone>(null);

  const rotateOrbit = useCallback((delta: number) => {
    setRotationAngle(prev => prev + delta);
  }, []);

  const dockCard = useCallback((cardId: string, zone: 'top' | 'bottom') => {
    setDockState(prev => {
      const newState = { ...prev };
      
      // Remove from any existing dock
      newState.top = newState.top.filter(id => id !== cardId);
      newState.bottom = newState.bottom.filter(id => id !== cardId);
      
      if (zone === 'top') {
        // If at max capacity, undock oldest
        if (newState.top.length >= MAX_TOP_DOCK) {
          const [oldest, ...rest] = newState.top;
          newState.top = rest;
          // oldest returns to orbit
          setOrbitCards(prev => prev.includes(oldest) ? prev : [...prev, oldest]);
        }
        newState.top = [...newState.top, cardId];
      } else {
        // Bottom dock - max 1
        if (newState.bottom.length >= MAX_BOTTOM_DOCK) {
          const [oldest] = newState.bottom;
          newState.bottom = [];
          setOrbitCards(prev => prev.includes(oldest) ? prev : [...prev, oldest]);
        }
        newState.bottom = [cardId];
      }
      
      return newState;
    });
    
    // Remove from orbit
    setOrbitCards(prev => prev.filter(id => id !== cardId));
  }, []);

  const undockCard = useCallback((cardId: string) => {
    setDockState(prev => ({
      top: prev.top.filter(id => id !== cardId),
      bottom: prev.bottom.filter(id => id !== cardId),
    }));
    setOrbitCards(prev => prev.includes(cardId) ? prev : [...prev, cardId]);
  }, []);

  const startDrag = useCallback((cardId: string) => {
    setIsDragging(true);
    setDraggedCardId(cardId);
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDraggedCardId(null);
    setHoverZone(null);
  }, []);

  const getCardById = useCallback((id: string) => {
    return cards.find(c => c.id === id);
  }, [cards]);

  const isCardDocked = useCallback((cardId: string) => {
    return dockState.top.includes(cardId) || dockState.bottom.includes(cardId);
  }, [dockState]);

  return (
    <OrbitalContext.Provider
      value={{
        cards,
        orbitCards,
        dockState,
        rotationAngle,
        isDragging,
        draggedCardId,
        hoverZone,
        setRotationAngle,
        rotateOrbit,
        dockCard,
        undockCard,
        startDrag,
        endDrag,
        setHoverZone,
        getCardById,
        isCardDocked,
      }}
    >
      {children}
    </OrbitalContext.Provider>
  );
}
