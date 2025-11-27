import { create } from 'zustand';
import { normaliseRouteShareSnapshot, ROUTE_SHARE_VERSION } from '../utils/routeUtils.js';

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const DEFAULT_ROUTE_COLOR = '#38bdf8';

const initialState = {
  checkpointMap: {}, // { [id]: { id, position } }
  routes: [
    {
      id: 'route-1',
      name: 'Route 1',
      color: DEFAULT_ROUTE_COLOR,
      items: [], // List of checkpoint IDs
      isVisible: true,
      nextLabelIndex: 1
    }
  ],
  activeRouteId: 'route-1',
  selectedId: null,
  connectVia: 'direct',
  placementMode: null
};

const normalizePlacementMode = (mode) => {
  if (mode == null) return null;
  if (typeof mode === 'string') {
    return { type: mode };
  }
  if (typeof mode === 'object' && typeof mode.type === 'string') {
    return mode;
  }
  return null;
};

export const useCheckpointsStore = create((set, get) => ({
  ...initialState,

  // --- Route Management ---

  addRoute: (name = 'New Route', color = DEFAULT_ROUTE_COLOR) =>
    set((state) => {
      const newRoute = {
        id: createId('route'),
        name,
        color,
        items: [],
        isVisible: true,
        nextLabelIndex: 1
      };
      return {
        routes: [...state.routes, newRoute],
        activeRouteId: newRoute.id
      };
    }),

  removeRoute: (routeId) =>
    set((state) => {
      if (state.routes.length <= 1) return state; // Prevent removing last route
      const newRoutes = state.routes.filter((r) => r.id !== routeId);
      const newActiveId =
        state.activeRouteId === routeId ? newRoutes[0].id : state.activeRouteId;
      
      // Cleanup orphaned checkpoints
      const usedCheckpointIds = new Set(newRoutes.flatMap((r) => r.items));
      const newCheckpointMap = {};
      Object.values(state.checkpointMap).forEach((cp) => {
        if (usedCheckpointIds.has(cp.id)) {
          newCheckpointMap[cp.id] = cp;
        }
      });

      return {
        routes: newRoutes,
        activeRouteId: newActiveId,
        checkpointMap: newCheckpointMap,
        selectedId: state.selectedId // Keep selected if it still exists, else it might be invalid but that's handled by UI
      };
    }),

  setActiveRoute: (routeId) =>
    set((state) => ({
      activeRouteId: state.routes.find((r) => r.id === routeId) ? routeId : state.activeRouteId
    })),

  updateRoute: (routeId, updates) =>
    set((state) => ({
      routes: state.routes.map((r) => (r.id === routeId ? { ...r, ...updates } : r))
    })),

  // --- Checkpoint Management ---

  setPlacementMode: (mode) =>
    set((state) => {
      const normalized = normalizePlacementMode(mode);
      if (!normalized) {
        return { placementMode: null };
      }
      const current = normalizePlacementMode(state.placementMode);
      if (
        current?.type === normalized.type &&
        (current?.insertIndex ?? null) === (normalized?.insertIndex ?? null)
      ) {
        return { placementMode: null };
      }
      return { placementMode: normalized };
    }),

  toggleConnectMode: () =>
    set((state) => ({
      connectVia: state.connectVia === 'direct' ? 'route' : 'direct'
    })),

  addCheckpoint: (position, insertIndex) =>
    set((state) => {
      const activeRoute = state.routes.find((r) => r.id === state.activeRouteId);
      if (!activeRoute) return state;

      const nextLabelIndex =
        typeof activeRoute.nextLabelIndex === 'number'
          ? activeRoute.nextLabelIndex
          : (activeRoute.items?.length ?? 0) + 1;

      const newCheckpoint = {
        id: createId('checkpoint'),
        position,
        name: `Point ${nextLabelIndex}`
      };

      const newCheckpointMap = { ...state.checkpointMap, [newCheckpoint.id]: newCheckpoint };
      
      const newItems = [...activeRoute.items];
      if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= newItems.length) {
        newItems.splice(insertIndex, 0, newCheckpoint.id);
      } else {
        newItems.push(newCheckpoint.id);
      }

      const updatedRoute = {
        ...activeRoute,
        items: newItems,
        nextLabelIndex: nextLabelIndex + 1
      };

      const newRoutes = state.routes.map((r) =>
        r.id === state.activeRouteId ? updatedRoute : r
      );

      return {
        checkpointMap: newCheckpointMap,
        routes: newRoutes,
        placementMode: null,
        selectedId: newCheckpoint.id
      };
    }),

  selectCheckpoint: (id) => set({ selectedId: id }),

  updateCheckpoint: (id, position) =>
    set((state) => ({
      checkpointMap: {
        ...state.checkpointMap,
        [id]: { ...state.checkpointMap[id], position }
      }
    })),

  moveCheckpoint: (id, targetIndex) =>
    set((state) => {
      const activeRoute = state.routes.find((r) => r.id === state.activeRouteId);
      if (!activeRoute) return state;

      const currentIndex = activeRoute.items.indexOf(id);
      if (currentIndex === -1 || typeof targetIndex !== 'number') return state;
      
      const newItems = [...activeRoute.items];
      if (targetIndex < 0 || targetIndex >= newItems.length || targetIndex === currentIndex) {
        return state;
      }

      // Remove from old position
      newItems.splice(currentIndex, 1);
      // Insert at new position
      newItems.splice(targetIndex, 0, id);

      return {
        routes: state.routes.map((r) =>
          r.id === state.activeRouteId ? { ...r, items: newItems } : r
        )
      };
    }),

  removeCheckpoint: (id) =>
    set((state) => {
      // Remove from active route only? Or all routes?
      // User said "Some checkpoints should be able to be used for multiple routes".
      // If I click delete on a checkpoint in the list, I expect it to be removed from THAT route.
      
      const activeRoute = state.routes.find((r) => r.id === state.activeRouteId);
      if (!activeRoute) return state;

      // If the ID is not in the active route, maybe we are trying to delete it from the map?
      // But usually we delete from the list.
      // If we delete from the map (e.g. clicking the marker and hitting delete), we should probably remove it from ALL routes.
      // But for now, let's assume we are removing from the active route context.
      
      // Wait, if I select a checkpoint on the map, I don't know which route context I'm in unless I check.
      // If I click "Delete" while a checkpoint is selected, it should probably remove it from the active route if present.
      
      const isInActiveRoute = activeRoute.items.includes(id);
      
      let newRoutes = state.routes;
      
      if (isInActiveRoute) {
        newRoutes = state.routes.map(r => {
          if (r.id === state.activeRouteId) {
            return { ...r, items: r.items.filter(itemId => itemId !== id) };
          }
          return r;
        });
      } else {
        // If not in active route, maybe remove from all routes?
        // Or just do nothing?
        // Let's remove from all routes to be safe if it was triggered globally.
        newRoutes = state.routes.map(r => ({
          ...r,
          items: r.items.filter(itemId => itemId !== id)
        }));
      }

      // Cleanup orphans
      const usedCheckpointIds = new Set(newRoutes.flatMap((r) => r.items));
      const newCheckpointMap = {};
      Object.values(state.checkpointMap).forEach((cp) => {
        if (usedCheckpointIds.has(cp.id)) {
          newCheckpointMap[cp.id] = cp;
        }
      });

      return {
        routes: newRoutes,
        checkpointMap: newCheckpointMap,
        selectedId: state.selectedId === id ? null : state.selectedId,
        placementMode: null
      };
    }),

  loadRouteSnapshot: (snapshot) =>
    set((state) => {
      const normalised = normaliseRouteShareSnapshot(snapshot);
      if (!normalised) return state;

      // Reconstruct state from snapshot
      const newCheckpointMap = {};
      const snapshotCheckpoints = normalised.checkpoints || [];
      
      // Create IDs for all snapshot checkpoints
      // We need to map indices to IDs
      const indexToId = snapshotCheckpoints.map((pos, index) => {
        const id = createId('checkpoint');
        newCheckpointMap[id] = { id, position: pos, name: `Point ${index + 1}` };
        return id;
      });

      const newRoutes = normalised.routes.map((r) => {
        const items = r.indices.map((idx) => indexToId[idx]).filter(Boolean);
        return {
          id: createId('route'),
          name: r.name,
          color: r.color,
          isVisible: r.isVisible,
          items,
          nextLabelIndex: items.length + 1
        };
      });

      // If no routes (shouldn't happen with V3 normalizer), create default
      if (newRoutes.length === 0) {
        const routeId = createId('route');
        newRoutes.push({
          id: routeId,
          name: 'Route 1',
          color: DEFAULT_ROUTE_COLOR,
          items: indexToId,
          isVisible: true,
          nextLabelIndex: indexToId.length + 1
        });
      }

      return {
        ...initialState,
        connectVia: normalised.connectVia,
        checkpointMap: newCheckpointMap,
        routes: newRoutes,
        activeRouteId: newRoutes[0].id,
        selectedId: null,
        placementMode: null
      };
    }),

  clearAll: () => set(initialState),

  swapCheckpoints: (id1, id2) =>
    set((state) => {
      // Swap in active route
      const activeRoute = state.routes.find((r) => r.id === state.activeRouteId);
      if (!activeRoute) return state;

      const idx1 = activeRoute.items.indexOf(id1);
      const idx2 = activeRoute.items.indexOf(id2);

      if (idx1 === -1 || idx2 === -1) return state;

      const newItems = [...activeRoute.items];
      newItems[idx1] = id2;
      newItems[idx2] = id1;

      return {
        routes: state.routes.map((r) =>
          r.id === state.activeRouteId ? { ...r, items: newItems } : r
        )
      };
    })
}));

// Selector to maintain backward compatibility where possible
export const useCheckpoints = () => useCheckpointsStore((state) => {
  // Ensure we have valid state structure (handle migration/fallback)
  const routes = Array.isArray(state.routes) ? state.routes : initialState.routes;
  const checkpointMap = state.checkpointMap || initialState.checkpointMap;
  const activeRouteId = state.activeRouteId || initialState.activeRouteId;

  const activeRoute = routes.find(r => r.id === activeRouteId) || routes[0];
  const activeCheckpoints = activeRoute ? activeRoute.items.map(id => checkpointMap[id]).filter(Boolean) : [];
  
  return {
    ...state,
    routes,
    checkpointMap,
    activeRouteId,
    checkpoints: activeCheckpoints, // Derived property for UI components that expect a list
    activeRoute
  };
});
