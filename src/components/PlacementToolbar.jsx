import React, { useRef } from 'react';
import { useCheckpoints } from '../hooks/useCheckpoints.js';

const DraggableBox = ({ type, color }) => {
  const dragImageRef = useRef(null);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/x-cadet-map-item', type);
    e.dataTransfer.effectAllowed = 'copy';
    
    if (dragImageRef.current) {
      e.dataTransfer.setDragImage(dragImageRef.current, 10, 20);
    }
  };

  const style = {
    borderColor: color,
    backgroundColor: `${color}33`, // 20% opacity approx
  };

  const dotStyle = {
    backgroundColor: color
  };

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        className="flex h-16 w-16 cursor-grab items-center justify-center rounded-full border-2 shadow-lg backdrop-blur-sm transition hover:scale-110 active:cursor-grabbing active:scale-95 touch-none"
        style={style}
      >
        <div className="h-4 w-4 rounded-full" style={dotStyle} />
      </div>
      
      {/* Hidden drag image */}
      <div 
        ref={dragImageRef} 
        className="absolute -top-[1000px] left-0 h-5 w-5 rounded-full border-2"
        style={style}
      />
    </>
  );
};

const PlacementToolbar = () => {
  const { routes, activeRouteId } = useCheckpoints();
  const activeRoute = routes.find(r => r.id === activeRouteId) || routes[0];
  const color = activeRoute?.color || '#38bdf8';

  return (
    <div className="pointer-events-auto flex gap-6 p-4">
      <DraggableBox 
        type="checkpoint" 
        color={color}
      />
    </div>
  );
};

export default PlacementToolbar;
