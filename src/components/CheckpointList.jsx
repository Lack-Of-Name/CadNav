import { useMemo } from "react";
import { useCheckpoints } from "../hooks/useCheckpoints.js";

const actionButtonBase =
  "rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-800";
const actionButtonActive = "border-sky-500 bg-sky-900 text-sky-100";

const CheckpointList = () => {
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
    placementMode
  } = useCheckpoints();

  const entries = useMemo(() => {
    const items = [];
    if (start) {
      items.push({ type: "start", id: "start", label: "Start", position: start.position });
    }
    checkpoints.forEach((checkpoint, index) => {
      items.push({
        type: "checkpoint",
        id: checkpoint.id,
        label: `Checkpoint ${index + 1}`,
        position: checkpoint.position,
        index
      });
    });
    if (end) {
      items.push({ type: "end", id: "end", label: "End", position: end.position });
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
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
            placementType === "start"
              ? "border-emerald-500 bg-emerald-900 text-emerald-200"
              : "border-emerald-500 text-emerald-300 hover:bg-emerald-900"
          }`}
          onClick={() => setPlacementMode("start")}
          aria-pressed={placementType === "start"}
        >
          Set Start
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
            placementType === "checkpoint" && placementInsertIndex == null
              ? "border-sky-500 bg-sky-900 text-sky-200"
              : "border-sky-500 text-sky-200 hover:bg-sky-900"
          }`}
          onClick={() => setPlacementMode("checkpoint")}
          aria-pressed={placementType === "checkpoint" && placementInsertIndex == null}
        >
          Add Checkpoint
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
            placementType === "end"
              ? "border-orange-500 bg-orange-900 text-orange-200"
              : "border-orange-500 text-orange-300 hover:bg-orange-900"
          }`}
          onClick={() => setPlacementMode("end")}
          aria-pressed={placementType === "end"}
        >
          Set End
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

      {placementType && (
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
          <span className="font-semibold uppercase tracking-wide text-slate-400">
            Currently placing:
          </span>{" "}
          {placementType === "start"
            ? "Start point"
            : placementType === "end"
              ? "End point"
              : placementInsertIndex != null
                ? `Checkpoint at position ${placementInsertIndex + 1}`
                : "Checkpoint"}
        </div>
      )}

      <ul className="space-y-2 text-sm text-slate-200">
        {entries.length === 0 && (
          <li className="text-xs text-slate-500">
            No markers yet. Use the buttons above to start.
          </li>
        )}
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-md border px-3 py-2 transition ${
              selectedId === entry.id
                ? "border-sky-500 bg-sky-900 text-sky-100"
                : "cursor-pointer border-slate-800 hover:border-slate-600 hover:bg-slate-800"
            }`}
            onClick={() => selectCheckpoint(entry.id)}
          >
            <div className="font-semibold">{entry.label}</div>
            <div className="text-xs text-slate-400">
              {entry.position.lat.toFixed(4)}, {entry.position.lng.toFixed(4)}
            </div>
            {renderActions(entry)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CheckpointList;
