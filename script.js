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


// Fallback: ensure particles script is loaded
(function ensureParticles() {
  // if canvas or global flag missing after a tick, try injecting
  setTimeout(() => {
    const hasCanvas = !!document.getElementById('bg-particles');
    const loadedFlag = (typeof window !== 'undefined') && !!window.__particlesLoaded;
    if (!hasCanvas || !loadedFlag) {
      const s = document.createElement('script');
      s.src = 'particles.js?v=3';
      s.onload = () => console.warn('Particles fallback script injected.');
      document.body.appendChild(s);
    }
  }, 600);
})();

// Global wheel forwarding: always scroll the RightPanel, regardless of cursor location
(function globalScrollToRightPanel() {
  const rightPanel = document.getElementById('RightPanel');
  if (!rightPanel) return;
  const handler = (e) => {
    // Scale wheel amount if deltaMode is lines (Firefox); otherwise pixels
    const scale = e.deltaMode === 1 ? 16 : 1;
    const dy = e.deltaY * scale;
    const dx = e.deltaX * scale;
    // Apply vertical primarily; support horizontal if user scrolls sideways
    if (dy !== 0 || dx !== 0) {
      e.preventDefault();
      rightPanel.scrollBy({ top: dy, left: dx, behavior: 'auto' });
    }
  };
  // Use non-passive to allow preventDefault
  window.addEventListener('wheel', handler, { passive: false });
})();

