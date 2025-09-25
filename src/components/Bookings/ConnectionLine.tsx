import { useMemo } from 'react';

interface ConnectionLineProps {
  fromColumn: number;
  toColumn: number;
  fromIndex: number;
  toIndex: number;
  color: 'green' | 'blue' | 'purple';
}

const ConnectionLine = ({ fromColumn, toColumn, fromIndex, toIndex, color }: ConnectionLineProps) => {
  const strokeColor = useMemo(() => {
    switch (color) {
      case 'green':
        return '#10b981'; // green-500
      case 'blue':
        return '#3b82f6'; // blue-500
      case 'purple':
        return '#8b5cf6'; // purple-500
      default:
        return '#6b7280'; // gray-500
    }
  }, [color]);

  // Calculate positions based on grid layout
  const fromX = fromColumn === 1 ? '33.33%' : fromColumn === 2 ? '66.66%' : '100%';
  const toX = toColumn === 2 ? '33.33%' : toColumn === 3 ? '66.66%' : '100%';
  
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <marker
          id={`arrowhead-${color}`}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill={strokeColor}
          />
        </marker>
      </defs>
      
      {/* Connection line */}
      <line
        x1={fromX}
        y1="50%"
        x2={toX}
        y2="50%"
        stroke={strokeColor}
        strokeWidth="2"
        markerEnd={`url(#arrowhead-${color})`}
        className="drop-shadow-sm"
      />
      
      {/* Connection points */}
      <circle
        cx={fromX}
        cy="50%"
        r="4"
        fill={strokeColor}
        className="drop-shadow-sm"
      />
      <circle
        cx={toX}
        cy="50%"
        r="4"
        fill={strokeColor}
        className="drop-shadow-sm"
      />
    </svg>
  );
};

export default ConnectionLine;