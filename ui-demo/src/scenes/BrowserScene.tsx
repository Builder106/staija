import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type BrowserSceneProps = {
  src: string;
  /** Source image size (all captures are 2560 wide) */
  imgWidth: number;
  imgHeight: number;
  urlPath: string;
  eyebrow: string;
  heading: React.ReactNode;
  blurb: string;
  durationInFrames: number;
};

const CHROME_W = 1150;
const VIEWPORT_H = 880;
const PAN_PX_PER_FRAME = 3.2;

export const BrowserScene: React.FC<BrowserSceneProps> = ({
  src,
  imgWidth,
  imgHeight,
  urlPath,
  eyebrow,
  heading,
  blurb,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene enters/exits by fading an inner wrapper over the solid backdrop —
  // never the AbsoluteFill itself, or the cut composites over encoder black.
  const contentOp = interpolate(
    frame,
    [0, 10, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const displayedH = (CHROME_W / imgWidth) * imgHeight;
  const maxScroll = Math.max(0, displayedH - VIEWPORT_H);
  const panDistance = Math.min(
    maxScroll,
    PAN_PX_PER_FRAME * (durationInFrames - 40),
  );
  const pan = interpolate(
    frame,
    [15, durationInFrames - 25],
    [0, panDistance],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );

  const copyY = spring({
    frame,
    fps,
    config: { damping: 100 },
    from: 24,
    to: 0,
  });
  const chromeY = spring({
    frame: frame - 4,
    fps,
    config: { damping: 100 },
    from: 40,
    to: 0,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "var(--color-ink)" }}>
      <div
        className="absolute inset-0 flex items-center"
        style={{ opacity: contentOp }}
      >
        {/* Soft brand glow behind the chrome card */}
        <div
          className="absolute"
          style={{
            right: 40,
            top: 60,
            width: 1200,
            height: 960,
            background:
              "radial-gradient(50% 50% at 60% 40%, rgba(139, 85, 255, 0.28) 0%, rgba(94, 219, 231, 0.12) 55%, transparent 75%)",
            filter: "blur(20px)",
          }}
        />

        {/* Left column: scene copy */}
        <div
          style={{
            width: 620,
            paddingLeft: 96,
            transform: `translateY(${copyY}px)`,
          }}
        >
          <p
            className="text-sm font-medium tracking-[0.3em] mb-6"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-brand-sky)",
            }}
          >
            {eyebrow}
          </p>
          <h2
            className="text-7xl font-bold tracking-tight text-white leading-[1.05]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {heading}
          </h2>
          <p
            className="text-2xl mt-8 leading-relaxed"
            style={{
              color: "rgba(241, 245, 249, 0.72)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {blurb}
          </p>
        </div>

        {/* Right column: browser chrome with slow vertical pan */}
        <div
          className="absolute shadow-2xl"
          style={{
            right: 96,
            top: "50%",
            transform: `translateY(-50%) translateY(${chromeY}px)`,
            width: CHROME_W,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(241, 245, 249, 0.14)",
            backgroundColor: "#161B22",
          }}
        >
          <div
            className="flex items-center gap-3"
            style={{
              height: 52,
              paddingLeft: 20,
              paddingRight: 20,
              borderBottom: "1px solid rgba(241, 245, 249, 0.1)",
            }}
          >
            <div className="flex gap-2">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: "#FF5F57",
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: "#FEBC2E",
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: "#28C840",
                }}
              />
            </div>
            <div
              className="flex-1 text-center text-sm"
              style={{
                fontFamily: "var(--font-mono)",
                color: "rgba(241, 245, 249, 0.6)",
                backgroundColor: "rgba(241, 245, 249, 0.07)",
                borderRadius: 8,
                paddingTop: 5,
                paddingBottom: 5,
                marginLeft: 24,
                marginRight: 60,
              }}
            >
              staija.org{urlPath}
            </div>
          </div>
          <div style={{ height: VIEWPORT_H, overflow: "hidden" }}>
            <Img
              src={staticFile(src)}
              style={{
                width: CHROME_W,
                display: "block",
                transform: `translateY(-${pan}px)`,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
