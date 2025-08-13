// --- Navigation ---
const navItems = document.querySelectorAll('.NavItem');
const sections = document.querySelectorAll('.Section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.getAttribute('DataSection');
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  });
});

// IntersectionObserver (unchanged)
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const navItem = document.querySelector(`.NavItem[DataSection="${entry.target.id}"]`);
    if (entry.isIntersecting && navItem) {
      navItems.forEach(item => item.classList.remove('active'));
      navItem.classList.add('active');
    }
  });
}, {
  root: null,
  rootMargin: '0px 0px -40% 0px',
  threshold: 0.1
});

sections.forEach(section => observer.observe(section));

// --- Canvas Particle System ---
const canvas = document.getElementById("ParticleCanvas");
const ctx = canvas.getContext("2d");

let particles = [];
const isLowPower = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let numParticles = isLowPower ? 150 : 400; // baseline
if (prefersReducedMotion) numParticles = Math.min(numParticles, 120);
let isMouseDown = false;
let lastFrameTime = 0;
let rafId = null;
const maxFPS = prefersReducedMotion ? 30 : 60; // target smoothness everywhere

// Connection and glow tuning (adaptive)
let maxConnectionsPerParticle = isLowPower ? 3 : 5;
let connectionDistance = isLowPower ? 90 : 100; // px
let connectionDistSq = connectionDistance * connectionDistance;
let cellSize = connectionDistance + 20; // grid cell approx
let glowScale = 4; // particle glow radius multiplier

// Adaptive performance controller
const perf = {
  frames: 0,
  lastSample: performance.now(),
  fps: 60,
  degradeLevel: 0, // increases when slow
  minParticles: 90,
  maxParticles: isLowPower ? 200 : 450,
};

function setParticleCount(target) {
  target = Math.max(perf.minParticles, Math.min(perf.maxParticles, Math.round(target)));
  const diff = target - particles.length;
  if (diff > 0) {
    for (let i = 0; i < diff; i++) particles.push(new Particle());
  } else if (diff < 0) {
    particles.length = target; // trim
  }
}

function applyDegrade(level) {
  // Level 0 is baseline visuals. Increasing level trades visuals for speed.
  // Map level to adjustments.
  const baseCount = numParticles;
  const newCount = baseCount * (1 - Math.min(level * 0.12, 0.5));
  setParticleCount(newCount);

  // Reduce connection density and distance
  const baseConn = isLowPower ? 3 : 5;
  maxConnectionsPerParticle = Math.max(2, Math.round(baseConn - level * 0.5));
  connectionDistance = Math.max(70, Math.round((isLowPower ? 90 : 100) - level * 5));
  connectionDistSq = connectionDistance * connectionDistance;
  cellSize = connectionDistance + 20;

  // Lower glow area slightly
  glowScale = Math.max(3, 4 - level * 0.3);
}

const mouse = {
  x: null,
  y: null,
  radius: 250,
};

const throttle = (fn, limit) => {
  let waiting = false;
  return (...args) => {
    if (!waiting) {
      requestAnimationFrame(() => fn(...args));
      waiting = true;
      setTimeout(() => (waiting = false), limit);
    }
  };
};

window.addEventListener("mousemove", throttle((e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
}, 16), { passive: true }); // ~60FPS max

window.addEventListener("mouseout", () => {
  mouse.x = null;
  mouse.y = null;
}, { passive: true });
window.addEventListener("mousedown", () => {
  isMouseDown = true;
}, { passive: true });
window.addEventListener("mouseup", () => {
  isMouseDown = false;
}, { passive: true });

function resizeCanvas() {
  const dprCap = prefersReducedMotion ? 1.5 : 2; // keep crisp visuals like before unless reduced motion
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 2 + 1;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.alpha = Math.random() * 0.5 + 0.3;

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 0.05 + 0.01;
    this.baseDX = Math.cos(angle) * speed;
    this.baseDY = Math.sin(angle) * speed;

    const colorOptions = [
      [137, 207, 240],
      [173, 216, 230],
    
    ];
    [this.r, this.g, this.b] = colorOptions[Math.floor(Math.random() * colorOptions.length)];
  }

  update() {
    this.ax += (Math.random() - 0.5) * 0.005;
    this.ay += (Math.random() - 0.5) * 0.005;

    if (mouse.x !== null && mouse.y !== null) {
      let dx = mouse.x - this.x;
      let dy = mouse.y - this.y;
      let distSq = dx * dx + dy * dy;

      if (distSq < mouse.radius * mouse.radius) {
        let dist = Math.sqrt(distSq);
        let force = (mouse.radius - dist) / mouse.radius;
        let angle = Math.atan2(dy, dx);

        if (isMouseDown) {
          const cForce = force * 0.1;
          const tForce = force * 0.15;
          this.ax += Math.cos(angle) * cForce + Math.cos(angle + Math.PI / 2) * tForce;
          this.ay += Math.sin(angle) * cForce + Math.sin(angle + Math.PI / 2) * tForce;
        } else {
          this.ax += Math.cos(angle) * force * 0.05;
          this.ay += Math.sin(angle) * force * 0.05;
        }
      }
    }

    this.vx += this.baseDX + this.ax;
    this.vy += this.baseDY + this.ay;
    this.ax *= 0.7;
    this.ay *= 0.7;
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.x += this.vx;
    this.y += this.vy;

    if (
      this.x < -50 ||
      this.x > canvas.width + 50 ||
      this.y < -50 ||
      this.y > canvas.height + 50
    ) {
      this.reset();
    }
  }

  draw() {
    const gradient = ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
  this.y,
  this.size * glowScale
    );
    gradient.addColorStop(0, `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha})`);
    gradient.addColorStop(1, "rgba(13, 20, 36, 0)");

    ctx.shadowBlur = 0;
    ctx.shadowColor = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha})`;

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawConnections() {
  if (prefersReducedMotion) return; // Skip connections to reduce motion/CPU

  const maxConnections = maxConnectionsPerParticle;
  const connectionCount = new Array(particles.length).fill(0);
  const grid = new Map();

  const key = (cx, cy) => `${cx},${cy}`;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const k = key(cx, cy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  const neighbors = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
  ];

  for (let i = 0; i < particles.length; i++) {
    if (connectionCount[i] >= maxConnections) continue;
    const p1 = particles[i];
    const cx = Math.floor(p1.x / cellSize);
    const cy = Math.floor(p1.y / cellSize);

    for (const [dxCell, dyCell] of neighbors) {
      const list = grid.get(key(cx + dxCell, cy + dyCell));
      if (!list) continue;
      for (const j of list) {
        if (j <= i) continue; // avoid duplicates
        if (connectionCount[i] >= maxConnections) break;
        if (connectionCount[j] >= maxConnections) continue;

        const dx = p1.x - particles[j].x;
        const dy = p1.y - particles[j].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < connectionDistSq) {
          const alpha = 1 - distSq / connectionDistSq;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.2})`;
          ctx.lineWidth = 1;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          connectionCount[i]++;
          connectionCount[j]++;
        }
      }
    }
  }
}

for (let i = 0; i < numParticles; i++) particles.push(new Particle());

function animate(timestamp) {
  // FPS cap only when needed (< 60) to avoid choppiness
  if (maxFPS < 60 && lastFrameTime && timestamp - lastFrameTime < 1000 / maxFPS) {
    rafId = requestAnimationFrame(animate);
    return;
  }
  lastFrameTime = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  mouse.radius = isMouseDown ? 450 : 250;

  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
  }

  // Draw connections every frame for original visual smoothness (kept fast via spatial hashing)
  drawConnections();
  
  // Adaptive performance sampling every ~500ms
  perf.frames++;
  const now = performance.now();
  if (now - perf.lastSample >= 500) {
    const elapsed = (now - perf.lastSample) / 1000;
    perf.fps = Math.round(perf.frames / elapsed);
    perf.frames = 0;
    perf.lastSample = now;

    // Degrade when FPS is low; recover gradually when high
    if (perf.fps < 50) {
      perf.degradeLevel = Math.min(perf.degradeLevel + 1, 6);
      applyDegrade(perf.degradeLevel);
    } else if (perf.fps > 58 && perf.degradeLevel > 0) {
      perf.degradeLevel = Math.max(perf.degradeLevel - 1, 0);
      applyDegrade(perf.degradeLevel);
    }
  }
  rafId = requestAnimationFrame(animate);
}
rafId = requestAnimationFrame(animate);

// Pause animation when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  } else if (!rafId) {
    lastFrameTime = 0; // reset timing to avoid burst
    rafId = requestAnimationFrame(animate);
  }
});


window.addEventListener("click", () => {
  if (mouse.x !== null && mouse.y !== null) {
    particles.forEach((p) => {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < mouse.radius * mouse.radius) {
        const dist = Math.sqrt(distSq);
        const angle = Math.atan2(dy, dx);
        const burstForce = ((mouse.radius - dist) / mouse.radius) * 30;
        p.vx += Math.cos(angle) * burstForce;
        p.vy += Math.sin(angle) * burstForce;
      }
    });
  }
});

// Auto-pause project preview videos when offscreen to save CPU
const projectVideos = Array.from(document.querySelectorAll('video.ProjectImage'));
if ('IntersectionObserver' in window && projectVideos.length) {
  const vObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (isIntersecting) {
        target.play().catch(() => {});
      } else {
        target.pause();
      }
    });
  }, { threshold: 0.25 });
  projectVideos.forEach(v => vObserver.observe(v));
}
