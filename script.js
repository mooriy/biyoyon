(() => {
  const canvas = document.querySelector("#toy");
  const scene = document.querySelector("#scene");
  const launchButton = document.querySelector("#launch");
  const motionButton = document.querySelector("#motion");
  const motionStatus = document.querySelector("#motion-status");
  const fullscreenButton = document.querySelector("#fullscreen");
  const fullscreenClose = document.querySelector("#fullscreen-close");
  const ctx = canvas.getContext("2d");

  const ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let width = 0;
  let height = 0;
  let lastTime = 0;
  let dragging = false;
  let activePointer = null;
  let pointerStart = null;
  let pointerMoved = false;
  let launchUntil = 0;
  let lastMotion = 0;
  let previousAcceleration = null;
  let motionTimeout = null;

  function geometry() {
    const fullscreen = scene.classList.contains("is-fullscreen");
    const scale = fullscreen ? Math.min(width / 300, height / 560) : Math.min(width / 380, height / 420);
    const anchorY = height * (fullscreen ? 0.73 : 0.64);
    const radius = 51 * scale;
    return {
      scale,
      anchorX: width / 2,
      anchorY,
      restY: fullscreen ? anchorY - radius * 0.83 - (anchorY - height * 0.27 - radius * 0.83) / 3 : height * 0.36,
      maxY: height * (fullscreen ? 0.62 : 0.57),
      radius
    };
  }

  function resize() {
    const rect = scene.getBoundingClientRect();
    const oldWidth = width;
    const oldHeight = height;
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldWidth && oldHeight) {
      ball.x *= width / oldWidth;
      ball.y *= height / oldHeight;
    } else {
      ball.x = width / 2;
      ball.y = height * 0.36;
    }
  }

  function roundedRect(x, y, w, h, radius, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function draw() {
    const { scale, anchorX, anchorY, radius } = geometry();
    ctx.clearRect(0, 0, width, height);

    // The handle stays fixed while the spring follows the moving ball.
    ctx.save();
    ctx.translate(anchorX, anchorY);
    roundedRect(-9 * scale, -4 * scale, 18 * scale, 22 * scale, 5 * scale, "#d0a877", "#997c5c", 2 * scale);
    roundedRect(-15 * scale, 13 * scale, 30 * scale, 105 * scale, 13 * scale, "#deb98b", "#9d8060", 2.5 * scale);
    roundedRect(-10 * scale, 20 * scale, 6 * scale, 88 * scale, 3 * scale, "#f1d4ae");
    ctx.strokeStyle = "#b8956d";
    ctx.lineWidth = 1.5 * scale;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 * scale, (42 + i * 12) * scale);
      ctx.lineTo(10 * scale, (42 + i * 12) * scale);
      ctx.stroke();
    }
    ctx.restore();

    const dx = ball.x - anchorX;
    const dy = ball.y - anchorY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const endX = ball.x - ux * radius * 0.83;
    const endY = ball.y - uy * radius * 0.83;
    const springLength = Math.hypot(endX - anchorX, endY - anchorY);
    const px = -uy;
    const py = ux;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    const segments = 100;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const envelope = Math.min(1, t * 9, (1 - t) * 9);
      const wave = Math.sin(t * Math.PI * 2 * 8) * 9 * scale * envelope;
      ctx.lineTo(anchorX + ux * springLength * t + px * wave, anchorY + uy * springLength * t + py * wave);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7a9481";
    ctx.lineWidth = 4.5 * scale;
    ctx.stroke();
    ctx.strokeStyle = "#f5faf1";
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.fillStyle = "#a3c4a0";
    ctx.beginPath();
    ctx.ellipse(4 * scale, 8 * scale, radius, radius * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fffdf3";
    ctx.strokeStyle = "#648b70";
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e9f2df";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.4, -radius * 0.42, radius * 0.2, radius * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#587763";
    ctx.beginPath();
    ctx.arc(-15 * scale, -2 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.arc(15 * scale, -2 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#587763";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 4 * scale, 6 * scale, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "#efc9bb";
    ctx.beginPath();
    ctx.ellipse(-25 * scale, 9 * scale, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(25 * scale, 9 * scale, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function frame(time) {
    const dt = Math.min((time - (lastTime || time)) / 1000, 0.032);
    lastTime = time;
    const { anchorX, restY, maxY, radius } = geometry();
    if (!dragging) {
      const targetY = time < launchUntil ? -radius * 2 : restY;
      ball.vx += (anchorX - ball.x) * 45 * dt;
      ball.vy += (targetY - ball.y) * 45 * dt;
      const damping = Math.exp(-5 * dt);
      ball.vx *= damping;
      ball.vy *= damping;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.x = Math.max(radius, Math.min(width - radius, ball.x));
      ball.y = Math.min(maxY, ball.y);
    }
    draw();
    requestAnimationFrame(frame);
  }

  function pointBall(event) {
    const rect = canvas.getBoundingClientRect();
    const { maxY, radius } = geometry();
    ball.x = Math.max(radius, Math.min(width - radius, event.clientX - rect.left));
    ball.y = Math.max(radius, Math.min(maxY, event.clientY - rect.top));
    ball.vx = 0;
    ball.vy = 0;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (activePointer !== null) return;
    const rect = canvas.getBoundingClientRect();
    const { radius } = geometry();
    activePointer = event.pointerId;
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerMoved = false;
    dragging = Math.hypot(event.clientX - rect.left - ball.x, event.clientY - rect.top - ball.y) <= radius * 1.4;
    if (dragging) launchUntil = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10) pointerMoved = true;
    if (dragging && pointerMoved) pointBall(event);
  });
  function releasePointer(event) {
    if (event.pointerId !== activePointer) return;
    const shouldLaunch = event.type === "pointerup" && !pointerMoved;
    dragging = false;
    activePointer = null;
    pointerStart = null;
    if (shouldLaunch) launch();
  }
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);

  function launch() {
    dragging = false;
    activePointer = null;
    pointerStart = null;
    launchUntil = performance.now() + 700;
    ball.vy = -900 * geometry().scale;
    ball.vx += (Math.random() - 0.5) * 80 * geometry().scale;
  }
  launchButton.addEventListener("click", launch);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      launch();
    }
  });

  function setFullscreen(enabled) {
    scene.classList.toggle("is-fullscreen", enabled);
    document.body.classList.toggle("fullscreen-open", enabled);
    fullscreenClose.hidden = !enabled;
    fullscreenButton.setAttribute("aria-pressed", String(enabled));
    resize();
    (enabled ? fullscreenClose : fullscreenButton).focus();
  }
  fullscreenButton.addEventListener("click", () => setFullscreen(true));
  fullscreenClose.addEventListener("click", () => setFullscreen(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && scene.classList.contains("is-fullscreen")) setFullscreen(false);
  });

  function handleMotion(event) {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration || acceleration.x == null || acceleration.y == null) return;
    if (motionTimeout !== null) {
      clearTimeout(motionTimeout);
      motionTimeout = null;
      motionButton.textContent = "⌁ スマホをふってあそべます";
      motionStatus.textContent = "スマホをやさしくふってみてね";
    }
    const now = performance.now();
    if (!previousAcceleration || now - lastMotion > 40) {
      if (previousAcceleration && !dragging) {
        const dx = acceleration.x - previousAcceleration.x;
        const dy = acceleration.y - previousAcceleration.y;
        const scale = geometry().scale;
        ball.vx += Math.max(-500, Math.min(500, dx * 65)) * scale;
        ball.vy += Math.max(-500, Math.min(500, -dy * 65)) * scale;
      }
      previousAcceleration = { x: acceleration.x, y: acceleration.y };
      lastMotion = now;
    }
  }

  motionButton.addEventListener("click", async () => {
    if (!window.isSecureContext) {
      motionStatus.textContent = "スマホの動きを使うには、HTTPSで開いてください。さわってもあそべます。";
      return;
    }
    if (!("DeviceMotionEvent" in window)) {
      motionStatus.textContent = "この端末では動きセンサーを使えません。さわってあそんでね。";
      return;
    }
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
          motionStatus.textContent = "動きセンサーが許可されませんでした。設定を確認してね。";
          return;
        }
      }
      window.addEventListener("devicemotion", handleMotion);
      motionButton.disabled = true;
      motionStatus.textContent = "動きセンサーを確認しています…";
      motionTimeout = setTimeout(() => {
        window.removeEventListener("devicemotion", handleMotion);
        motionTimeout = null;
        motionButton.disabled = false;
        motionStatus.textContent = "動きセンサーを確認できませんでした。端末やブラウザの設定を確認してね。";
      }, 4000);
    } catch (error) {
      console.error("動きセンサーを有効にできませんでした:", error);
      motionStatus.textContent = "動きセンサーを使えませんでした。設定を確認してね。";
    }
  });

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
