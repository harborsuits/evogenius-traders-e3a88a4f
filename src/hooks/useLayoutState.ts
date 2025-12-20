import { useState, useEffect, useCallback } from 'react';

export type Lane = 'orbit' | 'A' | 'B';

export interface LayoutState {
  orbit: string[];
  A: string[];
  B: string[];
}

const STORAGE_KEY = 'commandCenterLayout';

// Default ordering hints (used for first-run only)
const DEFAULT_ORBIT_ORDER = [
  'decision-state',
  'market-conditions', 
  'capital',
  'gen-health',
  'agent-activity',
  'symbol-coverage',
  'trade-cycle',
  'control',
  'polling',
  'catalyst-watch',
  'autopsy',
  'system-audit',
  'activity',
  'positions',
  'agents',
  'generations',
  'alerts',
  'gen-compare',
  'lineage',
  'rollover',
];

function loadLayout(): LayoutState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.orbit && parsed.A && parsed.B) {
        return parsed as LayoutState;
      }
    }
  } catch (e) {
    console.warn('[useLayoutState] Failed to parse stored layout:', e);
  }
  return null;
}

function saveLayout(layout: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch (e) {
    console.warn('[useLayoutState] Failed to save layout:', e);
  }
}

// Validate and repair layout against current card IDs
function validateLayout(layout: LayoutState, allCardIds: string[]): LayoutState {
  const allIdsSet = new Set(allCardIds);
  const assignedIds = new Set<string>();
  
  // Filter out IDs that no longer exist
  const validOrbit = layout.orbit.filter(id => {
    if (allIdsSet.has(id)) {
      assignedIds.add(id);
      return true;
    }
    return false;
  });
  
  const validA = layout.A.filter(id => {
    if (allIdsSet.has(id) && !assignedIds.has(id)) {
      assignedIds.add(id);
      return true;
    }
    return false;
  });
  
  const validB = layout.B.filter(id => {
    if (allIdsSet.has(id) && !assignedIds.has(id)) {
      assignedIds.add(id);
      return true;
    }
    return false;
  });
  
  // Add any new cards not in the saved layout to orbit
  const missingIds = allCardIds.filter(id => !assignedIds.has(id));
  
  return {
    orbit: [...validOrbit, ...missingIds],
    A: validA,
    B: validB,
  };
}

// Create initial layout with all cards in orbit (using default ordering)
function createInitialLayout(allCardIds: string[]): LayoutState {
  // Sort by default order, then append any unknown IDs
  const orderedIds = [...allCardIds].sort((a, b) => {
    const aIndex = DEFAULT_ORBIT_ORDER.indexOf(a);
    const bIndex = DEFAULT_ORBIT_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  return {
    orbit: orderedIds,
    A: [],
    B: [],
  };
}

export function useLayoutState(allCardIds: string[]) {
  const [layout, setLayout] = useState<LayoutState>(() => {
    const stored = loadLayout();
    if (stored) {
      return validateLayout(stored, allCardIds);
    }
    return createInitialLayout(allCardIds);
  });
  
  // Re-validate when card IDs change (new cards added to codebase)
  useEffect(() => {
    setLayout(prev => validateLayout(prev, allCardIds));
  }, [allCardIds.join(',')]);
  
  // Persist on every change
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);
  
  // Move card from one lane to another
  const moveCard = useCallback((cardId: string, fromLane: Lane, toLane: Lane, toIndex?: number) => {
    setLayout(prev => {
      const newLayout = { ...prev };
      
      // Remove from source lane
      newLayout[fromLane] = prev[fromLane].filter(id => id !== cardId);
      
      // Add to target lane at specific index or end
      const targetList = [...newLayout[toLane]];
      const insertIndex = toIndex !== undefined ? toIndex : targetList.length;
      targetList.splice(insertIndex, 0, cardId);
      newLayout[toLane] = targetList;
      
      return newLayout;
    });
  }, []);
  
  // Reorder card within the same lane
  const reorderCard = useCallback((lane: Lane, fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const list = [...prev[lane]];
      const [removed] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, removed);
      return { ...prev, [lane]: list };
    });
  }, []);
  
  // Reset layout (all cards back to orbit)
  const resetLayout = useCallback(() => {
    setLayout(createInitialLayout(allCardIds));
  }, [allCardIds]);
  
  // Return card to orbit
  const returnToOrbit = useCallback((cardId: string, fromLane: Lane) => {
    if (fromLane === 'orbit') return;
    moveCard(cardId, fromLane, 'orbit');
  }, [moveCard]);
  
  return {
    layout,
    moveCard,
    reorderCard,
    resetLayout,
    returnToOrbit,
  };
}
