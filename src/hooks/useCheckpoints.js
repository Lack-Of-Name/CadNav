import { create } from 'zustand';

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const initialState = {
  start: null,
  end: null,
  checkpoints: [],
  selectedId: null,
  connectVia: 'direct',
  placementMode: null
};

const setSelectedId = (state, fallbackId) => ({
  ...state,
  selectedId: fallbackId ?? state.selectedId
});

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
  setPlacementMode: (mode) => set({ placementMode: normalizePlacementMode(mode) }),
  toggleConnectMode: () =>
    set((state) => ({
      connectVia: state.connectVia === 'direct' ? 'route' : 'direct'
    })),
  setStart: (position) =>
    set((state) => ({
      start: { id: 'start', position },
      placementMode: null,
      selectedId: 'start',
      checkpoints: state.checkpoints
    })),
  setEnd: (position) =>
    set((state) => ({
      end: { id: 'end', position },
      placementMode: null,
      selectedId: 'end',
      checkpoints: state.checkpoints
    })),
  addCheckpoint: (position, insertIndex) =>
    set((state) => {
      const newCheckpoint = {
        id: createId('checkpoint'),
        position
      };
      const checkpoints = Array.isArray(state.checkpoints) ? [...state.checkpoints] : [];
      if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= checkpoints.length) {
        checkpoints.splice(insertIndex, 0, newCheckpoint);
      } else {
        checkpoints.push(newCheckpoint);
      }
      return {
        checkpoints,
        placementMode: null,
        selectedId: newCheckpoint.id
      };
    }),
  selectCheckpoint: (id) => set({ selectedId: id }),
  updateCheckpoint: (id, position) =>
    set((state) => ({
      checkpoints: state.checkpoints.map((checkpoint) =>
        checkpoint.id === id ? { ...checkpoint, position } : checkpoint
      )
    })),
  moveCheckpoint: (id, targetIndex) =>
    set((state) => {
      const checkpoints = Array.isArray(state.checkpoints) ? [...state.checkpoints] : [];
      const currentIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === id);
      if (currentIndex === -1 || typeof targetIndex !== 'number') {
        return state;
      }
      if (targetIndex < 0 || targetIndex >= checkpoints.length || targetIndex === currentIndex) {
        return state;
      }
      const [checkpoint] = checkpoints.splice(currentIndex, 1);
      checkpoints.splice(targetIndex, 0, checkpoint);
      return {
        checkpoints
      };
    }),
  removeCheckpoint: (id) =>
    set((state) => {
      const checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.id !== id);
      const selectedId = state.selectedId === id ? null : state.selectedId;
      return {
        checkpoints,
        selectedId,
        placementMode: null
      };
    }),
  clearAll: () => set(initialState)
}));

export const useCheckpoints = () => useCheckpointsStore((state) => state);
