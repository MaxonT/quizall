(function() {
  function createParticles() {
    // Check if container already exists to avoid duplicates
    if (document.querySelector('.particles-container')) return;

    const container = document.createElement('div');
    container.className = 'particles-container';
    container.setAttribute('aria-hidden', 'true');
    // Force z-index 0 to ensure it sits above body background but behind content (z-index: 1)
    container.style.zIndex = '0'; 
    
    // Insert as the first child of body
    document.body.prepend(container);

    // Increased count for "2x more visible" effect
    const particleCount = 32; 

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      
      // Increased size range: 3px - 7px (vs 2-5px)
      const size = Math.random() * 4 + 3; 
      const posX = Math.random() * 100; // 0% - 100%
      const posY = Math.random() * 100; // 0% - 100%
      const duration = Math.random() * 20 + 15; // 15s - 35s
      const delay = Math.random() * -30; // Start mid-animation

      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${posX}%`;
      particle.style.top = `${posY}%`;
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${delay}s`;

      container.appendChild(particle);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createParticles);
  } else {
    createParticles();
  }
})();
