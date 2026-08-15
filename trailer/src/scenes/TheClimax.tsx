import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const TheClimax: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background scales up slightly
  const bgScale = interpolate(frame, [0, 150], [1, 1.1]);

  // Center text
  const textScale = spring({ frame, fps, config: { damping: 100 } });
  
  // Progress rings (using simple SVGs)
  const ring1Prog = spring({ frame: frame - 30, fps, config: { damping: 50 }, from: 0, to: 100 });
  const ring2Prog = spring({ frame: frame - 45, fps, config: { damping: 50 }, from: 0, to: 100 });
  const ring3Prog = spring({ frame: frame - 60, fps, config: { damping: 50 }, from: 0, to: 100 });

  const ring1Scale = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const ring2Scale = spring({ frame: frame - 35, fps, config: { damping: 12 } });
  const ring3Scale = spring({ frame: frame - 50, fps, config: { damping: 12 } });

  const outOp = interpolate(frame, [135, 150], [1, 0], { extrapolateRight: "clamp" });

  interface CircularProgressProps {
    progress: number;
    label: string;
    scale: number;
    color: string;
    x: number;
    y: number;
  }

  const CircularProgress = ({ progress, label, scale, color, x, y }: CircularProgressProps) => (
    <div className="absolute flex flex-col items-center" style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
      <div className="relative w-40 h-40">
        <svg className="w-40 h-40 transform -rotate-90">
          <circle cx="80" cy="80" r="70" stroke="rgba(14, 18, 23, 0.08)" strokeWidth="12" fill="transparent" />
          <circle
            cx="80" cy="80" r="70" stroke={color} strokeWidth="12" fill="transparent"
            strokeDasharray="439.8"
            strokeDashoffset={439.8 - (progress / 100) * 439.8}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[var(--color-ink)] text-3xl font-bold">
          {Math.round(progress)}%
        </div>
      </div>
      <div className="text-[var(--color-ink)] text-xl font-bold mt-4 px-4 py-1 rounded-full backdrop-blur-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}>
        {label}
      </div>
    </div>
  );

  return (
    <AbsoluteFill className="brand-surface flex items-center justify-center overflow-hidden">
      <AbsoluteFill className="flex items-center justify-center overflow-hidden" style={{ opacity: outOp }}>

      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #0E1217 1px, transparent 0)',
          backgroundSize: '40px 40px',
          transform: `scale(${bgScale})`
        }}
      />

      <div className="absolute z-20 text-center" style={{ transform: `scale(${textScale})` }}>
        <h1 className="text-[var(--color-ink)] text-7xl font-black tracking-tighter drop-shadow-2xl" style={{ fontFamily: "var(--font-display)" }}>One Platform.</h1>
        <h2 className="text-gradient-brand text-6xl font-bold mt-2 drop-shadow-2xl" style={{ fontFamily: "var(--font-display)" }}>Endless Possibilities.</h2>
      </div>

      <CircularProgress progress={ring1Prog} scale={ring1Scale} label="Assignments" color="#8B55FF" x={-350} y={-150} />
      <CircularProgress progress={ring2Prog} scale={ring2Scale} label="Sessions" color="#5EDBE7" x={470} y={-130} />
      <CircularProgress progress={ring3Prog} scale={ring3Scale} label="Graduation" color="#6366F1" x={-200} y={200} />

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
