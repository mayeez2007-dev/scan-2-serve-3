// ===================================
// Enhanced Animations & Interactivity
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all enhancements
    initScrollReveal();
    initNavbarEffects();
    initSmoothScroll();
    enhanceButtons();
    
    // Page fade-in
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.6s ease';
        document.body.style.opacity = '1';
    }, 100);
    
    // Update cart count on page load
    if (typeof updateCartCount === 'function') {
        updateCartCount();
    }
});

// ===================================
// Scroll Reveal Animations
// ===================================
function initScrollReveal() {
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Auto-add scroll-reveal to common elements
    const elementsToReveal = document.querySelectorAll(
        '.feature-card, .hours-item, .about-text, .menu-item, .scroll-reveal'
    );
    
    elementsToReveal.forEach(el => {
        if (!el.classList.contains('scroll-reveal')) {
            el.classList.add('scroll-reveal');
        }
        observer.observe(el);
    });
}

// ===================================
// Enhanced Navbar Effects
// ===================================
function initNavbarEffects() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    let lastScroll = 0;
    const scrollThreshold = 50;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > scrollThreshold) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });
}

// ===================================
// Smooth Scroll
// ===================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offset = 80;
                const targetPosition = target.offsetTop - offset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ===================================
// Enhanced Button Effects
// ===================================
function enhanceButtons() {
    const buttons = document.querySelectorAll('.btn, .menu-item-btn, .category-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.background = 'rgba(255, 255, 255, 0.5)';
            ripple.style.pointerEvents = 'none';
            ripple.style.animation = 'ripple-animation 0.6s ease-out';
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// Add ripple animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ===================================
// Enhanced Toast with Confetti
// ===================================
function showToast(message) {
    let toast = document.getElementById('toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    // Add confetti for success messages
    if (message.toLowerCase().includes('added')) {
        createConfetti();
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===================================
// Confetti Animation
// ===================================
function createConfetti() {
    const colors = ['#D4AF37', '#1E3A8A', '#F59E0B', '#3B82F6', '#FCD34D'];
    const confettiCount = 20;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = '50%';
        confetti.style.top = '50%';
        confetti.style.borderRadius = '50%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '10000';
        confetti.style.opacity = '1';
        confetti.style.transition = 'all 1.2s ease-out';
        
        document.body.appendChild(confetti);
        
        setTimeout(() => {
            const angle = (Math.PI * 2 * i) / confettiCount;
            const velocity = 150 + Math.random() * 150;
            const x = Math.cos(angle) * velocity;
            const y = Math.sin(angle) * velocity - 150;
            
            confetti.style.transform = `translate(${x}px, ${y}px) rotate(${Math.random() * 720}deg)`;
            confetti.style.opacity = '0';
        }, 50);
        
        setTimeout(() => {
            confetti.remove();
        }, 1300);
    }
}

// Make showToast globally available
window.showToast = showToast;

// ===================================
// Enhanced Menu Filtering
// ===================================
if (document.getElementById('menu-items')) {
    const categoryButtons = document.querySelectorAll('.category-btn');
    
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            const menuContainer = document.getElementById('menu-items');
            
            // Fade out animation
            menuContainer.style.opacity = '0.3';
            menuContainer.style.transform = 'scale(0.95)';
            
            setTimeout(() => {
                // Fade in animation
                menuContainer.style.transition = 'all 0.4s ease';
                menuContainer.style.opacity = '1';
                menuContainer.style.transform = 'scale(1)';
            }, 300);
        });
    });
}

// ===================================
// Parallax Effect (Subtle)
// ===================================
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector('.hero');
    const pageHeader = document.querySelector('.page-header');
    
    if (hero && scrolled < window.innerHeight) {
        hero.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
    
    if (pageHeader && scrolled < 300) {
        pageHeader.style.transform = `translateY(${scrolled * 0.2}px)`;
    }
});
