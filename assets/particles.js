(function () {
  "use strict";
  const stage = document.getElementById("stage");
  if (!stage || !window.requestAnimationFrame) return;
  const forceMotion = new URLSearchParams(location.search).get("motion") === "1";
  if (!forceMotion && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "particle-field";
  canvas.id = "particleField";
  canvas.setAttribute("aria-hidden", "true");
  const bg = stage.querySelector(".stage-bg");
  if (bg && bg.nextSibling) stage.insertBefore(canvas, bg.nextSibling);
  else stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const mouse = { x: -999, y: -999, active: false };
  let W = 0, H = 0, points = [], raf = 0, paused = false;

  const ink = (a) => `rgba(31, 58, 95, ${a})`;
  const vermilion = (a) => `rgba(165, 59, 48, ${a})`;

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function seed() {
    const count = W < 720 ? 30 : W < 1100 ? 48 : 66;
    points = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r: 0.9 + Math.random() * 1.5,
      warm: Math.random() < 0.16,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const link = 118;
    for (const p of points) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const force = (1 - d / 130) * 0.5;
          p.x += (dx / d) * force;
          p.y += (dy / d) * force;
        }
      }
    }

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < link) {
          const alpha = (1 - d / link) * 0.16;
          ctx.strokeStyle = a.warm || b.warm ? vermilion(alpha) : ink(alpha);
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.warm ? vermilion(0.42) : ink(0.32);
      ctx.fill();
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150) {
          ctx.strokeStyle = ink((1 - d / 150) * 0.2);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }

  function start() {
    resize();
    seed();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  }

  stage.addEventListener("pointermove", (e) => {
    const rect = stage.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;
  });
  stage.addEventListener("pointerleave", () => { mouse.active = false; });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { paused = true; cancelAnimationFrame(raf); }
    else if (paused) { paused = false; raf = requestAnimationFrame(draw); }
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(start, 180);
  });
  start();
})();
