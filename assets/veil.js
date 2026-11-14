(() => {
  const veil = document.querySelector(".page-veil");
  if (!veil) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced && !document.documentElement.classList.contains("motion-forced")) return;

  let frame = 0;
  let x = -9999;
  let y = -9999;
  const paint = () => {
    frame = 0;
    veil.style.setProperty("--veil-x", `${x}px`);
    veil.style.setProperty("--veil-y", `${y}px`);
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );

  window.addEventListener("pointerleave", () => {
    x = -9999;
    y = -9999;
    if (!frame) frame = requestAnimationFrame(paint);
  });
})();
