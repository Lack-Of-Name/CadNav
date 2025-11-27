import { useMemo, useState } from "react";
import { useCheckpoints } from "../hooks/useCheckpoints.js";
import { encodeLocationCode } from "../utils/routeUtils.js";

const actionButtonBase =
  "rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-800";
const actionButtonActive = "border-sky-500 bg-sky-900 text-sky-100";

const RouteSection = ({
  route,
  isActive,
  onActivate,
  checkpointMap,
  onUpdateRoute,
  onRemoveRoute,
  canRemove,
  selectedId,
  onSelectCheckpoint,
  onMoveCheckpoint,
  onRemoveCheckpoint,
  onAddCheckpoint,
  placementMode,
  onSetPlacementMode
}) => {
  const [isEditingName, setIsEditingName] = useState(false);

  const entries = useMemo(() => {
    return route.items.map((id, index) => {
      const checkpoint = checkpointMap[id];
      if (!checkpoint) return null;
      return {
        type: "checkpoint",
        id: checkpoint.id,
        label: checkpoint.name || `Point ${index + 1}`,
        position: checkpoint.position,
        index,
        callout: encodeLocationCode(checkpoint.position)
      };
    }).filter(Boolean);
  }, [route.items, checkpointMap]);

  const handleDragStart = (entry) => (e) => {
    e.dataTransfer.setData('application/x-cadet-map-checkpoint-id', entry.id);
    e.dataTransfer.effectAllowed = 'move';
    const row = e.target.closest('li');
    if (row) e.dataTransfer.setDragImage(row, 10, 10);
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
    onMoveCheckpoint(draggedId, targetEntry.index);
  };

  const placementType = placementMode?.type ?? null;
  const placementInsertIndex =
    typeof placementMode?.insertIndex === "number" ? placementMode.insertIndex : null;

  const renderActions = (entry) => {
    const isFirst = entry.index === 0;
    const isLast = entry.index === entries.length - 1;
    const isBeforeActive =
      isActive && placementType === "checkpoint" && placementInsertIndex === entry.index;
    const isAfterActive =
      isActive && placementType === "checkpoint" && placementInsertIndex === entry.index + 1;

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${actionButtonBase} ${isBeforeActive ? actionButtonActive : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSetPlacementMode({ type: "checkpoint", insertIndex: entry.index });
          }}
        >
          Insert Before
        </button>
        <button
          type="button"
          className={`${actionButtonBase} ${isAfterActive ? actionButtonActive : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSetPlacementMode({ type: "checkpoint", insertIndex: entry.index + 1 });
          }}
        >
          Insert After
        </button>
        <button
          type="button"
          className="rounded border border-rose-500 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-900 hover:text-rose-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveCheckpoint(entry.id);
          }}
        >
          Remove
        </button>
      </div>
    );
  };

  return (
    <div className={`border-b border-slate-700/50 ${isActive ? 'bg-slate-800/30' : ''}`}>
      <div 
        className="flex cursor-pointer items-center gap-3 p-4 hover:bg-slate-800/50"
        onClick={onActivate}
      >
        <div className={`transition-transform duration-200 ${isActive ? 'rotate-90' : ''}`}>
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        
        <input 
          type="color" 
          value={route.color} 
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdateRoute(route.id, { color: e.target.value })}
          className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Route color"
        />
        
        <div className="flex-1">
          <input 
            type="text" 
            value={route.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onUpdateRoute(route.id, { name: e.target.value })}
            className="w-full bg-transparent text-sm font-medium text-slate-200 placeholder-slate-500 focus:outline-none"
            placeholder="Route Name"
          />
        </div>

        {canRemove && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRemoveRoute(route.id);
            }}
            className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
            title="Delete route"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {isActive && (
        <div className="px-4 pb-4">
          <ul className="space-y-2 text-sm text-slate-200">
            {entries.length === 0 && (
              <li className="text-xs text-slate-500">
                No markers yet. Add one below.
              </li>
            )}
            {entries.map((entry) => (
              <li
                key={entry.id}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDrop={handleDrop(entry)}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 transition ${
                  selectedId === entry.id
                    ? "border-sky-500 bg-sky-900 text-sky-100"
                    : "cursor-pointer border-slate-800 hover:border-slate-600 hover:bg-slate-800"
                }`}
                onClick={() => onSelectCheckpoint(entry.id)}
              >
                <div 
                  draggable="true"
                  onDragStart={handleDragStart(entry)}
                  className="drag-handle mt-1 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded border border-slate-700 bg-slate-800 text-slate-400 touch-none hover:bg-slate-700 hover:text-slate-200 active:cursor-grabbing"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
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
          
          <button
            onClick={onAddCheckpoint}
            style={
              placementType === "checkpoint" && !placementInsertIndex
                ? { borderColor: route.color, color: route.color, backgroundColor: `${route.color}20` }
                : {}
            }
            className={`mt-3 w-full rounded border border-dashed border-slate-600 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800 ${
              placementType === "checkpoint" && !placementInsertIndex ? "" : "hover:border-sky-500 hover:text-sky-400"
            }`}
          >
            + Add Checkpoint
          </button>
        </div>
      )}
    </div>
  );
};

const CheckpointList = ({ onEnterPlacingMode }) => {
  const {
    checkpointMap,
    routes,
    activeRouteId,
    setActiveRoute,
    addRoute,
    removeRoute,
    updateRoute,
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

  const [expandedId, setExpandedId] = useState(activeRouteId);

  const handleToggle = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setActiveRoute(id);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900/95 backdrop-blur-md">
      <div className="flex-1 overflow-y-auto">
        {routes.map(route => (
          <RouteSection
            key={route.id}
            route={route}
            isActive={route.id === expandedId}
            onActivate={() => handleToggle(route.id)}
            checkpointMap={checkpointMap}
            onUpdateRoute={updateRoute}
            onRemoveRoute={removeRoute}
            canRemove={routes.length > 1}
            selectedId={selectedId}
            onSelectCheckpoint={selectCheckpoint}
            onMoveCheckpoint={moveCheckpoint}
            onRemoveCheckpoint={removeCheckpoint}
            onAddCheckpoint={() => {
              setActiveRoute(route.id);
              setPlacementMode({ type: "checkpoint" });
              if (onEnterPlacingMode) onEnterPlacingMode();
            }}
            placementMode={placementMode}
            onSetPlacementMode={setPlacementMode}
          />
        ))}
        
        <div className="p-4">
          <button 
            onClick={() => addRoute()} 
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 py-2 text-sm text-slate-200 hover:border-sky-500 hover:bg-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Route
          </button>
        </div>
      </div>

      <div className="border-t border-slate-700/50 p-4">
        <div className="flex gap-2">
          <button
            onClick={toggleConnectMode}
            className={`flex-1 rounded border border-slate-600 py-2 text-xs font-medium transition ${
              connectVia === "route"
                ? "border-sky-500 bg-sky-900/20 text-sky-400"
                : "text-slate-400 hover:border-sky-500 hover:bg-slate-800 hover:text-sky-400"
            }`}
          >
            {connectVia === "route" ? "Routing: Road" : "Routing: Direct"}
          </button>
        </div>
        <button
          onClick={clearAll}
          className="mt-2 w-full rounded border border-red-900/30 py-2 text-xs font-medium text-red-400 transition hover:bg-red-900/20 hover:text-red-300"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};

export default CheckpointList;
