import React from "react";
import {
  AbsoluteFill,
  Composition,
  useCurrentFrame,
  useVideoConfig,
  random,
} from "remotion";

const PAPER = "#F7F2E8";
const INK = "31, 58, 95";
const VERMILION = "165, 59, 48";
const COUNT = 76;

type Particle = { x: number; y: number; r: number; warm: boolean };

export const AtlasField: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = (frame / durationInFrames) * Math.PI * 2;

  const points: Particle[] = Array.from({ length: COUNT }, (_, i) => {
    const baseX = random(`x-${i}`) * width;
    const baseY = random(`y-${i}`) * height;
    const ax = 10 + random(`ax-${i}`) * 26;
    const ay = 10 + random(`ay-${i}`) * 26;
    const phase = random(`phase-${i}`) * Math.PI * 2;
    const speed = 1 + (i % 2);
    return {
      x: baseX + ax * Math.sin(t * speed + phase),
      y: baseY + ay * Math.cos(t * speed + phase * 1.3),
      r: 1 + random(`r-${i}`) * 1.8,
      warm: random(`warm-${i}`) < 0.16,
    };
  });

  const link = 138;
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < link) {
        const alpha = (1 - d / link) * 0.3;
        lines.push(
          <line
            key={`l-${i}-${j}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={
              a.warm || b.warm
                ? `rgba(${VERMILION}, ${alpha})`
                : `rgba(${INK}, ${alpha})`
            }
            strokeWidth={0.6}
          />,
        );
      }
    }
  }

  const glowX = width * (0.22 + 0.06 * Math.sin(t));
  const glowY = height * (0.3 + 0.05 * Math.cos(t));

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(900px 560px at ${glowX}px ${glowY}px, rgba(255,255,255,.75), rgba(255,255,255,0) 70%)`,
        }}
      />
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {lines}
        {points.map((p, i) => (
          <circle
            key={`p-${i}`}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={p.warm ? `rgba(${VERMILION}, .55)` : `rgba(${INK}, .5)`}
          />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 52,
          fontFamily: '"Times New Roman", serif',
          fontSize: 12,
          letterSpacing: "0.32em",
          color: "rgba(23, 22, 26, .22)",
        }}
      >
        KAOYAN ATLAS
      </div>
      <div
        style={{
          position: "absolute",
          right: 60,
          top: 48,
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "rgba(23, 22, 26, .18)",
        }}
      >
        2027
      </div>
    </AbsoluteFill>
  );
};

export const MyComposition = () => {
  return (
    <Composition
      id="AtlasField"
      component={AtlasField}
      durationInFrames={180}
      fps={30}
      width={1600}
      height={900}
    />
  );
};
