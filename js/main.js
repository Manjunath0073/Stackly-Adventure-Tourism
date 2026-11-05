(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = Boolean(motionQuery && motionQuery.matches);
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav__toggle');
  const navPanel = document.querySelector('.nav__panel');
  let frameRequested = false;
  let navBackdrop = null;

  root.classList.add('js');

  function ensureNavBackdrop() {
    if (!nav) return null;
    if (navBackdrop) return navBackdrop;
    navBackdrop = document.createElement('div');
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.setAttribute('aria-hidden', 'true');
    navBackdrop.addEventListener('click', function () {
      setNavOpen(false, true);
    });
    document.body.appendChild(navBackdrop);
    return navBackdrop;
  }

  function setNavOpen(open, returnFocus) {
    if (!nav || !navToggle || !navPanel) return;
    const backdrop = ensureNavBackdrop();
    nav.classList.toggle('is-open', open);
    if (header) header.classList.toggle('nav-open', open);
    if (backdrop) backdrop.classList.toggle('is-visible', open);
    body.classList.toggle('menu-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');

    if (open) {
      const firstLink = navPanel.querySelector('.nav__link');
      if (firstLink) firstLink.focus();
    } else if (returnFocus) {
      navToggle.focus();
    }
  }

  function initNavExtras() {
    if (!navPanel || navPanel.querySelector('[data-nav-extras]')) return;

    const intro = document.createElement('div');
    intro.className = 'nav__panel-intro';
    intro.setAttribute('data-nav-extras', '');

    const kicker = document.createElement('p');
    kicker.className = 'nav__panel-kicker';
    kicker.textContent = 'Field planning';

    const lede = document.createElement('p');
    lede.className = 'nav__panel-lede';
    lede.textContent = 'Local knowledge, honest pace and room for the weather to change the route.';

    intro.appendChild(kicker);
    intro.appendChild(lede);
    navPanel.insertBefore(intro, navPanel.firstChild);

    const meta = document.createElement('div');
    meta.className = 'nav__panel-meta';

    const place = document.createElement('span');
    place.textContent = 'Salem, Tamil Nadu';

    const rule = document.createElement('span');
    rule.className = 'nav__panel-meta-rule';
    rule.setAttribute('aria-hidden', 'true');

    const contact = document.createElement('a');
    contact.href = 'contact.html';
    contact.appendChild(document.createTextNode('Talk to us '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2192';
    contact.appendChild(arrow);

    meta.appendChild(place);
    meta.appendChild(rule);
    meta.appendChild(contact);
    navPanel.appendChild(meta);
  }

  initNavExtras();

  function isMobileNavigation() {
    return window.matchMedia ? window.matchMedia('(max-width: 900px)').matches : window.innerWidth <= 900;
  }

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      setNavOpen(navToggle.getAttribute('aria-expanded') !== 'true', false);
    });
  }

  if (navPanel) {
    navPanel.addEventListener('click', function (event) {
      const link = event.target.closest('a[href]');
      if (link && isMobileNavigation()) setNavOpen(false, false);
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && nav && nav.classList.contains('is-open')) {
      setNavOpen(false, true);
    }

    if (event.key === 'Tab' && nav && nav.classList.contains('is-open') && isMobileNavigation()) {
      const focusable = Array.from(nav.querySelectorAll('.nav__toggle, .nav__panel a[href], .nav__panel button:not([disabled])'))
        .filter(function (element) {
          return element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== 'hidden';
        });
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  if (window.matchMedia) {
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const closeOnDesktop = function (event) {
      if (!event.matches && nav && nav.classList.contains('is-open')) setNavOpen(false, false);
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', closeOnDesktop);
    else if (mobileQuery.addListener) mobileQuery.addListener(closeOnDesktop);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 40);
  }

  function updateScrollEffects() {
    frameRequested = false;
    updateHeader();
    if (reducedMotion) return;

    const viewportHeight = window.innerHeight || 1;
    const hero = document.querySelector('.hero');
    const heroVisual = document.querySelector('[data-hero-parallax]');
    if (hero && heroVisual) {
      const heroRect = hero.getBoundingClientRect();
      const heroProgress = clamp(-heroRect.top / Math.max(heroRect.height, 1), 0, 1);
      heroVisual.style.setProperty('--hero-drift', (heroProgress * -42).toFixed(1) + 'px');
      document.querySelectorAll('[data-float-card]').forEach(function (card, index) {
        const direction = index === 0 ? 1 : -1;
        card.style.setProperty('--float-drift', (heroProgress * direction * 16).toFixed(1) + 'px');
      });
    }

    document.querySelectorAll('[data-device-tilt]').forEach(function (device) {
      const rect = device.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const progress = clamp((viewportHeight * .82 - center) / (viewportHeight * .72), 0, 1);
      device.style.setProperty('--device-x', ((1 - progress) * 8).toFixed(2) + 'deg');
      device.style.setProperty('--device-y', ((1 - progress) * -8).toFixed(2) + 'deg');
    });

    document.querySelectorAll('[data-timeline]').forEach(function (timeline) {
      const rect = timeline.getBoundingClientRect();
      const progress = clamp((viewportHeight * .8 - rect.top) / (rect.height * .82), 0, 1);
      timeline.style.setProperty('--timeline-progress', progress.toFixed(3));
      const steps = timeline.querySelectorAll('.process__step');
      steps.forEach(function (step, index) {
        step.classList.toggle('is-active', progress >= (index + 1) / steps.length * .82);
      });
    });

    document.querySelectorAll('[data-cta-section]').forEach(function (section) {
      const rect = section.getBoundingClientRect();
      const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
      const title = section.querySelector('[data-cta-title]');
      if (title) title.style.setProperty('--cta-scale', (1.035 - progress * .035).toFixed(3));
    });
  }

  function requestScrollFrame() {
    if (frameRequested) return;
    frameRequested = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(updateScrollEffects);
    else updateScrollEffects();
  }

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });
  updateScrollEffects();

  function setVisible(element) {
    element.classList.add('is-visible');
  }

  function formatCounter(value, digits) {
    return String(value).padStart(digits, '0');
  }

  function animateCounter(element) {
    if (element.dataset.countStarted === 'true') return;
    element.dataset.countStarted = 'true';
    const target = Number(element.dataset.counter);
    const digits = Math.max(1, Number(element.dataset.digits) || 1);
    if (!Number.isFinite(target) || reducedMotion || !window.requestAnimationFrame) {
      element.textContent = formatCounter(Number.isFinite(target) ? target : 0, digits);
      return;
    }

    const duration = 1200;
    const start = window.performance && window.performance.now ? window.performance.now() : Date.now();
    element.textContent = formatCounter(0, digits);

    function tick(now) {
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const value = Math.round(target * eased);
      element.textContent = formatCounter(value, digits);
      if (elapsed < 1) window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  }

  const revealElements = Array.from(document.querySelectorAll('[data-reveal], [data-counter]'));
  if (reducedMotion) {
    revealElements.forEach(function (element) {
      setVisible(element);
      if (element.hasAttribute('data-counter')) animateCounter(element);
    });
  } else if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        setVisible(entry.target);
        if (entry.target.hasAttribute('data-counter')) animateCounter(entry.target);
        entry.target.querySelectorAll('[data-counter]').forEach(animateCounter);
        observer.unobserve(entry.target);
      });
    }, { threshold: .14, rootMargin: '0px 0px -40px 0px' });
    revealElements.forEach(function (element) { revealObserver.observe(element); });
  } else {
    revealElements.forEach(function (element) {
      setVisible(element);
      if (element.hasAttribute('data-counter')) animateCounter(element);
      element.querySelectorAll('[data-counter]').forEach(animateCounter);
    });
  }

  if (reducedMotion) {
    document.querySelectorAll('[data-timeline] .process__step').forEach(function (step) { step.classList.add('is-active'); });
  }

  document.querySelectorAll('img[data-fallback]').forEach(function (image) {
    image.addEventListener('error', function () {
      if (image.dataset.fallbackLoaded === 'true') return;
      image.dataset.fallbackLoaded = 'true';
      image.classList.add('is-fallback');
      const frame = image.closest('.hero__image-frame, .story__image-wrap');
      if (frame) frame.classList.add('is-fallback');
      image.src = image.dataset.fallback;
    });
  });

  document.querySelectorAll('[data-spotlight]').forEach(function (card) {
    card.addEventListener('pointermove', function (event) {
      if (reducedMotion || event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty('--pointer-x', x + 'px');
      card.style.setProperty('--pointer-y', y + 'px');
      card.style.setProperty('--magnet-x', (x / rect.width - .5) * 5 + 'px');
      card.style.setProperty('--magnet-y', (y / rect.height - .5) * 5 + 'px');
    });
    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--magnet-x', '0px');
      card.style.setProperty('--magnet-y', '0px');
    });
  });

  document.querySelectorAll('[data-magnetic]').forEach(function (button) {
    button.addEventListener('pointermove', function (event) {
      if (reducedMotion || event.pointerType === 'touch') return;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      button.style.setProperty('--magnet-x', ((x / rect.width - .5) * 9).toFixed(1) + 'px');
      button.style.setProperty('--magnet-y', ((y / rect.height - .5) * 7).toFixed(1) + 'px');
      button.style.setProperty('--glow-x', (x / rect.width * 100).toFixed(1) + '%');
      button.style.setProperty('--glow-y', (y / rect.height * 100).toFixed(1) + '%');
    });
    button.addEventListener('pointerleave', function () {
      button.style.setProperty('--magnet-x', '0px');
      button.style.setProperty('--magnet-y', '0px');
    });
  });

  const carousel = document.querySelector('.testimonial-carousel');
  if (carousel) {
    const track = carousel.querySelector('.testimonial-carousel__track');
    const cards = Array.from(carousel.querySelectorAll('[data-testimonial]'));
    const dots = Array.from(carousel.querySelectorAll('.testimonial-carousel__dot'));
    const progress = carousel.querySelector('.testimonial-carousel__progress');
    const arrows = Array.from(carousel.querySelectorAll('[data-slide-direction]'));
    let activeIndex = 0;
    let scrollFrame = false;
    let autoTimer = 0;
    let pauseAuto = false;
    let pointerStart = null;

    function setActiveSlide(index) {
      if (!cards.length) return;
      activeIndex = (index + cards.length) % cards.length;
      cards.forEach(function (card, cardIndex) {
        card.classList.toggle('is-current', cardIndex === activeIndex);
      });
      dots.forEach(function (dot, dotIndex) {
        const current = dotIndex === activeIndex;
        dot.classList.toggle('is-active', current);
        if (current) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      if (progress) {
        progress.setAttribute('aria-valuenow', String(activeIndex + 1));
        progress.style.setProperty('--progress', ((activeIndex + 1) / cards.length * 100) + '%');
      }
    }

    function goToSlide(index, behavior) {
      if (!track || !cards.length) return;
      const nextIndex = (index + cards.length) % cards.length;
      const trackRect = track.getBoundingClientRect();
      const cardRect = cards[nextIndex].getBoundingClientRect();
      const left = track.scrollLeft + cardRect.left - trackRect.left;
      track.scrollTo({ left: left, behavior: reducedMotion ? 'auto' : (behavior || 'smooth') });
      setActiveSlide(nextIndex);
    }

    function updateSlideFromScroll() {
      scrollFrame = false;
      if (!track || !cards.length) return;
      const trackLeft = track.getBoundingClientRect().left;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      cards.forEach(function (card, index) {
        const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setActiveSlide(nearestIndex);
    }

    function onTrackScroll() {
      if (scrollFrame) return;
      scrollFrame = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(updateSlideFromScroll);
      else updateSlideFromScroll();
    }

    function clearAutoAdvance() {
      if (autoTimer) window.clearTimeout(autoTimer);
      autoTimer = 0;
    }

    function scheduleAutoAdvance() {
      clearAutoAdvance();
      if (reducedMotion || pauseAuto || document.hidden || cards.length < 2) return;
      autoTimer = window.setTimeout(function () {
        const rect = carousel.getBoundingClientRect();
        const inView = rect.bottom > 0 && rect.top < window.innerHeight;
        if (!pauseAuto && inView) goToSlide(activeIndex + 1);
        scheduleAutoAdvance();
      }, 6800);
    }

    if (track) {
      track.addEventListener('scroll', onTrackScroll, { passive: true });
      track.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToSlide(activeIndex + 1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToSlide(activeIndex - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          goToSlide(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          goToSlide(cards.length - 1);
        }
      });
      track.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'mouse' || event.target.closest('a, button')) return;
        pointerStart = { x: event.clientX, scrollLeft: track.scrollLeft, moved: false };
        track.classList.add('is-dragging');
        pauseAuto = true;
        clearAutoAdvance();
        if (track.setPointerCapture) track.setPointerCapture(event.pointerId);
      });
      track.addEventListener('pointermove', function (event) {
        if (!pointerStart) return;
        const delta = event.clientX - pointerStart.x;
        if (Math.abs(delta) > 4) pointerStart.moved = true;
        track.scrollLeft = pointerStart.scrollLeft - delta;
      });
      const endDrag = function () {
        if (!pointerStart) return;
        pointerStart = null;
        track.classList.remove('is-dragging');
        pauseAuto = false;
        scheduleAutoAdvance();
      };
      track.addEventListener('pointerup', endDrag);
      track.addEventListener('pointercancel', endDrag);
      track.addEventListener('lostpointercapture', endDrag);
    }

    arrows.forEach(function (button) {
      button.addEventListener('click', function () {
        goToSlide(activeIndex + Number(button.dataset.slideDirection));
        scheduleAutoAdvance();
      });
    });

    dots.forEach(function (dot, index) {
      dot.addEventListener('click', function () {
        goToSlide(index);
        scheduleAutoAdvance();
      });
    });

    carousel.addEventListener('pointerenter', function () {
      pauseAuto = true;
      clearAutoAdvance();
    });
    carousel.addEventListener('pointerleave', function () {
      pauseAuto = false;
      scheduleAutoAdvance();
    });
    carousel.addEventListener('focusin', function () {
      pauseAuto = true;
      clearAutoAdvance();
    });
    carousel.addEventListener('focusout', function (event) {
      if (event.relatedTarget && carousel.contains(event.relatedTarget)) return;
      pauseAuto = false;
      scheduleAutoAdvance();
    });
    document.addEventListener('visibilitychange', scheduleAutoAdvance);
    setActiveSlide(0);
    scheduleAutoAdvance();
  }

  document.querySelectorAll('.faq__item').forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      document.querySelectorAll('.faq__item').forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  document.querySelectorAll('[data-newsletter]').forEach(function (form) {
    const email = form.querySelector('input[type="email"]');
    const message = form.querySelector('.newsletter__message');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!email || !message) return;
      message.classList.remove('is-success', 'is-error');
      if (!email.value.trim() || !email.checkValidity()) {
        message.textContent = 'Enter a valid email address to continue.';
        message.classList.add('is-error');
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        if (email.reportValidity) email.reportValidity();
        return;
      }
      email.removeAttribute('aria-invalid');
      message.textContent = 'Thanks — your email is ready. This demo did not send or store it.';
      message.classList.add('is-success');
      form.reset();
    });
    if (email) {
      email.addEventListener('input', function () {
        if (email.validity.valid) {
          email.removeAttribute('aria-invalid');
          if (message && message.classList.contains('is-error')) {
            message.classList.remove('is-error');
            message.textContent = 'No backend connected. This form demonstrates the sign-up flow.';
          }
        }
      });
    }
  });

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  document.querySelectorAll('a[href="#top"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });
  });

})();
