import { createServer } from "node:http";

const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>2048 — Neon Physics</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px 14px;
      color: #f4f2ff;
      background: radial-gradient(ellipse at 50% 30%, #17162d 0%, #090912 60%, #050509 100%);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { width: min(100%, 640px); text-align: center; }
    h1 {
      margin: 0;
      font-size: clamp(1.7rem, 6vw, 2.6rem);
      letter-spacing: .16em;
      font-weight: 800;
      background: linear-gradient(90deg, #58f6d2, #ac75ff, #ff5faf);
      color: transparent;
      background-clip: text;
      -webkit-background-clip: text;
    }
    .subtitle { margin: 7px 0 18px; color: #9d9ab5; font-size: .9rem; }
    .stage {
      width: min(92vw, 600px);
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid #39334f;
      border-radius: 50%;
      box-shadow: 0 0 35px #8c48ff20, 0 0 90px #1dcbb91a;
      background: #080811;
    }
    canvas { display: block; width: 100%; height: auto; }
    .controls { display: flex; justify-content: center; gap: 10px; margin: 18px 0 12px; }
    button {
      border: 1px solid #494362;
      border-radius: 999px;
      padding: 10px 18px;
      color: #f4f2ff;
      background: #191728;
      font: inherit;
      cursor: pointer;
      transition: border-color .2s, background .2s, transform .2s;
    }
    button:hover { border-color: #a878ff; background: #24203a; transform: translateY(-1px); }
    button:focus-visible { outline: 2px solid #65f4dc; outline-offset: 3px; }
    .stats { display: flex; justify-content: center; gap: 26px; color: #aaa6c1; font-size: .82rem; }
    .stats strong { color: #f4f2ff; font-weight: 650; }
    @media (max-width: 420px) { .stats { gap: 14px; font-size: .75rem; } button { padding: 9px 14px; } }
  </style>
</head>
<body>
  <main>
    <h1>NEON 2048</h1>
    <p class="subtitle">Laisse les nombres rebondir et fusionner.</p>
    <div class="stage"><canvas id="world" aria-label="Simulation physique de billes qui fusionnent"></canvas></div>
    <div class="controls">
      <button id="drop" type="button">＋ Lâcher une bille</button>
      <button id="pause" type="button" aria-pressed="false">Ⅱ Pause</button>
      <button id="sound" type="button" aria-pressed="true">♫ Son activé</button>
    </div>
    <div class="stats" aria-live="polite">
      <span>Meilleure valeur : <strong id="best">2</strong></span>
      <span>Fusions : <strong id="merges">0</strong></span>
      <span>Billes : <strong id="count">0</strong></span>
    </div>
  </main>
  <script>
  (() => {
    const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;
    const SIZE = 600;
    const CENTER = SIZE / 2;
    const ARENA_RADIUS = 270;
    const BALL_RADIUS = 19;
    const MAX_BALLS = 45;
    const engine = Engine.create();
    engine.gravity.y = 2.2;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const render = Render.create({
      canvas: document.getElementById("world"),
      engine,
      options: {
        width: SIZE,
        height: SIZE,
        wireframes: false,
        background: "#080811",
        pixelRatio: window.devicePixelRatio || 1
      }
    });
    Render.run(render);
    Runner.run(Runner.create(), engine);

    // Des segments tangents forment une paroi circulaire creuse.
    const segments = 64;
    const wallRadius = ARENA_RADIUS - 7;
    const segmentWidth = (2 * Math.PI * wallRadius / segments) + 4;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const wall = Bodies.rectangle(
        CENTER + Math.cos(angle) * wallRadius,
        CENTER + Math.sin(angle) * wallRadius,
        segmentWidth,
        18,
        {
          isStatic: true,
          angle: angle + Math.PI / 2,
          friction: 0.08,
          restitution: 0.98,
          render: { fillStyle: "#34264f", strokeStyle: "#9c65ff", lineWidth: 1 }
        }
      );
      World.add(engine.world, wall);
    }

    const colors = {
      2: "#71ff9b", 4: "#45edff", 8: "#ed68ff", 16: "#ffad4d",
      32: "#a879ff", 64: "#ff557a", 128: "#ffe45e", 256: "#51ffe0",
      512: "#ff72d2", 1024: "#a4ff4d", 2048: "#ffffff"
    };
    const colorFor = value => colors[value] || "hsl(" + ((Math.log2(value) * 37) % 360) + " 100% 68%)";
    const balls = new Set();
    const particles = [];
    const bestLabel = document.getElementById("best");
    const mergesLabel = document.getElementById("merges");
    const countLabel = document.getElementById("count");
    let best = 2;
    let mergeCount = 0;
    let paused = false;
    let soundEnabled = true;
    let audioContext;

    function updateStats() {
      countLabel.textContent = balls.size;
    }

    function radiusFor(value) {
      const step = Math.max(0, Math.log2(value) - 1);
      return BALL_RADIUS + step * 4;
    }

    function createBall(value, x = CENTER, y = 65, fused = false) {
      if (balls.size >= MAX_BALLS) return false;
      const step = Math.max(0, Math.log2(value) - 1);
      const radius = radiusFor(value);
      const restitution = Math.max(0.65, 0.96 - step * 0.025);
      const density = 0.0015 + step * 0.0007;
      const frictionAir = Math.min(0.005, 0.001 + step * 0.0007);
      const ball = Bodies.circle(x, y, radius, {
        label: String(value),
        restitution,
        friction: 0.015,
        frictionAir,
        density,
        render: {
          fillStyle: colorFor(value),
          strokeStyle: "#ffffffaa",
          lineWidth: 1.5
        }
      });
      ball.value = value;
      ball.fusedAt = fused ? performance.now() : 0;
      balls.add(ball);
      World.add(engine.world, ball);
      updateStats();
      return true;
    }

    function playSound(value) {
      if (!soundEnabled || !audioContext) return;
      const now = audioContext.currentTime;
      const step = Math.max(0, Math.log2(value) - 2);
      const frequency = Math.min(880, 220 * Math.pow(2, step / 3));
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      gain.connect(audioContext.destination);
      [1, 1.5, 2].forEach((ratio, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency * ratio;
        oscillator.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + 0.44);
      });
    }

    function enableAudio() {
      if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioContext = new AudioContextClass();
      }
      if (audioContext && audioContext.state === "suspended") audioContext.resume();
    }

    function addFusionParticles(x, y, value) {
      const color = colorFor(value);
      const now = performance.now();
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          bornAt: now,
          life: 450 + Math.random() * 300,
          color,
          size: 1.5 + Math.random() * 2.5
        });
      }
    }

    Events.on(render, "afterRender", () => {
      const ctx = render.context;
      const ratio = render.options.pixelRatio || 1;
      const now = performance.now();
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      balls.forEach(ball => {
        const color = colorFor(ball.value);
        const pulse = ball.fusedAt ? Math.max(0, 1 - (now - ball.fusedAt) / 380) : 0;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, ball.circleRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 + pulse * 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 + pulse * 24;
        ctx.globalAlpha = 0.55 + pulse * 0.4;
        ctx.stroke();
        if (pulse > 0) {
          ctx.beginPath();
          ctx.arc(ball.position.x, ball.position.y, ball.circleRadius + 5 + (1 - pulse) * 24, 0, Math.PI * 2);
          ctx.lineWidth = 2 * pulse;
          ctx.globalAlpha = pulse * 0.75;
          ctx.stroke();
          if (now - ball.fusedAt > 380) ball.fusedAt = 0;
        }
        ctx.restore();
      });

      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const age = now - particle.bornAt;
        if (age >= particle.life) {
          particles.splice(i, 1);
          continue;
        }
        const seconds = age / 1000;
        const opacity = 1 - age / particle.life;
        ctx.beginPath();
        ctx.arc(particle.x + particle.vx * seconds * 90, particle.y + particle.vy * seconds * 90 + 260 * seconds * seconds, particle.size * opacity, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = opacity;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 12;
        ctx.fill();
      }
      ctx.restore();
    });

    Events.on(engine, "collisionStart", event => {
      const consumed = new Set();
      const merges = [];
      event.pairs.forEach(pair => {
        const a = pair.bodyA;
        const b = pair.bodyB;
        if (!a.value || !b.value) return;

        if (a.value === b.value && !consumed.has(a) && !consumed.has(b)) {
          consumed.add(a);
          consumed.add(b);
          merges.push({ value: a.value * 2, x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 });
        } else if (a.value !== b.value) {
          const smaller = a.value < b.value ? a : b;
          const larger = smaller === a ? b : a;
          const dx = smaller.position.x - larger.position.x;
          const dy = smaller.position.y - larger.position.y;
          const distance = Math.hypot(dx, dy) || 1;
          const strength = 0.00005 * Math.min(3, Math.log2(larger.value / smaller.value));
          Body.applyForce(smaller, smaller.position, {
            x: dx / distance * strength,
            y: dy / distance * strength
          });
        }
      });

      consumed.forEach(ball => {
        if (balls.has(ball)) {
          balls.delete(ball);
          World.remove(engine.world, ball);
        }
      });

      merges.forEach(merge => {
        const dx = merge.x - CENTER;
        const dy = merge.y - CENTER;
        const distance = Math.hypot(dx, dy);
        const maxDistance = ARENA_RADIUS - radiusFor(merge.value) - 22;
        if (distance > maxDistance) {
          merge.x = CENTER + dx / distance * maxDistance;
          merge.y = CENTER + dy / distance * maxDistance;
        }
        createBall(merge.value, merge.x, merge.y, true);
        addFusionParticles(merge.x, merge.y, merge.value);
        best = Math.max(best, merge.value);
        bestLabel.textContent = best;
        mergeCount++;
        mergesLabel.textContent = mergeCount;
        playSound(merge.value);
      });
      updateStats();
    });

    function dropBall() {
      if (paused) return;
      enableAudio();
      const offset = (Math.random() - 0.5) * 90;
      createBall(2, CENTER + offset, 58);
    }

    document.getElementById("drop").addEventListener("click", dropBall);
    document.getElementById("pause").addEventListener("click", event => {
      paused = !paused;
      engine.timing.timeScale = paused ? 0 : 1;
      event.currentTarget.textContent = paused ? "▶ Reprendre" : "Ⅱ Pause";
      event.currentTarget.setAttribute("aria-pressed", String(paused));
    });
    document.getElementById("sound").addEventListener("click", event => {
      soundEnabled = !soundEnabled;
      if (soundEnabled) enableAudio();
      event.currentTarget.textContent = soundEnabled ? "♫ Son activé" : "♫ Son coupé";
      event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
    });

    createBall(2, CENTER, 62);
    window.setInterval(() => {
      if (paused || balls.size >= MAX_BALLS) return;
      const offset = (Math.random() - 0.5) * 90;
      createBall(2, CENTER + offset, 58);
    }, 300);

    window.setInterval(() => {
      if (paused) return;
      balls.forEach(ball => {
        Body.applyForce(ball, ball.position, {
          x: (Math.random() - 0.5) * 0.0005,
          y: (Math.random() - 0.5) * 0.0005
        });
      });
    }, 1500);
  })();
  </script>
</body>
</html>
`;

export default function handler(req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// Keep the local editor preview working; Vercel serves this through api/index.js.
if (!process.env.VERCEL) {
  const server = createServer(handler);
  server.listen(3000, "0.0.0.0", () => {
    console.log("Server listening on port 3000");
  });
}
