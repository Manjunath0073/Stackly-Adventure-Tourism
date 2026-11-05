(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  let scrollFrame = 0;
  let arcSection = null;
  let arcSteps = [];
  let featuredScrolly = null;
  let featuredChapters = [];
  let featuredImages = [];
  let voicesSection = null;
  let voiceCards = [];

  function initImageFallbacks() {
    document.querySelectorAll('img[data-fallback]').forEach(function (image) {
      const applyFallback = function () {
        if (!image.dataset.fallback || image.getAttribute('src') === image.dataset.fallback) return;
        image.src = image.dataset.fallback;
        image.classList.add('is-fallback');
        if (image.parentElement) image.parentElement.classList.add('is-fallback');
      };

      image.addEventListener('error', applyFallback);
      if (image.complete && image.naturalWidth === 0) applyFallback();
    });
  }

  function preloadFeaturedImages() {
    const seen = [];
    document.querySelectorAll('[data-featured-preload]').forEach(function (image) {
      const source = image.currentSrc || image.getAttribute('src');
      if (!source || seen.indexOf(source) !== -1) return;
      seen.push(source);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = source;
      link.setAttribute('fetchpriority', 'low');
      document.head.appendChild(link);
    });
  }

  function updateArc() {
    if (!arcSection || reducedMotion) return;

    const viewportHeight = window.innerHeight || 1;
    const rect = arcSection.getBoundingClientRect();
    const progress = clamp((viewportHeight * .78 - rect.top) / (rect.height * .72), 0, 1);

    arcSection.style.setProperty('--arc-progress', progress.toFixed(4));
    arcSteps.forEach(function (step, index) {
      step.classList.toggle('is-active', progress >= (index + 1) / (arcSteps.length + 1));
    });
  }

  function initArc() {
    arcSection = document.querySelector('[data-arc]');
    arcSteps = Array.from(document.querySelectorAll('[data-arc-step]'));
    if (!arcSection) return;

    if (reducedMotion) {
      arcSection.style.setProperty('--arc-progress', '1');
      arcSteps.forEach(function (step) { step.classList.add('is-active'); });
      return;
    }

    updateArc();
  }

  function setFeaturedActive(index) {
    featuredChapters.forEach(function (chapter, chapterIndex) {
      chapter.classList.toggle('is-active', chapterIndex === index);
    });

    featuredImages.forEach(function (image, imageIndex) {
      image.classList.toggle('is-active', imageIndex === index);
    });
  }

  function updateFeatured() {
    if (!featuredScrolly || reducedMotion) return;

    if (window.innerWidth < 900) {
      setFeaturedActive(0);
      return;
    }

    const viewportHeight = window.innerHeight || 1;
    const rect = featuredScrolly.getBoundingClientRect();
    const stickyHeight = Math.min(viewportHeight * .8, viewportHeight - 120);
    const scrollable = Math.max(1, rect.height - stickyHeight);
    const progress = clamp((-rect.top) / scrollable, 0, 1);
    const activeIndex = Math.min(featuredChapters.length - 1, Math.floor(progress * featuredChapters.length));

    setFeaturedActive(activeIndex);
  }

  function initFeatured() {
    featuredScrolly = document.querySelector('[data-featured-scrolly]');
    featuredChapters = Array.from(document.querySelectorAll('[data-featured-chapter]'));
    featuredImages = Array.from(document.querySelectorAll('[data-featured-image]'));
    if (!featuredScrolly || !featuredChapters.length) return;

    if (reducedMotion) {
      setFeaturedActive(0);
      return;
    }

    updateFeatured();
  }

  function initJourneyIndex() {
    const index = document.querySelector('[data-journey-index]');
    if (!index) return;

    const filters = Array.from(index.querySelectorAll('[data-filter]'));
    const cards = Array.from(index.querySelectorAll('[data-journey-card]'));
    const status = index.querySelector('[data-filter-status]');
    if (!filters.length || !cards.length) return;

    const visibleCards = function () {
      return cards.filter(function (card) { return !card.hidden; });
    };

    const flip = function (mutate) {
      if (reducedMotion || !window.Element || !Element.prototype.animate) {
        mutate();
        return;
      }

      const first = new Map();
      visibleCards().forEach(function (card) {
        first.set(card, card.getBoundingClientRect());
      });

      mutate();

      visibleCards().forEach(function (card) {
        const firstRect = first.get(card);
        if (!firstRect) {
          card.animate([
            { opacity: 0, transform: 'translateY(10px) scale(.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
          ], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
          return;
        }

        const lastRect = card.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        if (!dx && !dy) return;

        card.animate([
          { transform: 'translate(' + dx + 'px, ' + dy + 'px)' },
          { transform: 'translate(0, 0)' }
        ], { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
    };

    const applyFilter = function (filter) {
      flip(function () {
        cards.forEach(function (card) {
          const categories = (card.dataset.category || '').split(/\s+/);
          const show = filter === 'all' || categories.indexOf(filter) !== -1;
          card.hidden = !show;
          if (!show && card.classList.contains('is-expanded')) {
            card.classList.remove('is-expanded');
            const toggle = card.querySelector('.journey-card__toggle');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
          }
        });
      });

      filters.forEach(function (button) {
        const active = button.dataset.filter === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      if (status) {
        const count = visibleCards().length;
        status.textContent = 'Showing ' + count + ' journey' + (count === 1 ? '' : 's') + '.';
      }
    };

    filters.forEach(function (button) {
      button.addEventListener('click', function () {
        applyFilter(button.dataset.filter);
      });
    });

    cards.forEach(function (card) {
      const toggle = card.querySelector('.journey-card__toggle');
      if (!toggle) return;

      toggle.addEventListener('click', function () {
        const expand = !card.classList.contains('is-expanded');
        flip(function () {
          card.classList.toggle('is-expanded', expand);
          toggle.setAttribute('aria-expanded', String(expand));
        });
      });
    });
  }

  function initOutcomes() {
    const compare = document.querySelector('[data-compare]');
    const handle = document.querySelector('[data-compare-handle]');
    if (!compare || !handle) return;

    let value = 50;
    let dragging = false;

    const setValue = function (nextValue) {
      value = clamp(nextValue, 0, 100);
      compare.style.setProperty('--compare-position', value.toFixed(2) + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(value)));
    };

    const updateFromEvent = function (event) {
      const rect = compare.getBoundingClientRect();
      setValue(((event.clientX - rect.left) / rect.width) * 100);
    };

    handle.addEventListener('pointerdown', function (event) {
      dragging = true;
      if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
      updateFromEvent(event);
    });

    handle.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      updateFromEvent(event);
    });

    const endDrag = function () {
      dragging = false;
    };

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', endDrag);

    handle.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        setValue(value - 5);
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        setValue(value + 5);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setValue(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setValue(100);
      }
    });

    setValue(50);
  }

  function updateVoices() {
    if (!voicesSection || reducedMotion) return;

    if (window.innerWidth < 900) {
      voicesSection.style.setProperty('--voice-progress', '1');
      voiceCards.forEach(function (card) {
        card.style.setProperty('--voice-x', '0px');
        card.style.setProperty('--voice-y', '0px');
        card.style.setProperty('--voice-r', '0deg');
      });
      return;
    }

    const viewportHeight = window.innerHeight || 1;
    const rect = voicesSection.getBoundingClientRect();
    const progress = clamp((viewportHeight * .82 - rect.top) / (viewportHeight * .6), 0, 1);
    const bases = [
      { x: 70, y: 50, r: -4 },
      { x: 0, y: 26, r: 2 },
      { x: -70, y: 0, r: 6 }
    ];

    voicesSection.style.setProperty('--voice-progress', progress.toFixed(3));

    voiceCards.forEach(function (card, index) {
      const base = bases[index] || { x: 0, y: 0, r: 0 };
      const factor = 1 - progress;
      card.style.setProperty('--voice-x', (base.x * factor).toFixed(1) + 'px');
      card.style.setProperty('--voice-y', (base.y * factor).toFixed(1) + 'px');
      card.style.setProperty('--voice-r', (base.r * factor).toFixed(2) + 'deg');
    });
  }

  function initVoices() {
    voicesSection = document.querySelector('[data-voices]');
    voiceCards = Array.from(document.querySelectorAll('[data-voice-card]'));
    if (!voicesSection) return;

    if (reducedMotion) {
      voicesSection.style.setProperty('--voice-progress', '1');
      voiceCards.forEach(function (card) {
        card.style.setProperty('--voice-x', '0px');
        card.style.setProperty('--voice-y', '0px');
        card.style.setProperty('--voice-r', '0deg');
      });
      return;
    }

    updateVoices();
  }

  function initCta() {
    const map = document.querySelector('[data-journey-map]');
    const line = document.querySelector('[data-map-line]');

    if (map && line && line.getTotalLength) {
      const length = line.getTotalLength();
      line.style.strokeDasharray = String(length);
      line.style.strokeDashoffset = reducedMotion ? '0' : String(length);

      if (reducedMotion || !('IntersectionObserver' in window)) {
        line.style.strokeDashoffset = '0';
        map.classList.add('is-visible');
      } else {
        const observer = new IntersectionObserver(function (entries, mapObserver) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            map.classList.add('is-visible');
            line.style.strokeDashoffset = '0';
            mapObserver.unobserve(entry.target);
          });
        }, { threshold: .25 });

        observer.observe(map);
      }
    }

    const button = document.querySelector('[data-magnetic]');
    if (!button || reducedMotion) return;

    button.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      button.style.setProperty('--magnet-x', (x * 10).toFixed(1) + 'px');
      button.style.setProperty('--magnet-y', (y * 7).toFixed(1) + 'px');
    });

    button.addEventListener('pointerleave', function () {
      button.style.setProperty('--magnet-x', '0px');
      button.style.setProperty('--magnet-y', '0px');
    });
  }

  function updateScrollEffects() {
    scrollFrame = 0;
    updateArc();
    updateFeatured();
    updateVoices();
  }

  function requestScrollFrame() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame ? window.requestAnimationFrame(updateScrollEffects) : (updateScrollEffects(), 0);
  }

  initImageFallbacks();
  initArc();
  initFeatured();
  initJourneyIndex();
  initOutcomes();
  initVoices();
  initCta();

  const heroImage = document.querySelector('.journey-hero__frame img');
  if (heroImage) {
    if (heroImage.complete) preloadFeaturedImages();
    else {
      heroImage.addEventListener('load', preloadFeaturedImages, { once: true });
      heroImage.addEventListener('error', preloadFeaturedImages, { once: true });
    }
  } else if (document.readyState === 'complete') {
    preloadFeaturedImages();
  } else {
    window.addEventListener('load', preloadFeaturedImages, { once: true });
  }

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });
  updateScrollEffects();
})();
