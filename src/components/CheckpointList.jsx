import { useMemo } from "react";
import { useCheckpoints } from "../hooks/useCheckpoints.js";
import { encodeLocationCode } from "../utils/routeUtils.js";

const actionButtonBase =
  "rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-800";
const actionButtonActive = "border-sky-500 bg-sky-900 text-sky-100";

const CheckpointList = ({ onEnterPlacingMode }) => {
  const {
    start,
    end,
    checkpoints,
    selectedId,
    selectCheckpoint,
    connectVia,
    toggleConnectMode,
    clearAll,
    setPlacementMode,
    moveCheckpoint,
    removeCheckpoint,
    placementMode,
    swapCheckpoints
  } = useCheckpoints();

  const handleDragStart = (entry) => (e) => {
    // Only allow drag if the handle was touched/clicked
    if (!e.target.closest('.drag-handle')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/x-cadet-map-checkpoint-id', entry.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetEntry) => (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-cadet-map-checkpoint-id');
    if (!draggedId || draggedId === targetEntry.id) return;
    
    // If we have swapCheckpoints, use it for any swap
    if (swapCheckpoints) {
      swapCheckpoints(draggedId, targetEntry.id);
      return;
    }

    // Fallback for old behavior (only checkpoints)
    if (targetEntry.type !== 'checkpoint') return;
    moveCheckpoint(draggedId, targetEntry.index);
  };

  const entries = useMemo(() => {
    const items = [];
    if (start) {
      items.push({
        type: "start",
        id: "start",
        label: "Start",
        position: start.position,
        callout: encodeLocationCode(start.position)
      });
    }
    checkpoints.forEach((checkpoint, index) => {
      items.push({
        type: "checkpoint",
        id: checkpoint.id,
        label: `Checkpoint ${index + 1}`,
        position: checkpoint.position,
        index,
        callout: encodeLocationCode(checkpoint.position)
      });
    });
    if (end) {
      items.push({
        type: "end",
        id: "end",
        label: "End",
        position: end.position,
        callout: encodeLocationCode(end.position)
      });
    }
    return items;
  }, [start, checkpoints, end]);

  const placementType = placementMode?.type ?? null;
  const placementInsertIndex =
    typeof placementMode?.insertIndex === "number" ? placementMode.insertIndex : null;

  const handleAction = (callback) => (event) => {
    event.stopPropagation();
    callback();
  };

  const renderActions = (entry) => {
    if (entry.type === "checkpoint") {
      const isFirst = entry.index === 0;
      const isLast = entry.index === checkpoints.length - 1;
      const isBeforeActive =
        placementType === "checkpoint" && placementInsertIndex === entry.index;
      const isAfterActive =
        placementType === "checkpoint" && placementInsertIndex === entry.index + 1;
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${actionButtonBase} ${isBeforeActive ? actionButtonActive : ""}`}
            onClick={handleAction(() => setPlacementMode({ type: "checkpoint", insertIndex: entry.index }))}
          >
            Add Before
          </button>
          <button
            type="button"
            className={`${actionButtonBase} ${isAfterActive ? actionButtonActive : ""}`}
            onClick={handleAction(() => setPlacementMode({ type: "checkpoint", insertIndex: entry.index + 1 }))}
          >
            Add After
          </button>
          <button
            type="button"
            className={`${actionButtonBase} ${isFirst ? "opacity-40 pointer-events-none" : ""}`}
            onClick={handleAction(() => moveCheckpoint(entry.id, entry.index - 1))}
            disabled={isFirst}
          >
            Move Up
          </button>
          <button
            type="button"
            className={`${actionButtonBase} ${isLast ? "opacity-40 pointer-events-none" : ""}`}
            onClick={handleAction(() => moveCheckpoint(entry.id, entry.index + 1))}
            disabled={isLast}
          >
            Move Down
          </button>
          <button
            type="button"
            className="rounded border border-rose-500 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-900 hover:text-rose-100"
            onClick={handleAction(() => removeCheckpoint(entry.id))}
          >
            Remove
          </button>
        </div>
      );
    }

    if (entry.type === "start") {
      const isAfterStartActive =
        placementType === "checkpoint" && placementInsertIndex === 0;
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${actionButtonBase} ${isAfterStartActive ? actionButtonActive : ""}`}
            onClick={handleAction(() => setPlacementMode({ type: "checkpoint", insertIndex: 0 }))}
          >
            Add After Start
          </button>
        </div>
      );
    }

    if (entry.type === "end") {
      const isBeforeEndActive =
        placementType === "checkpoint" && placementInsertIndex === checkpoints.length;
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${actionButtonBase} ${isBeforeEndActive ? actionButtonActive : ""}`}
            onClick={handleAction(() => setPlacementMode({ type: "checkpoint", insertIndex: checkpoints.length }))}
          >
            Add Before End
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-900 p-4 shadow-lg shadow-slate-950">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-sky-200">Route Planner</h2>
        <button
          type="button"
          className="rounded-md border border-rose-500 px-2 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-900 hover:text-rose-100"
          onClick={clearAll}
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="w-full rounded-md border border-purple-500 bg-purple-900/20 px-3 py-2 text-sm font-bold text-purple-200 transition hover:bg-purple-900/40 hover:text-purple-100"
          onClick={onEnterPlacingMode}
        >
          Place Checkpoints
        </button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
        <span>Connection</span>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          onClick={toggleConnectMode}
        >
          {connectVia === "direct" ? "Direct Lines" : "Route Mode"}
        </button>
      </div>

      <ul className="space-y-2 text-sm text-slate-200">
        {entries.length === 0 && (
          <li className="text-xs text-slate-500">
            No markers yet. Use the buttons above to start.
          </li>
        )}
        {entries.map((entry) => (
          <li
            key={entry.id}
            draggable
            onDragStart={handleDragStart(entry)}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleDrop(entry)}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 transition touch-none ${
              selectedId === entry.id
                ? "border-sky-500 bg-sky-900 text-sky-100"
                : "cursor-pointer border-slate-800 hover:border-slate-600 hover:bg-slate-800"
            }`}
            onClick={() => selectCheckpoint(entry.id)}
          >
            <div className="drag-handle mt-1 cursor-grab p-1 text-slate-500 hover:text-slate-300 active:cursor-grabbing">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11.5 15.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold">{entry.label}</div>
              <div className="text-xs text-slate-400">
                {entry.position.lat.toFixed(4)}, {entry.position.lng.toFixed(4)}
              </div>
              {entry.callout && (
                <div className="text-[11px] font-mono uppercase text-amber-300">
                  Callout: {entry.callout}
                </div>
              )}
              {renderActions(entry)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CheckpointList;
