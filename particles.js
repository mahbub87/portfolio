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
  const COLOR = '#000'; // solid black

  const MAX_SPEED_NORMAL = 2.2; // px/frame (very fast)
  const MAX_SPEED_ORBIT = 10.0;  // allow higher when orbiting
  const MIN_SPEED = 1.2;
  const WANDER_JITTER = 0.01; // very small random steering noise
  const INTERACTION_RADIUS = 250; // px (bigger pull radius)
  // Circular orbit settings
  const ORBIT_STIFFNESS = 0.5; // steering towards target path
  // Snowfall params (used when not orbiting)
  const FALL_GRAVITY = 0.01; // gentle gravity for slow fall
  const WIND_BASE = 0.0001; // extremely small wind amplitude
  const WIND_FREQ = 0.0001; // slower wind change
  const WIND_JITTER = 0.002; // very subtle per-particle drift
  const DOT_MIN = 0.7; // radius px small
  const DOT_MAX = 1.2;
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
  this.r = DOT_MIN + Math.random() * (DOT_MAX - DOT_MIN);
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
  // per-particle terminal fall speed for realistic slow descent
  this.terminalVy = 0.35 + Math.random() * 0.4; // 0.35..0.75 px/frame
    }
    update() {
      // Random jitter for erratic movement
  const jitterK = this.isOrbiting ? 0.15 : (this.released ? 0.0 : 1.0); // no jitter when released
  this.vx += (Math.random() - 0.5) * WANDER_JITTER * jitterK;
  this.vy += (Math.random() - 0.5) * WANDER_JITTER * jitterK;
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
        // Circular orbit around the mouse
        const d = Math.sqrt(d2) || 1;
  if (!this.orbit) {
          // clamp radius to keep within a comfortable band
          const minR = 24;
          const maxR = Math.max(minR + 6, INTERACTION_RADIUS * 0.9);
          const r = Math.max(minR, Math.min(maxR, d));
          const t0 = Math.atan2(dy, dx);
          const omega = 0.14 * (0.9 + Math.random() * 0.2); // per-particle speed
          this.orbit = { r, t: t0, omega };
        }

        if (this.orbit) {
          // advance angle and steer towards circular path
          this.orbit.t += this.orbit.omega;
          const tx = mouse.x + this.orbit.r * Math.cos(this.orbit.t);
          const ty = mouse.y + this.orbit.r * Math.sin(this.orbit.t);
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
      // Draw a small snowflake: 6-armed asterisk (rotates subtly)
      const arm = Math.max(1.2, this.r * 2.8);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3;
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(-arm * ca, -arm * sa);
        ctx.lineTo(arm * ca, arm * sa);
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
