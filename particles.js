// Tiny, fast black particles with orbit-on-hold (no burst)
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
  // Solid black for strokes (no theme switching)
  const COLOR = '#000000';

  const MAX_SPEED_NORMAL = 2.2; // px/frame (very fast)
  const MAX_SPEED_ORBIT = 10.0;  // allow higher when orbiting
  const MIN_SPEED = 1.2;
  const WANDER_JITTER = 0.01; // very small random steering noise
  const INTERACTION_RADIUS = 150; // px (pull radius)
  // Orbit settings
  const ORBIT_STIFFNESS = 0.5; // steering towards target path
  // Electron-like orbit planes and rings
  const ORBIT_PLANES = [0, Math.PI / 3, -Math.PI / 3]; // 0°, +60°, -60°
  const ORBIT_RINGS = [30, 56, 86, 116];
  const ORBIT_ECC_RATIO = 0.62; // b = a * ratio
  const ORBIT_OMEGA = [0.14, 0.11, 0.09, 0.075]; // angular speeds per ring
  // Idle attraction (when not clicking)
  const IDLE_ATTRACT_RADIUS = 220;
  const IDLE_ATTRACT_STRENGTH = 0.015;
  // Snowfall params (used when not orbiting)
  const FALL_GRAVITY = 0.01; // gentle gravity for slow fall
  const WIND_BASE = 0.0001; // extremely small wind amplitude
  const WIND_FREQ = 0.0001; // slower wind change
  const WIND_JITTER = 0.002; // very subtle per-particle drift
  const DOT_MIN = 0.4; // smaller far flakes
  const DOT_MAX = 2.6; // larger near flakes for stronger depth
  // Parallax hint (max pixel offset applied in draw based on depth)
  const PARALLAX_MAG = 8;
  // Release behavior constants
  const RELEASE_DECAY = 0.94; // stronger per-frame slowdown right after release
  const RELEASE_SPEED_THRESHOLD = 0.8; // switch to gravity-only a bit sooner

  const mouse = { x: -9999, y: -9999, down: false };
  let time = 0;
  let wind = 0;

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
  // Release: stop orbit capture; keep current velocity, remain free until respawn
    mouse.down = false;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.isOrbiting) {
    p.released = true;
        p.isOrbiting = false;
        p.orbit = null;
      }
    }
  });

  // Particle system
  class Particle {
    constructor() {
      this.reset(false); // initial scatter across screen
    }
    reset(spawnAtEdge = false) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (spawnAtEdge) {
        const topSpawn = Math.random() < 0.7;
        if (topSpawn) {
          this.x = Math.random() * w;
          this.y = -6;
        } else {
          const fromLeft = Math.random() < 0.5;
          this.x = fromLeft ? -6 : w + 6;
          this.y = Math.random() * (h * 0.8);
        }
      } else {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
      }
  // slow initial drift; snowfall forces will take over
  this.vx = (Math.random() - 0.5) * 0.25;
  this.vy = 0.2 + Math.random() * 0.4;
  // depth and visuals
  this.depth = Math.pow(Math.random(), 1.7); // bias toward distant small flakes
  this.r = DOT_MIN + this.depth * (DOT_MAX - DOT_MIN);
  this.armLen = 2 + this.depth * 9; // visual arm length
  this.lineWidth = 1.0; // constant stroke width
  this.alpha = 0.6; // base alpha; twinkle will modulate slightly
  this.twinkle = (this.depth < 0.45) ? (Math.random() * 0.03 + 0.01) : 0; // small flicker for far
 
  this.arms = 6
  // rotation for non-circular shape
  this.angle = Math.random() * Math.PI * 2;
  this.spin = (Math.random() - 0.5) * 0.06; // subtle rotation
  this.isOrbiting = false;
  // remain free (no snowfall) after release until respawn
  this.released = false;
  this.releaseGravity = false; // once true, apply gravity-only while released
  // orbit assignment
  this.orbit = null; // {plane, ring, a, b, alpha, t, omega}
  this.phase = Math.random() * Math.PI * 2;
  // per-particle terminal fall speed (near = slightly faster)
  this.terminalVy = 0.30 + this.depth * 0.55 + Math.random() * 0.05; // ~0.30..0.90
    }
    update() {
      // Random jitter for erratic movement
  const jitterK = this.isOrbiting ? 0.15 : (this.released ? 0.0 : 1.0); // no jitter when released
  this.vx += (Math.random() - 0.5) * WANDER_JITTER * jitterK;
  this.vy += (Math.random() - 0.5) * WANDER_JITTER * jitterK;
  // twinkle for distant flakes
  if (this.twinkle) {
    this.alpha += (Math.random() - 0.5) * this.twinkle;
    if (this.alpha < 0.25) this.alpha = 0.25;
    if (this.alpha > 0.9) this.alpha = 0.9;
  }
  // spin update
  this.angle += this.spin;

      // Mouse interaction
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      const inRange = d2 <= INTERACTION_RADIUS * INTERACTION_RADIUS;

  if (mouse.down && inRange) {
        // capture cancels released state
        this.released = false;
        this.releaseGravity = false;
        const d = Math.sqrt(d2) || 1;
        // Electron-like: choose nearest ellipse on rotated planes
        if (!this.orbit) {
          let best = null;
          let bestErr = Infinity;
          for (let p = 0; p < ORBIT_PLANES.length; p++) {
            const alpha = ORBIT_PLANES[p];
            const ca = Math.cos(-alpha), sa = Math.sin(-alpha);
            const rx = (this.x - mouse.x) * ca - (this.y - mouse.y) * sa;
            const ry = (this.x - mouse.x) * sa + (this.y - mouse.y) * ca;
            for (let r = 0; r < ORBIT_RINGS.length; r++) {
              const a = ORBIT_RINGS[r];
              const b = a * ORBIT_ECC_RATIO * (0.9 + Math.random() * 0.2);
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
            const ca = Math.cos(-best.alpha), sa = Math.sin(-best.alpha);
            const rx = (this.x - mouse.x) * ca - (this.y - mouse.y) * sa;
            const ry = (this.x - mouse.x) * sa + (this.y - mouse.y) * ca;
            const t0 = Math.atan2(ry / best.b, rx / best.a);
            this.orbit = { ...best, t: t0, omega };
          }
        }

        if (this.orbit) {
          // advance along ellipse and steer toward path
          this.orbit.t += this.orbit.omega;
          const ca = Math.cos(this.orbit.alpha), sa = Math.sin(this.orbit.alpha);
          const px = this.orbit.a * Math.cos(this.orbit.t);
          const py = this.orbit.b * Math.sin(this.orbit.t);
          const tx = mouse.x + px * ca - py * sa;
          const ty = mouse.y + px * sa + py * ca;
          const steerX = tx - this.x;
          const steerY = ty - this.y;
          this.vx += steerX * ORBIT_STIFFNESS;
          this.vy += steerY * ORBIT_STIFFNESS;
        }

        this.isOrbiting = true;
    } else if (!mouse.down) {
        // When not holding, clear orbit flag gradually
        this.isOrbiting = false;
        this.orbit = null;
        // Gentle idle attraction to mouse when near (applies to released as well)
          const ar2 = IDLE_ATTRACT_RADIUS * IDLE_ATTRACT_RADIUS;
        if (d2 <= ar2) {
          const d = Math.sqrt(d2) || 1;
          const ax = (mouse.x - this.x) / d;
          const ay = (mouse.y - this.y) / d;
            const s = IDLE_ATTRACT_STRENGTH * (0.4 + 0.6 * this.depth); // far respond less
            this.vx += ax * s;
            this.vy += ay * s;
        }
            if (this.released) {
              // Released behavior
              if (!this.releaseGravity) {
                // Stage 1: decelerate gradually until slow enough
                this.vx *= RELEASE_DECAY;
                this.vy *= RELEASE_DECAY;
                const sp2rel = this.vx * this.vx + this.vy * this.vy;
                if (sp2rel < RELEASE_SPEED_THRESHOLD * RELEASE_SPEED_THRESHOLD) {
                  this.releaseGravity = true; // switch to gravity-only fall
                }
              } else {
                // Stage 2: gravity-only fall (no wind/drag)
                this.vy += FALL_GRAVITY;
                // Optional: cap vertical speed to terminal
                if (this.vy > this.terminalVy) this.vy = this.terminalVy;
              }
            } else {
          // Snowfall behavior
          this.vy += FALL_GRAVITY;
          this.vx += wind * 0.01 + (Math.random() - 0.5) * WIND_JITTER;
          // horizontal drag and cap to avoid fast sideways motion
          this.vx *= 0.92;
          const MAX_SIDE = 0.35;
          if (this.vx > MAX_SIDE) this.vx = MAX_SIDE;
          if (this.vx < -MAX_SIDE) this.vx = -MAX_SIDE;
          // limit fall speed to terminal velocity
          if (this.vy > this.terminalVy) this.vy = this.terminalVy;
        }
      }

      // Clamp speed
  const sp2 = this.vx * this.vx + this.vy * this.vy;
  if (!this.released) {
        const max = this.isOrbiting ? MAX_SPEED_ORBIT : MAX_SPEED_NORMAL;
        const max2 = max * max;
        if (sp2 > max2) {
          const s = Math.sqrt(sp2);
          this.vx = (this.vx / s) * max;
          this.vy = (this.vy / s) * max;
        }
      }

      // Integrate
      this.x += this.vx;
      this.y += this.vy;

      // Respawn when off-screen (top/side spawn)
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (this.y > h + 8 || this.x < -8 || this.x > w + 8) {
        this.reset(true);
        this.released = false;
  this.releaseGravity = false;
      }
    }
    draw() {
      // Draw a branched snowflake with shape variety, twinkle, rotation and parallax hint
      const arm = this.armLen;
      const twigAngle = 0.5; // ~28°
      const t1 = arm * 0.55;
      const t2 = arm * 0.82;
      const twig1 = Math.max(0.8, arm * 0.26);
      const twig2 = Math.max(0.6, arm * 0.16);
      ctx.save();
      // subtle parallax offset based on depth and mouse position
      let px = 0, py = 0;
      const w = window.innerWidth, h = window.innerHeight;
      if (mouse.x >= 0 && mouse.y >= 0) {
        const mx = (mouse.x - w / 2) / w; // -0.5..0.5-ish
        const my = (mouse.y - h / 2) / h;
        const scale = (1 - this.depth); // nearer = bigger shift
        px = -mx * PARALLAX_MAG * scale;
        py = -my * (PARALLAX_MAG * 0.6) * scale;
      }
      ctx.translate(this.x + px, this.y + py);
      ctx.rotate(this.angle);
      ctx.globalAlpha = this.alpha;
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = this.lineWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < this.arms; i++) {
        const a = i * Math.PI / 3;
        const ca = Math.cos(a), sa = Math.sin(a);
        // main arm
        ctx.moveTo(0, 0);
        ctx.lineTo(arm * ca, arm * sa);
        // first branches
        const x1 = t1 * ca, y1 = t1 * sa;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + twig1 * Math.cos(a + twigAngle), y1 + twig1 * Math.sin(a + twigAngle));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + twig1 * Math.cos(a - twigAngle), y1 + twig1 * Math.sin(a - twigAngle));
        // second smaller branches near tip
        const x2 = t2 * ca, y2 = t2 * sa;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 + twig2 * Math.cos(a + twigAngle), y2 + twig2 * Math.sin(a + twigAngle));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 + twig2 * Math.cos(a - twigAngle), y2 + twig2 * Math.sin(a - twigAngle));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  const particles = Array.from({ length: BASE_COUNT }, () => new Particle());
  // no debug overlays

  function loop() {
  // Clear fully each frame (no trails)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // update wind over time
  time += 1;
  wind = Math.sin(time * WIND_FREQ) * WIND_BASE;

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
