import React from "react";
import {
	AbsoluteFill,
	Composition,
	useCurrentFrame,
	useVideoConfig,
	random,
} from "remotion";
import { pointer as sharedPointer } from "./pointer";

const PAPER = "#F3EEE4";
const INK = "23, 22, 26";
const VERMILION = "168, 52, 42";
const NODE_COUNT = 104;
const LINK_DISTANCE = 172;
const REACH = 264;

type Node = {
	x: number;
	y: number;
	r: number;
	warm: boolean;
	depth: number;
	near: number;
};

type AtlasVeilSceneProps = {
	pointer?: { x: number; y: number };
};

export const AtlasVeilScene: React.FC<AtlasVeilSceneProps> = ({ pointer }) => {
	const frame = useCurrentFrame();
	const { width, height, durationInFrames } = useVideoConfig();
	const t = (frame / durationInFrames) * Math.PI * 2;

	const cursor = pointer ?? sharedPointer;
	const active = cursor.x > -1000;

	const nodes: Node[] = Array.from({ length: NODE_COUNT }, (_, i) => {
		const depth = random(`depth-${i}`);
		const speed = i % 3 === 0 ? 2 : 1;
		const phase = random(`phase-${i}`) * Math.PI * 2;
		const baseX = random(`x-${i}`) * width;
		const baseY = random(`y-${i}`) * height;
		const x = baseX + (14 + depth * 46) * Math.sin(t * speed + phase);
		const y = baseY + (12 + depth * 38) * Math.cos(t * speed + phase * 1.37);

		let pushedX = x;
		let pushedY = y;
		let near = 0;
		if (active) {
			const dx = x - cursor.x;
			const dy = y - cursor.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < REACH && dist > 0.001) {
				near = 1 - dist / REACH;
				const push = near * near * 96;
				pushedX = x + (dx / dist) * push;
				pushedY = y + (dy / dist) * push;
			}
		}

		return {
			x: pushedX,
			y: pushedY,
			r: 0.8 + depth * 1.9,
			warm: random(`warm-${i}`) < 0.14,
			depth,
			near,
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
			const closeness = 1 - d / LINK_DISTANCE;
			const lift = Math.max(a.near, b.near) * 0.22;
			const alpha =
				closeness * closeness * (0.34 + lift) * (0.45 + ((a.depth + b.depth) / 2) * 0.55);
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
					strokeWidth={0.5 + closeness * 0.4}
				/>,
			);
		}
	}

	const washX = width * (0.3 + 0.08 * Math.sin(t));
	const washY = height * (0.28 + 0.06 * Math.cos(t * 2));
	const orbitX = width * 0.79;
	const orbitY = height * 0.19;

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
			{active ? (
				<div
					style={{
						position: "absolute",
						inset: 0,
						background: `radial-gradient(300px circle at ${cursor.x}px ${cursor.y}px, rgba(255,252,243,.62), rgba(255,246,229,.18) 46%, rgba(255,246,229,0) 72%)`,
					}}
				/>
			) : null}

			<svg
				width={width}
				height={height}
				style={{ position: "absolute", inset: 0 }}
			>
				<g opacity={0.5} style={{ rotate: `${Math.sin(t) * 6}deg` }}>
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
						r={n.r + n.near * 1.6}
						fill={
							n.warm
								? `rgba(${VERMILION}, ${0.34 + n.depth * 0.34 + n.near * 0.2})`
								: `rgba(${INK}, ${0.28 + n.depth * 0.32 + n.near * 0.2})`
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
			component={AtlasVeilScene}
			defaultProps={{}}
			durationInFrames={240}
			fps={30}
			width={1600}
			height={900}
		/>
	);
};
