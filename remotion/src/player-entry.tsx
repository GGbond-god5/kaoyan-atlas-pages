import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { AtlasVeilScene } from "./AtlasVeil";
import { pointer } from "./pointer";

const host = document.getElementById("atlasField");

if (host) {
	const disabled = document.documentElement.classList.contains("motion-off");

	if (disabled) {
		host.classList.add("is-still");
	} else {
		const track = (event: PointerEvent) => {
			const box = host.getBoundingClientRect();
			if (!box.width || !box.height) return;
			pointer.x = ((event.clientX - box.left) / box.width) * 1600;
			pointer.y = ((event.clientY - box.top) / box.height) * 900;
		};

		window.addEventListener("pointermove", track, { passive: true });
		window.addEventListener("pointerleave", () => {
			pointer.x = -9999;
			pointer.y = -9999;
		});

		createRoot(host).render(
			<Player
				component={AtlasVeilScene}
				durationInFrames={240}
				compositionWidth={1600}
				compositionHeight={900}
				fps={30}
				loop
				autoPlay
				controls={false}
				clickToPlay={false}
				doubleClickToFullscreen={false}
				acknowledgeRemotionLicense
				style={{ width: "100%", height: "100%" }}
			/>,
		);
	}
}
