import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
	entryPoints: [path.join(root, "src", "player-entry.tsx")],
	bundle: true,
	minify: true,
	format: "iife",
	target: ["es2020"],
	jsx: "automatic",
	define: { "process.env.NODE_ENV": '"production"' },
	legalComments: "none",
	outfile: path.join(root, "..", "assets", "remotion", "atlas-player.js"),
});
