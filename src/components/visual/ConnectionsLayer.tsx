import React from 'react';

export type ConnectionsLayerProps = {
  width: number;
  height: number;
  connections: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>
};

const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({ width, height, connections }) => {
  return (
    <svg width={width} height={height} className="block">
      {connections.map((c, i) => (
        <line
          key={i}
          x1={c.from.x}
          y1={c.from.y}
          x2={c.to.x}
          y2={c.to.y}
          stroke="#2563eb"
          strokeWidth={1.5}
          opacity={0.8}
        />
      ))}
    </svg>
  );
};

export default ConnectionsLayer;
