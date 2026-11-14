import React from "react";
import {
	AbsoluteFill,
	Composition,
	useCurrentFrame,
	useVideoConfig,
	random,
} from "remotion";

const PAPER = "#F3EEE4";
const INK = "23, 22, 26";
const VERMILION = "168, 52, 42";
const NODE_COUNT = 104;
const LINK_DISTANCE = 172;

type Node = {
	x: number;
	y: number;
	r: number;
	warm: boolean;
	depth: number;
};

export const AtlasVeil: React.FC = () => {
	const frame = useCurrentFrame();
	const { width, height, durationInFrames } = useVideoConfig();
	const t = (frame / durationInFrames) * Math.PI * 2;

	const nodes: Node[] = Array.from({ length: NODE_COUNT }, (_, i) => {
		const depth = random(`depth-${i}`);
		const speed = i % 3 === 0 ? 2 : 1;
		const driftX = 14 + depth * 46;
		const driftY = 12 + depth * 38;
		const phase = random(`phase-${i}`) * Math.PI * 2;
		return {
			x:
				random(`x-${i}`) * width +
				driftX * Math.sin(t * speed + phase),
			y:
				random(`y-${i}`) * height +
				driftY * Math.cos(t * speed + phase * 1.37),
			r: 0.8 + depth * 1.9,
			warm: random(`warm-${i}`) < 0.14,
			depth,
		};
	});

	const links: React.ReactNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			const a = nodes[i];
			const b = nodes[j];
			const dx = a.x - b.x;
			const dy = a.y - b.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d > LINK_DISTANCE) continue;
			const near = 1 - d / LINK_DISTANCE;
			const alpha = near * near * 0.34 * (0.45 + ((a.depth + b.depth) / 2) * 0.55);
			links.push(
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
					strokeWidth={0.5 + near * 0.4}
				/>,
			);
		}
	}

	const washX = width * (0.3 + 0.08 * Math.sin(t));
	const washY = height * (0.28 + 0.06 * Math.cos(t * 2));
	const orbitX = width * 0.79;
	const orbitY = height * 0.19;
	const orbitSpin = Math.sin(t) * 6;

	return (
		<AbsoluteFill style={{ backgroundColor: PAPER, overflow: "hidden" }}>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: `radial-gradient(1100px 640px at ${washX}px ${washY}px, rgba(255,255,255,.62), rgba(255,255,255,0) 68%)`,
				}}
			/>
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: `radial-gradient(760px 520px at ${width * 0.92}px ${height * 0.88}px, rgba(${VERMILION}, .07), rgba(255,255,255,0) 70%)`,
				}}
			/>

			<svg
				width={width}
				height={height}
				style={{ position: "absolute", inset: 0 }}
			>
				<g
					opacity={0.5}
					style={{
						rotate: `${orbitSpin}deg`,
					}}
				>
					{[248, 336, 438].map((radius, i) => (
						<circle
							key={`orbit-${radius}`}
							cx={orbitX}
							cy={orbitY}
							r={radius}
							fill="none"
							stroke={`rgba(${INK}, ${0.09 - i * 0.018})`}
							strokeWidth={0.75}
						/>
					))}
					{Array.from({ length: 72 }, (_, i) => {
						const angle = (i / 72) * Math.PI * 2;
						const long = i % 6 === 0;
						const inner = 438 - (long ? 16 : 8);
						return (
							<line
								key={`tick-${i}`}
								x1={orbitX + Math.cos(angle) * inner}
								y1={orbitY + Math.sin(angle) * inner}
								x2={orbitX + Math.cos(angle) * 438}
								y2={orbitY + Math.sin(angle) * 438}
								stroke={`rgba(${INK}, ${long ? 0.1 : 0.055})`}
								strokeWidth={0.7}
							/>
						);
					})}
				</g>

				{links}

				{nodes.map((n, i) => (
					<circle
						key={`n-${i}`}
						cx={n.x}
						cy={n.y}
						r={n.r}
						fill={
							n.warm
								? `rgba(${VERMILION}, ${0.34 + n.depth * 0.34})`
								: `rgba(${INK}, ${0.28 + n.depth * 0.32})`
						}
					/>
				))}
			</svg>

			<div
				style={{
					position: "absolute",
					left: 0,
					top: "-25%",
					width: 640,
					height: "150%",
					rotate: "11deg",
					translate: `${Math.round(520 + Math.sin(t) * 620)}px 0px`,
					background:
						"linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.30) 48%, rgba(255,255,255,0) 100%)",
					mixBlendMode: "screen",
					opacity: 0.6,
				}}
			/>
		</AbsoluteFill>
	);
};

export const AtlasVeilComposition: React.FC = () => {
	return (
		<Composition
			id="AtlasVeil"
			component={AtlasVeil}
			durationInFrames={240}
			fps={30}
			width={1600}
			height={900}
		/>
	);
};
