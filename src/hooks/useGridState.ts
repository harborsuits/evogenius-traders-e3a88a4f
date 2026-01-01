import { useState, useEffect, useCallback } from 'react';

// Grid placement: each cell can be empty or have a card
export interface GridPlacement {
  [position: string]: string | null; // position = "row-col" e.g. "0-A", "1-B"
}

interface GridState {
  orbitIds: string[]; // cards not placed
  placements: GridPlacement; // placed cards
  rowCount: number;
}

const STORAGE_KEY = 'dashboardGridState';
const MIN_ROWS = 3; // Always show at least 3 rows

// Default ordering for orbit
const DEFAULT_ORBIT_ORDER = [
  'decision-state',
  'market-conditions',
  'live-proof',
  'capital',
  'gen-health',
  'agent-activity',
  'symbol-coverage',
  'trade-cycle',
  'control',
  'live-brain',
  'pipeline-health',
  'risk-state',
  'polling',
  'vitals',
  'shadow-trading',
  'catalyst-watch',
  'autopsy',
  'regime-history',
  'system-audit',
  'elite-rotation',
  'activity',
  'positions',
  'agents',
  'generations',
  'alerts',
  'gen-compare',
  'lineage',
  'rollover',
];

function loadState(): GridState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as GridState;
    }
  } catch (e) {
    console.warn('[useGridState] Failed to parse stored state:', e);
  }
  return null;
}

function saveState(state: GridState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[useGridState] Failed to save state:', e);
  }
}

function createInitialState(allCardIds: string[]): GridState {
  // Sort by default order
  const orderedIds = [...allCardIds].sort((a, b) => {
    const aIndex = DEFAULT_ORBIT_ORDER.indexOf(a);
    const bIndex = DEFAULT_ORBIT_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  return {
    orbitIds: orderedIds,
    placements: {},
    rowCount: MIN_ROWS,
  };
}

function validateState(state: GridState, allCardIds: string[]): GridState {
  const allIdsSet = new Set(allCardIds);
  const placedIds = new Set<string>();
  
  // Validate placements - remove cards that no longer exist
  const validPlacements: GridPlacement = {};
  for (const [pos, cardId] of Object.entries(state.placements)) {
    if (cardId && allIdsSet.has(cardId)) {
      validPlacements[pos] = cardId;
      placedIds.add(cardId);
    }
  }
  
  // Validate orbit - keep only existing cards not placed
  const validOrbit = state.orbitIds.filter(id => allIdsSet.has(id) && !placedIds.has(id));
  
  // Add any new cards to orbit
  const missingIds = allCardIds.filter(id => !placedIds.has(id) && !validOrbit.includes(id));
  
  return {
    orbitIds: [...validOrbit, ...missingIds],
    placements: validPlacements,
    rowCount: Math.max(state.rowCount, MIN_ROWS),
  };
}

export function useGridState(allCardIds: string[]) {
  const [state, setState] = useState<GridState>(() => {
    const stored = loadState();
    if (stored) {
      return validateState(stored, allCardIds);
    }
    return createInitialState(allCardIds);
  });
  
  const [armedSlot, setArmedSlot] = useState<string | null>(null);
  
  // Re-validate when card IDs change
  useEffect(() => {
    setState(prev => validateState(prev, allCardIds));
  }, [allCardIds.join(',')]);
  
  // Persist on change
  useEffect(() => {
    saveState(state);
  }, [state]);
  
  // Get position string
  const getPosition = (row: number, col: 'A' | 'B') => `${row}-${col}`;
  
  // Place a card from orbit into a slot
  const placeCard = useCallback((cardId: string, row: number, col: 'A' | 'B') => {
    const position = getPosition(row, col);
    setState(prev => {
      // Remove from orbit
      const newOrbit = prev.orbitIds.filter(id => id !== cardId);
      // Place in grid
      const newPlacements = { ...prev.placements, [position]: cardId };
      // Expand rows if needed
      const newRowCount = Math.max(prev.rowCount, row + 2);
      
      return {
        orbitIds: newOrbit,
        placements: newPlacements,
        rowCount: newRowCount,
      };
    });
    setArmedSlot(null);
  }, []);
  
  // Remove a card from grid back to orbit
  const removeCard = useCallback((row: number, col: 'A' | 'B') => {
    const position = getPosition(row, col);
    setState(prev => {
      const cardId = prev.placements[position];
      if (!cardId) return prev;
      
      // Remove from placements
      const newPlacements = { ...prev.placements };
      delete newPlacements[position];
      
      // Add back to orbit
      return {
        ...prev,
        orbitIds: [...prev.orbitIds, cardId],
        placements: newPlacements,
      };
    });
  }, []);
  
  // Find first empty slot (left-to-right, top-to-bottom)
  const findFirstEmptySlot = useCallback((): { row: number; col: 'A' | 'B' } | null => {
    for (let row = 0; row < state.rowCount + 1; row++) {
      for (const col of ['A', 'B'] as const) {
        const pos = getPosition(row, col);
        if (!state.placements[pos]) {
          return { row, col };
        }
      }
    }
    // Append new row
    return { row: state.rowCount, col: 'A' };
  }, [state.rowCount, state.placements]);
  
  // Arm a slot for placement
  const armSlot = useCallback((row: number, col: 'A' | 'B') => {
    setArmedSlot(getPosition(row, col));
  }, []);
  
  // Clear armed slot
  const clearArmedSlot = useCallback(() => {
    setArmedSlot(null);
  }, []);
  
  // Place card into armed slot (or first empty)
  const placeIntoArmedOrFirst = useCallback((cardId: string) => {
    if (armedSlot) {
      const [rowStr, col] = armedSlot.split('-');
      placeCard(cardId, parseInt(rowStr), col as 'A' | 'B');
    } else {
      const empty = findFirstEmptySlot();
      if (empty) {
        placeCard(cardId, empty.row, empty.col);
      }
    }
  }, [armedSlot, placeCard, findFirstEmptySlot]);
  
  // Reset to initial state
  const reset = useCallback(() => {
    setState(createInitialState(allCardIds));
    setArmedSlot(null);
  }, [allCardIds]);
  
  // Get card at position
  const getCardAt = useCallback((row: number, col: 'A' | 'B'): string | null => {
    return state.placements[getPosition(row, col)] || null;
  }, [state.placements]);
  
  // Check if position is armed
  const isArmed = useCallback((row: number, col: 'A' | 'B'): boolean => {
    return armedSlot === getPosition(row, col);
  }, [armedSlot]);
  
  return {
    orbitIds: state.orbitIds,
    placements: state.placements,
    rowCount: state.rowCount,
    armedSlot,
    placeCard,
    removeCard,
    armSlot,
    clearArmedSlot,
    placeIntoArmedOrFirst,
    reset,
    getCardAt,
    isArmed,
    findFirstEmptySlot,
  };
}
