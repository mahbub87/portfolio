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
const numParticles = isLowPower ? 150 : 400;
let isMouseDown = false;
let lastFrameTime = 0;
const maxFPS = 45; // Throttle to 45 FPS

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
}, 16)); // ~60FPS max

window.addEventListener("mouseout", () => {
  mouse.x = null;
  mouse.y = null;
});
window.addEventListener("mousedown", () => {
  isMouseDown = true;
});
window.addEventListener("mouseup", () => {
  isMouseDown = false;
});

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      this.size * 4
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
  const maxConnections = 5;
  const connectionCount = new Array(particles.length).fill(0);

  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i];
    if (connectionCount[i] >= maxConnections) continue;

    for (let j = i + 1; j < particles.length; j++) {
      if (connectionCount[j] >= maxConnections) continue;

      const dx = p1.x - particles[j].x;
      const dy = p1.y - particles[j].y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 10000) {
        const alpha = 1 - distSq / 10000;
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

for (let i = 0; i < numParticles; i++) {
  particles.push(new Particle());
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  mouse.radius = isMouseDown ? 450 : 250;

  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
  }

  drawConnections();
  requestAnimationFrame(animate); 
}
requestAnimationFrame(animate);


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
