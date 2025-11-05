import { useMemo } from 'react';
import { useCheckpoints } from '../hooks/useCheckpoints.js';

const actionButtonBase =
  'rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-sky-500/10';

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
    removeCheckpoint
  } = useCheckpoints();

  const entries = useMemo(() => {
    const items = [];
    if (start) {
      items.push({ type: 'start', id: 'start', label: 'Start', position: start.position });
    }
    checkpoints.forEach((checkpoint, index) => {
      items.push({
        type: 'checkpoint',
        id: checkpoint.id,
        label: `Checkpoint ${index + 1}`,
        position: checkpoint.position,
        index
      });
    });
    if (end) {
      items.push({ type: 'end', id: 'end', label: 'End', position: end.position });
    }
    return items;
  }, [start, checkpoints, end]);

  const handleAction = (callback) => (event) => {
    event.stopPropagation();
    callback();
  };

  const renderActions = (entry) => {
    if (entry.type === 'checkpoint') {
      const isFirst = entry.index === 0;
      const isLast = entry.index === checkpoints.length - 1;
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={actionButtonBase}
            onClick={handleAction(() => setPlacementMode({ type: 'checkpoint', insertIndex: entry.index }))}
          >
            Add Before
          </button>
          <button
            type="button"
            className={actionButtonBase}
            onClick={handleAction(() => setPlacementMode({ type: 'checkpoint', insertIndex: entry.index + 1 }))}
          >
            Add After
          </button>
          <button
            type="button"
            className={`${actionButtonBase} ${isFirst ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={handleAction(() => moveCheckpoint(entry.id, entry.index - 1))}
            disabled={isFirst}
          >
            Move Up
          </button>
          <button
            type="button"
            className={`${actionButtonBase} ${isLast ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={handleAction(() => moveCheckpoint(entry.id, entry.index + 1))}
            disabled={isLast}
          >
            Move Down
          </button>
          <button
            type="button"
            className="rounded border border-rose-500 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/10"
            onClick={handleAction(() => removeCheckpoint(entry.id))}
          >
            Remove
          </button>
        </div>
      );
    }

    if (entry.type === 'start') {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={actionButtonBase}
            onClick={handleAction(() => setPlacementMode({ type: 'checkpoint', insertIndex: 0 }))}
          >
            Add After Start
          </button>
        </div>
      );
    }

    if (entry.type === 'end') {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={actionButtonBase}
            onClick={handleAction(() => setPlacementMode({ type: 'checkpoint', insertIndex: checkpoints.length }))}
          >
            Add Before End
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-900/70 p-4 shadow-lg shadow-slate-950">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-sky-200">Route Planner</h2>
        <button
          type="button"
          className="rounded-md border border-rose-500 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
          onClick={clearAll}
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => setPlacementMode('start')}
        >
          Set Start
        </button>
        <button
          type="button"
          className="rounded-md border border-sky-500 px-3 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/10"
          onClick={() => setPlacementMode('checkpoint')}
        >
          Add Checkpoint
        </button>
        <button
          type="button"
          className="rounded-md border border-orange-500 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
          onClick={() => setPlacementMode('end')}
        >
          Set End
        </button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
        <span>Connection</span>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700/40"
          onClick={toggleConnectMode}
        >
          {connectVia === 'direct' ? 'Direct Lines' : 'Route Mode'}
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
            className={`rounded-md border px-3 py-2 transition ${
              selectedId === entry.id
                ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                : 'cursor-pointer border-slate-800 hover:border-slate-600 hover:bg-slate-800/40'
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
