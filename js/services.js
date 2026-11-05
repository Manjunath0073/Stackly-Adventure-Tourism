(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  const heroRows = Array.from(document.querySelectorAll('[data-service-row]'));
  const heroPreviews = Array.from(document.querySelectorAll('[data-service-preview]'));
  const proofCards = Array.from(document.querySelectorAll('[data-proof-card]'));
  const processSteps = Array.from(document.querySelectorAll('.process-step'));

  let processSection = null;
  let processLine = null;
  let processLength = 0;
  let scrollFrame = 0;
  let priceTimer = 0;

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

  function setActiveHero(index) {
    heroRows.forEach(function (row, rowIndex) {
      const active = rowIndex === index;
      row.classList.toggle('is-active', active);
      row.setAttribute('aria-pressed', String(active));
    });

    heroPreviews.forEach(function (preview, previewIndex) {
      const active = previewIndex === index;
      preview.classList.toggle('is-active', active);
      preview.setAttribute('aria-hidden', String(!active));
    });
  }

  function initHeroIndex() {
    if (!heroRows.length) return;

    heroRows.forEach(function (row, index) {
      row.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch') return;
        setActiveHero(index);
      });

      row.addEventListener('focus', function () {
        setActiveHero(index);
      });

      row.addEventListener('click', function () {
        setActiveHero(index);
      });

      row.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % heroRows.length;
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + heroRows.length) % heroRows.length;
        else if (event.key === 'Home') nextIndex = 0;
        else nextIndex = heroRows.length - 1;
        heroRows[nextIndex].focus();
      });
    });

    setActiveHero(0);
  }

  function preloadHeroImages() {
    const seen = [];
    document.querySelectorAll('[data-hero-preload]').forEach(function (image) {
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

  function initDisciplines() {
    const cards = Array.from(document.querySelectorAll('[data-discipline]'));
    if (!cards.length) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      cards.forEach(function (card) { card.classList.add('is-visible'); });
    } else {
      const observer = new IntersectionObserver(function (entries, disciplineObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          disciplineObserver.unobserve(entry.target);
        });
      }, { threshold: .14, rootMargin: '0px 0px -30px 0px' });

      cards.forEach(function (card) { observer.observe(card); });
    }

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        if (reducedMotion || event.pointerType === 'touch') return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', (event.clientX - rect.left).toFixed(1) + 'px');
        card.style.setProperty('--spot-y', (event.clientY - rect.top).toFixed(1) + 'px');
      });

      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--spot-x', '50%');
        card.style.setProperty('--spot-y', '50%');
      });
    });
  }

  function initDetailReveals() {
    const media = Array.from(document.querySelectorAll('[data-clip-reveal]'));
    if (!media.length) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      media.forEach(function (figure) { figure.classList.add('is-visible'); });
      return;
    }

    const observer = new IntersectionObserver(function (entries, revealObserver) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .18, rootMargin: '0px 0px -40px 0px' });

    media.forEach(function (figure) { observer.observe(figure); });
  }

  function updateProcess() {
    if (!processSection || reducedMotion) return;

    const viewportHeight = window.innerHeight || 1;
    const rect = processSection.getBoundingClientRect();
    const progress = clamp((viewportHeight * .8 - rect.top) / (rect.height * .82), 0, 1);

    processSection.style.setProperty('--process-progress', progress.toFixed(4));

    if (processLine && processLength) {
      processLine.style.strokeDashoffset = (processLength * (1 - progress)).toFixed(1);
    }

    processSteps.forEach(function (step, index) {
      step.classList.toggle('is-active', progress >= (index + 1) / (processSteps.length + 1));
    });
  }

  function initProcess() {
    processSection = document.querySelector('[data-process]');
    processLine = document.querySelector('[data-process-line]');
    if (!processSection || !processLine) return;

    if (processLine.getTotalLength) {
      processLength = processLine.getTotalLength();
      processLine.style.strokeDasharray = String(processLength);
      processLine.style.strokeDashoffset = reducedMotion ? '0' : String(processLength);
    }

    if (reducedMotion) {
      processSection.style.setProperty('--process-progress', '1');
      processSteps.forEach(function (step) { step.classList.add('is-active'); });
      return;
    }

    updateProcess();
  }

  function initProofTilt() {
    if (reducedMotion || !proofCards.length) return;

    proofCards.forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch') return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.setProperty('--tilt-x', (-y * 5).toFixed(2) + 'deg');
        card.style.setProperty('--tilt-y', (x * 6).toFixed(2) + 'deg');
        card.style.setProperty('--lift', '-4px');
      });

      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
        card.style.setProperty('--lift', '0px');
      });
    });
  }

  function initPricing() {
    const buttons = Array.from(document.querySelectorAll('[data-period]'));
    const values = Array.from(document.querySelectorAll('[data-price-value]'));
    const periods = Array.from(document.querySelectorAll('[data-price-period]'));
    const status = document.querySelector('[data-pricing-status]');
    if (!buttons.length || !values.length) return;

    const setPeriod = function (period) {
      buttons.forEach(function (button) {
        const active = button.dataset.period === period;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      values.forEach(function (value) { value.classList.add('is-changing'); });
      periods.forEach(function (label) { label.classList.add('is-changing'); });

      if (priceTimer) window.clearTimeout(priceTimer);
      priceTimer = window.setTimeout(function () {
        values.forEach(function (value) {
          const nextValue = value.dataset[period];
          if (nextValue) value.textContent = nextValue;
          value.classList.remove('is-changing');
        });

        periods.forEach(function (label) {
          label.textContent = period === 'monthly' ? '/mo' : '/quarter';
          label.classList.remove('is-changing');
        });

        if (status) status.textContent = period === 'monthly' ? 'Monthly placeholder pricing shown.' : 'Quarterly placeholder pricing shown.';
      }, reducedMotion ? 0 : 170);
    };

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        setPeriod(button.dataset.period);
      });
    });
  }

  function initFaq() {
    const items = Array.from(document.querySelectorAll('.service-faq__item'));
    if (!items.length) return;

    items.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  function initMagnetic() {
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
    updateProcess();
  }

  function requestScrollFrame() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame ? window.requestAnimationFrame(updateScrollEffects) : (updateScrollEffects(), 0);
  }

  initImageFallbacks();
  initHeroIndex();
  initDisciplines();
  initDetailReveals();
  initProcess();
  initProofTilt();
  initPricing();
  initFaq();
  initMagnetic();

  if (document.readyState === 'complete') preloadHeroImages();
  else window.addEventListener('load', preloadHeroImages, { once: true });

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });
  updateScrollEffects();
})();
