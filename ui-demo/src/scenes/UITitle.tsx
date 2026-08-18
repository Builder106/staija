import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const UITitle: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const contentOp = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const y = spring({ frame, fps, config: { damping: 100 }, from: 24, to: 0 });
  const eyebrowOp = interpolate(frame, [8, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill className="bg-gradient-hero">
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ opacity: contentOp }}
      >
        <p
          className="text-lg font-medium tracking-[0.4em] mb-8 text-white/80"
          style={{ fontFamily: 'var(--font-mono)', opacity: eyebrowOp }}
        >
          UI TOUR
        </p>
        <h1
          className="text-9xl font-bold tracking-tighter text-white text-center"
          style={{
            fontFamily: 'var(--font-display)',
            transform: `translateY(${y}px)`,
          }}
        >
          STAIJA, up close.
        </h1>
        <p className="text-3xl mt-10 text-white/85" style={{ fontFamily: 'var(--font-sans)' }}>
          A walk through staija.org
        </p>
      </div>
    </AbsoluteFill>
  );
};
