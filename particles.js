// Tiny, fast black particles with orbit-on-hold and burst-on-release
// Canvas sits behind all content and ignores pointer events

(() => {
  // signal for fallback detector
  window.__particlesLoaded = false;
  const DPR = 1; // keep simple and reliable
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-particles';
  Object.assign(canvas.style, {
    position: 'fixed',
  inset: '0',
  top: '0',
  left: '0',
  right: '0',
  bottom: '0',
    width: '100%',
    height: '100%',
  zIndex: '0', // behind content; content has higher z-index
    pointerEvents: 'none',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Particles: 2D context not available');
    return;
  }

  // Size handling with DPR for crisp rendering
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w));
    canvas.height = Math.max(1, Math.floor(h));
  }
  resize();
  // console.log('Particles: init', { dpr: DPR, size: { w: canvas.width, h: canvas.height } });
  window.addEventListener('resize', resize);

  // Config
  const AREA = () => window.innerWidth * window.innerHeight;
  const DENSITY = 0.00035; // balanced density
  const MAX_PARTICLES = 1000; // cap for perf
  const BASE_COUNT = Math.max(200, Math.min(MAX_PARTICLES, Math.floor(AREA() * DENSITY)));
  const COLOR = '#00000049'; // small black dots

  const MAX_SPEED_NORMAL = 2.2; // px/frame (very fast)
  const MAX_SPEED_ORBIT = 10.0;  // allow higher when orbiting
  const MIN_SPEED = 1.2;
  const WANDER_JITTER = 0.25; // random steering noise
  const INTERACTION_RADIUS = 300; // px (bigger pull radius)
  // Electron-like ellipses in multiple rotated planes
  const ORBIT_PLANES = [0, Math.PI / 3, -Math.PI / 3]; // 0°, +60°, -60°
  const ORBIT_RINGS = [30, 56, 86, 116]; // base radii
  const ORBIT_ECC_RATIO = 0.62; // b = a * ratio
  const ORBIT_STIFFNESS = 0.14; // steering towards target path
  const ORBIT_OMEGA = [0.14, 0.11, 0.09, 0.075]; // angular speeds per ring
  const TRAIL_ALPHA = 0.08; // 0..1 fade strength
  const BG_COLOR = '#FAF7F0';
  const BURST_SPEED_MIN = 7.5; // outward burst speed on release
  const BURST_SPEED_MAX = 11.0;
  const DOT_MIN = 0.7; // radius px small
  const DOT_MAX = 1.2;

  const mouse = { x: -9999, y: -9999, down: false };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  window.addEventListener('mousedown', () => {
    mouse.down = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
    // Burst outwards for particles within range at the moment of release
  for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= INTERACTION_RADIUS * INTERACTION_RADIUS) {
        const d = Math.sqrt(d2) || 1;
        const dirX = dx / d;
        const dirY = dy / d;
    const spd = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
        // Strong outward push with a tiny random skew
    p.vx = dirX * spd + (Math.random() - 0.5) * 0.8;
    p.vy = dirY * spd + (Math.random() - 0.5) * 0.8;
    // Skip clamping for a few frames to let the burst really pop
    p.burstFrames = 24 + (Math.random() * 10)|0;
        p.isOrbiting = false;
      }
    }
  });

  // Particle system
  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * window.innerWidth;
      this.y = Math.random() * window.innerHeight;
      const angle = Math.random() * Math.PI * 2;
  const speed = MIN_SPEED + Math.random() * (MAX_SPEED_NORMAL - MIN_SPEED);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.r = DOT_MIN + Math.random() * (DOT_MAX - DOT_MIN);
  this.isOrbiting = false;
  this.burstFrames = 0;
  // orbit assignment
  this.orbit = null; // {plane, ring, a, b, alpha, t, omega}
  this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      // Random jitter for erratic movement
  const jitterK = this.isOrbiting ? 0.15 : 1.0; // less jitter in orbit
  this.vx += (Math.random() - 0.5) * WANDER_JITTER * jitterK;
  this.vy += (Math.random() - 0.5) * WANDER_JITTER * jitterK;

      // Mouse interaction
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      const inRange = d2 <= INTERACTION_RADIUS * INTERACTION_RADIUS;

      if (mouse.down && inRange) {
        // Capture into nearest ellipse on one of the rotated planes
        const d = Math.sqrt(d2) || 1;
        if (!this.orbit) {
          let best = null;
          let bestErr = Infinity;
          for (let p = 0; p < ORBIT_PLANES.length; p++) {
            const alpha = ORBIT_PLANES[p];
            const ca = Math.cos(-alpha), sa = Math.sin(-alpha);
            // rotate point into plane frame
            const rx = (this.x - mouse.x) * ca - (this.y - mouse.y) * sa;
            const ry = (this.x - mouse.x) * sa + (this.y - mouse.y) * ca;
            for (let r = 0; r < ORBIT_RINGS.length; r++) {
              const a = ORBIT_RINGS[r];
              const b = a * ORBIT_ECC_RATIO * (0.9 + Math.random() * 0.2);
              // compute normalized radius error to ellipse
              const err = Math.abs(Math.hypot(rx / a, ry / b) - 1);
              if (err < bestErr) {
                bestErr = err;
                best = { plane: p, ring: r, a, b, alpha };
              }
            }
          }
          if (best) {
            const idx = Math.max(0, Math.min(ORBIT_OMEGA.length - 1, best.ring));
            const omega = ORBIT_OMEGA[idx] * (0.9 + Math.random() * 0.2);
            // initial parameter based on current rotated angle
            const ca = Math.cos(-best.alpha), sa = Math.sin(-best.alpha);
            const rx = (this.x - mouse.x) * ca - (this.y - mouse.y) * sa;
            const ry = (this.x - mouse.x) * sa + (this.y - mouse.y) * ca;
            const t0 = Math.atan2(ry / best.b, rx / best.a);
            this.orbit = { ...best, t: t0, omega };
          }
        }

        if (this.orbit) {
          // advance along orbit
          this.orbit.t += this.orbit.omega;
          const ca = Math.cos(this.orbit.alpha), sa = Math.sin(this.orbit.alpha);
          const px = this.orbit.a * Math.cos(this.orbit.t);
          const py = this.orbit.b * Math.sin(this.orbit.t);
          // rotate back to world
          const tx = mouse.x + px * ca - py * sa;
          const ty = mouse.y + px * sa + py * ca;
          const steerX = tx - this.x;
          const steerY = ty - this.y;
          // steer towards path
          this.vx += steerX * ORBIT_STIFFNESS;
          this.vy += steerY * ORBIT_STIFFNESS;
        }

        this.isOrbiting = true;
      } else if (!mouse.down) {
        // When not holding, clear orbit flag gradually
        this.isOrbiting = false;
        this.orbit = null;
      }

      // Clamp speed
      const sp2 = this.vx * this.vx + this.vy * this.vy;
      const max = this.isOrbiting ? MAX_SPEED_ORBIT : MAX_SPEED_NORMAL;
      const max2 = max * max;
      if (this.burstFrames > 0) {
        // Allow temporary exceed; apply light damping to settle back
        this.burstFrames--;
        this.vx *= 0.995;
        this.vy *= 0.995;
      } else if (sp2 > max2) {
        const s = Math.sqrt(sp2);
        this.vx = (this.vx / s) * max;
        this.vy = (this.vy / s) * max;
      }

      // Integrate
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around edges for continuous flow
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (this.x < -2) this.x = w + 2;
      else if (this.x > w + 2) this.x = -2;
      if (this.y < -2) this.y = h + 2;
      else if (this.y > h + 2) this.y = -2;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = COLOR;
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
  }

  const particles = Array.from({ length: BASE_COUNT }, () => new Particle());
  // no debug overlays

  function loop() {
  // Trails: fade towards background color
  ctx.globalAlpha = TRAIL_ALPHA;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

    // Draw
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.update();
      p.draw();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
  window.__particlesLoaded = true;
})();
