// Katie P Portfolio — Interactions & Animations

document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Phone carousel - center on second slide
    const centerCarousels = () => {
        const carousels = document.querySelectorAll('.carousel-track');

        carousels.forEach(carousel => {
            const slides = carousel.querySelectorAll('.carousel-slide');
            if (slides.length >= 2) {
                // Calculate scroll position to center second slide
                const slideWidth = slides[1].offsetWidth;
                const gap = 15; // gap between slides
                carousel.scrollLeft = slideWidth + gap;
            }
        });
    };

    // Center immediately and after a delay to ensure it works
    centerCarousels();
    setTimeout(centerCarousels, 100);
    setTimeout(centerCarousels, 500);

    // Update scale/opacity on scroll + mouse drag support
    const carousels = document.querySelectorAll('.carousel-track');
    carousels.forEach(carousel => {
        // Scale/opacity on scroll
        carousel.addEventListener('scroll', () => {
            const slides = carousel.querySelectorAll('.carousel-slide');
            const carouselRect = carousel.getBoundingClientRect();
            const centerX = carouselRect.left + carouselRect.width / 2;

            slides.forEach(slide => {
                const slideRect = slide.getBoundingClientRect();
                const slideCenterX = slideRect.left + slideRect.width / 2;
                const distance = Math.abs(centerX - slideCenterX);
                const maxDistance = carouselRect.width / 2;

                const scale = Math.max(0.75, 1 - (distance / maxDistance) * 0.25);
                const opacity = Math.max(0.5, 1 - (distance / maxDistance) * 0.5);

                const phone = slide.querySelector('.mini-phone');
                if (phone) {
                    phone.style.transform = `scale(${scale})`;
                    phone.style.opacity = opacity;
                }
            });
        });

        // Mouse drag support for desktop
        let isDown = false;
        let startX;
        let scrollLeft;

        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            carousel.style.cursor = 'grabbing';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });

        carousel.addEventListener('mouseleave', () => {
            isDown = false;
            carousel.style.cursor = 'grab';
        });

        carousel.addEventListener('mouseup', () => {
            isDown = false;
            carousel.style.cursor = 'grab';
        });

        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2;
            carousel.scrollLeft = scrollLeft - walk;
        });

        // Set initial cursor
        carousel.style.cursor = 'grab';
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe project cards and contact section
    document.querySelectorAll('.project-card, .contact-content').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add visible class styles
    const style = document.createElement('style');
    style.textContent = `
        .project-card.visible, .contact-content.visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // Stagger animation for project cards
    const projectCards = document.querySelectorAll('.project-card');
    projectCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 0.1}s`;
    });

    // Nav background opacity on scroll
    const nav = document.querySelector('.nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.background = 'rgba(253, 248, 243, 0.95)';
            nav.style.boxShadow = '0 2px 20px rgba(0,0,0,0.05)';
        } else {
            nav.style.background = 'rgba(253, 248, 243, 0.9)';
            nav.style.boxShadow = 'none';
        }
    });

    // Add cursor trail effect (subtle)
    const createTrailDot = (x, y) => {
        const dot = document.createElement('div');
        dot.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 8px;
            height: 8px;
            background: var(--coral);
            border-radius: 50%;
            pointer-events: none;
            z-index: 9998;
            opacity: 0.5;
            transition: transform 0.5s ease, opacity 0.5s ease;
        `;
        document.body.appendChild(dot);

        requestAnimationFrame(() => {
            dot.style.transform = 'scale(0)';
            dot.style.opacity = '0';
        });

        setTimeout(() => dot.remove(), 500);
    };

    let lastTrailTime = 0;
    document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastTrailTime > 50) {
            // Disabled by default - uncomment to enable trail effect
            // createTrailDot(e.clientX, e.clientY);
            lastTrailTime = now;
        }
    });
});
