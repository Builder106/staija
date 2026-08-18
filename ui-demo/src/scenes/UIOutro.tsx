import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const UIOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOp = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const logoScale = spring({ frame, fps, config: { damping: 100 } });

  const textOp = interpolate(frame, [40, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textY = spring({
    frame: frame - 40,
    fps,
    config: { damping: 100 },
    from: 20,
    to: 0,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'var(--color-ink)' }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          style={{
            opacity: logoOp,
            transform: `scale(${logoScale})`,
            marginBottom: 40,
          }}
        >
          <div
            className="w-[360px] h-[360px] bg-gradient-brand flex items-center justify-center shadow-2xl"
            style={{ borderRadius: 36 }}
          >
            <h1
              className="text-6xl font-black text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              STAIJA
            </h1>
          </div>
        </div>

        <div
          className="text-center"
          style={{
            position: 'absolute',
            bottom: 150,
            width: '100%',
            opacity: textOp,
            transform: `translateY(${textY}px)`,
          }}
        >
          <p
            className="text-white/80 text-3xl font-medium tracking-wide"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            See it live.
          </p>
          <p
            className="text-gradient-brand text-4xl font-bold mt-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            staija.org
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
