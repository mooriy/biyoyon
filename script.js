(() => {
  const canvas = document.querySelector("#toy");
  const scene = document.querySelector("#scene");
  const launchButton = document.querySelector("#launch");
  const motionButton = document.querySelector("#motion");
  const motionStatus = document.querySelector("#motion-status");
  const fullscreenButton = document.querySelector("#fullscreen");
  const fullscreenClose = document.querySelector("#fullscreen-close");
  const soundToggle = document.querySelector("#sound-toggle");
  const ctx = canvas.getContext("2d");
  const sceneParent = scene.parentNode;
  const sceneNextSibling = scene.nextSibling;
  const motionStatusParent = motionStatus.parentNode;
  const motionStatusNextSibling = motionStatus.nextSibling;

  const springStiffness = 45;
  const springDamping = 3;
  const bendingStiffness = 45;
  const airDamping = 2;
  const gravity = 260;
  const ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let width = 0;
  let height = 0;
  let lastTime = 0;
  let dragging = false;
  let activePointer = null;
  let pointerStart = null;
  let pointerMoved = false;
  let lastMotion = 0;
  let previousAcceleration = null;
  let motionTimeout = null;
  let fullscreenScroll = null;
  let audioContext = null;
  let soundEnabled = true;
  let pointerSoundPlayed = false;
  let lastMotionSound = 0;
  const motionSoundCooldown = 500;

  function unlockAudio() {
    if (!soundEnabled || !window.AudioContext) return;
    audioContext ??= new window.AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch((error) => {
        console.error("音声を有効にできませんでした:", error);
      });
    }
  }

  function playBoing(intensity = 1) {
    if (!soundEnabled) return;
    if (!window.AudioContext) {
      soundEnabled = false;
      soundToggle.disabled = true;
      soundToggle.classList.add("is-muted");
      soundToggle.setAttribute("aria-pressed", "false");
      soundToggle.setAttribute("aria-label", "このブラウザでは音声を再生できません");
      console.warn("Web Audio APIが利用できないため、効果音を再生できません。");
      return;
    }

    audioContext ??= new window.AudioContext();
    const play = () => {
      if (!soundEnabled) return;
      const now = audioContext.currentTime;
      const duration = 0.7;
      const volume = 0.14 * Math.max(0.3, Math.min(1, intensity));
      const pitchCurve = Float32Array.from({ length: 64 }, (_, index) => {
        const progress = index / 63;
        const bounce = (1 + Math.cos(progress * Math.PI * 8)) / 2;
        return 110 + 420 * Math.exp(-progress * 5.4) * bounce;
      });

      for (const voice of [
        { type: "triangle", ratio: 1, level: 0.8 },
        { type: "sine", ratio: 2, level: 0.2 }
      ]) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const frequencies = Float32Array.from(pitchCurve, (frequency) => frequency * voice.ratio);
        oscillator.type = voice.type;
        oscillator.frequency.setValueCurveAtTime(frequencies, now, duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume * voice.level, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
      }
    };

    if (audioContext.state === "suspended") {
      audioContext.resume().then(play).catch((error) => {
        console.error("効果音の再生を開始できませんでした:", error);
      });
      return;
    }
    play();
  }

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggle.classList.toggle("is-muted", !soundEnabled);
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.setAttribute("aria-label", soundEnabled ? "音をオフにする" : "音をオンにする");
    unlockAudio();
  });

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
    const { anchorX, anchorY, restY, maxY, radius, scale } = geometry();
    if (!dragging) {
      // Unit-mass model: compression balances gravity at the resting position.
      const naturalLength = anchorY - restY + gravity * scale / springStiffness;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const dx = ball.x - anchorX;
        const dy = ball.y - anchorY;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const ux = dx / length;
        const uy = dy / length;
        const radialVelocity = ball.vx * ux + ball.vy * uy;
        const springAcceleration = -springStiffness * (length - naturalLength) - springDamping * radialVelocity;
        ball.vx += (springAcceleration * ux - bendingStiffness * dx - airDamping * ball.vx) * step;
        ball.vy += (springAcceleration * uy + gravity * scale - airDamping * ball.vy) * step;
        ball.x += ball.vx * step;
        ball.y += ball.vy * step;
        if (ball.x < radius || ball.x > width - radius) {
          ball.x = Math.max(radius, Math.min(width - radius, ball.x));
          ball.vx = 0;
        }
        if (ball.y > maxY) {
          ball.y = maxY;
          ball.vy = 0;
        }
      }
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
    pointerSoundPlayed = false;
    dragging = Math.hypot(event.clientX - rect.left - ball.x, event.clientY - rect.top - ball.y) <= radius * 1.4;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer) return;
    const pointerDistance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (pointerDistance > 10) pointerMoved = true;
    if (dragging && pointerDistance > 120 && !pointerSoundPlayed) {
      playBoing(Math.min(1, pointerDistance / 240));
      pointerSoundPlayed = true;
    }
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
    playBoing();
    const { radius, scale } = geometry();
    ball.vy = -Math.max(900 * scale, Math.sqrt(springStiffness) * 2 * (Math.max(0, ball.y) + radius * 2));
    ball.vx += (Math.random() - 0.5) * 80 * geometry().scale;
  }
  launchButton.addEventListener("click", launch);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      launch();
    }
  });

  function syncViewport() {
    if (!scene.classList.contains("is-fullscreen")) return;
    const viewport = window.visualViewport;
    if (viewport) {
      scene.style.left = `${viewport.offsetLeft}px`;
      scene.style.top = `${viewport.offsetTop}px`;
      scene.style.width = `${viewport.width}px`;
      scene.style.height = `${viewport.height}px`;
    }
    const rect = scene.getBoundingClientRect();
    if (rect.width !== width || rect.height !== height) resize();
  }

  function setFullscreen(enabled) {
    if (enabled) {
      fullscreenScroll = { x: window.scrollX, y: window.scrollY };
      document.body.appendChild(scene);
      scene.appendChild(motionStatus);
    } else {
      sceneParent.insertBefore(scene, sceneNextSibling);
      motionStatusParent.insertBefore(motionStatus, motionStatusNextSibling);
      for (const property of ["left", "top", "width", "height"]) {
        scene.style.removeProperty(property);
      }
    }
    scene.classList.toggle("is-fullscreen", enabled);
    document.body.classList.toggle("fullscreen-open", enabled);
    fullscreenClose.hidden = !enabled;
    fullscreenButton.setAttribute("aria-pressed", String(enabled));
    syncViewport();
    resize();
    if (!enabled && fullscreenScroll) {
      window.scrollTo(fullscreenScroll.x, fullscreenScroll.y);
      fullscreenScroll = null;
    }
    (enabled ? fullscreenClose : fullscreenButton).focus({ preventScroll: true });
  }
  fullscreenButton.addEventListener("click", () => {
    if (!motionButton.disabled) enableMotion(true);
    setFullscreen(true);
  });
  fullscreenClose.addEventListener("click", () => setFullscreen(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && scene.classList.contains("is-fullscreen")) setFullscreen(false);
  });

  function setMotionStatus(message, active = false) {
    motionStatus.textContent = message;
    motionStatus.classList.toggle("motion-active", active);
  }

  function handleMotion(event) {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration || acceleration.x == null || acceleration.y == null) return;
    if (motionTimeout !== null) {
      clearTimeout(motionTimeout);
      motionTimeout = null;
      motionButton.textContent = "⌁ スマホをふってあそべます";
      setMotionStatus("スマホをやさしくふってみてね", true);
    }
    const now = performance.now();
    if (!previousAcceleration || now - lastMotion > 40) {
      if (previousAcceleration && !dragging) {
        const dx = acceleration.x - previousAcceleration.x;
        const dy = acceleration.y - previousAcceleration.y;
        const movement = Math.hypot(dx, dy);
        const scale = geometry().scale;
        ball.vx += Math.max(-2500, Math.min(2500, dx * 325)) * scale;
        ball.vy += Math.max(-2500, Math.min(2500, -dy * 325)) * scale;
        if (movement >= 6 && now - lastMotionSound >= motionSoundCooldown) {
          playBoing(Math.min(1, movement / 15));
          lastMotionSound = now;
        }
      }
      previousAcceleration = { x: acceleration.x, y: acceleration.y };
      lastMotion = now;
    }
  }

  async function enableMotion(interactive) {
    if (interactive) unlockAudio();
    if (!window.isSecureContext) {
      setMotionStatus("スマホの動きを使うには、HTTPSで開いてください。さわってもあそべます。");
      return;
    }
    if (!("DeviceMotionEvent" in window)) {
      setMotionStatus("この端末では動きセンサーを使えません。さわってあそんでね。");
      return;
    }
    if (typeof DeviceMotionEvent.requestPermission === "function" && !interactive) {
      setMotionStatus("動きセンサーを使うには、ボタンを押して許可してね。");
      return;
    }
    motionButton.disabled = true;
    setMotionStatus("動きセンサーの許可を確認しています…");
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
          motionButton.disabled = false;
          setMotionStatus("動きセンサーが許可されませんでした。設定を確認してね。");
          return;
        }
      }
      window.addEventListener("devicemotion", handleMotion);
      setMotionStatus("動きセンサーを確認しています…");
      motionTimeout = setTimeout(() => {
        window.removeEventListener("devicemotion", handleMotion);
        motionTimeout = null;
        motionButton.disabled = false;
        setMotionStatus("動きセンサーを確認できませんでした。端末やブラウザの設定を確認してね。");
      }, 4000);
    } catch (error) {
      console.error("動きセンサーを有効にできませんでした:", error);
      motionButton.disabled = false;
      setMotionStatus("動きセンサーを使えませんでした。設定を確認してね。");
    }
  }
  motionButton.addEventListener("click", () => enableMotion(true));

  window.addEventListener("resize", () => {
    syncViewport();
    resize();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewport);
    window.visualViewport.addEventListener("scroll", syncViewport);
  }
  resize();
  requestAnimationFrame(frame);
  enableMotion(false);
})();
