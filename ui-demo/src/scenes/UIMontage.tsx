import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Card = {
  src: string;
  imgWidth: number;
  imgHeight: number;
  label: string;
  tilt: number;
  panFactor: number;
};

const CARD_W = 520;
const CARD_H = 680;

// The events and blog pages currently render CMS empty states ("No upcoming
// events" / "No stories match"), which read as a dead product on camera —
// so the montage shows the three contentful community pages instead.
const cards: Card[] = [
  {
    src: 'staija_ui_about.png',
    imgWidth: 2560,
    imgHeight: 3986,
    label: '/about',
    tilt: -2.2,
    panFactor: 0.9,
  },
  {
    src: 'staija_ui_get_involved.png',
    imgWidth: 2560,
    imgHeight: 4152,
    label: '/get-involved',
    tilt: 0,
    panFactor: 1,
  },
  {
    src: 'staija_ui_stay_connected.png',
    imgWidth: 2560,
    imgHeight: 4416,
    label: '/stay-connected',
    tilt: 2.2,
    panFactor: 1.1,
  },
];

export const UIMontage: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const contentOp = interpolate(
    frame,
    [0, 10, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: 'var(--color-ink)' }}>
      <div className="absolute inset-0" style={{ opacity: contentOp }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 55% at 50% 45%, rgba(139, 85, 255, 0.22) 0%, rgba(94, 219, 231, 0.08) 55%, transparent 78%)',
          }}
        />

        <div className="absolute left-0 right-0 text-center" style={{ top: 96 }}>
          <p
            className="text-sm font-medium tracking-[0.3em] mb-5"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-brand-sky)',
            }}
          >
            03 — COMMUNITY
          </p>
          <h2
            className="text-7xl font-bold tracking-tight text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Beyond the programs.
          </h2>
        </div>

        <div className="absolute left-0 right-0 flex justify-center gap-10" style={{ top: 360 }}>
          {cards.map((card, i) => {
            const cardIn = spring({
              frame: frame - i * 6,
              fps,
              config: { damping: 100 },
              from: 60,
              to: 0,
            });
            const displayedH = (CARD_W / card.imgWidth) * card.imgHeight;
            const maxScroll = Math.max(0, displayedH - CARD_H);
            const pan = interpolate(
              frame,
              [20, durationInFrames - 25],
              [0, Math.min(maxScroll, 2.2 * card.panFactor * (durationInFrames - 45))],
              {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.inOut(Easing.cubic),
              },
            );
            return (
              <div
                key={card.src}
                style={{
                  transform: `translateY(${cardIn}px) rotate(${card.tilt}deg)`,
                }}
              >
                <div
                  className="shadow-2xl"
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(241, 245, 249, 0.14)',
                    backgroundColor: '#161B22',
                  }}
                >
                  <Img
                    src={staticFile(card.src)}
                    style={{
                      width: CARD_W,
                      display: 'block',
                      transform: `translateY(-${pan}px)`,
                    }}
                  />
                </div>
                <p
                  className="text-center text-base mt-5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'rgba(241, 245, 249, 0.55)',
                  }}
                >
                  staija.org{card.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
