(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  let timelineViewport = null;
  let timelineCards = [];
  let timelineYears = [];
  let timelineProgress = null;
  let timelineActive = 0;
  let timelineFrame = 0;
  let preview = null;
  let previewImage = null;
  let previewActive = false;
  let scrollFrame = 0;
  let wordElements = [];
  let lastLitCount = -1;

  const parallaxImages = Array.from(document.querySelectorAll('[data-parallax]'));
  const galleryColumns = Array.from(document.querySelectorAll('[data-gallery-column]'));

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

  function wrapWords() {
    const blocks = document.querySelectorAll('[data-brighten] > p:not(.manifesto__opening)');
    if (!blocks.length || !document.createTreeWalker || !window.NodeFilter) return;

    blocks.forEach(function (block) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let node = walker.nextNode();

      while (node) {
        textNodes.push(node);
        node = walker.nextNode();
      }

      textNodes.forEach(function (textNode) {
        if (!textNode.nodeValue || !textNode.nodeValue.trim()) return;
        const fragment = document.createDocumentFragment();
        textNode.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.className = 'manifesto__word';
            span.textContent = part;
            fragment.appendChild(span);
            wordElements.push(span);
          }
        });
        if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
      });
    });
  }

  function updateManifestoWords() {
    if (reducedMotion || !wordElements.length) return;
    const body = document.querySelector('[data-brighten]');
    if (!body) return;

    const viewportHeight = window.innerHeight || 1;
    const rect = body.getBoundingClientRect();
    const progress = clamp((viewportHeight * .78 - rect.top) / (rect.height + viewportHeight * .42), 0, 1);
    const litCount = Math.floor(progress * wordElements.length);

    if (litCount === lastLitCount) return;
    lastLitCount = litCount;
    wordElements.forEach(function (word, index) {
      word.classList.toggle('is-lit', index < litCount);
    });
  }

  function updateParallax() {
    if (reducedMotion || !parallaxImages.length) return;
    const viewportHeight = window.innerHeight || 1;

    parallaxImages.forEach(function (image) {
      const rect = image.getBoundingClientRect();
      const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
      image.style.setProperty('--parallax-x', ((progress - .5) * 6).toFixed(2) + '%');
    });
  }

  function updateGalleryParallax() {
    if (reducedMotion || !galleryColumns.length) return;

    if (window.innerWidth < 900) {
      galleryColumns.forEach(function (column) {
        column.style.setProperty('--column-shift', '0px');
      });
      return;
    }

    const viewportHeight = window.innerHeight || 1;
    galleryColumns.forEach(function (column) {
      const rect = column.getBoundingClientRect();
      const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
      const speed = Number(column.dataset.speed) || 0;
      column.style.setProperty('--column-shift', ((progress - .5) * speed).toFixed(1) + 'px');
    });
  }

  function updateTimeline() {
    if (!timelineViewport) return;

    const maxScroll = timelineViewport.scrollWidth - timelineViewport.clientWidth;
    const ratio = maxScroll > 0 ? clamp(timelineViewport.scrollLeft / maxScroll, 0, 1) : 0;

    if (timelineProgress) timelineProgress.style.setProperty('--timeline-progress', ratio.toFixed(4));

    const center = timelineViewport.scrollLeft + timelineViewport.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    timelineCards.forEach(function (card, index) {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    timelineActive = nearestIndex;
    timelineYears.forEach(function (year, index) {
      const active = index === nearestIndex;
      year.classList.toggle('is-active', active);
      if (active) year.setAttribute('aria-current', 'step');
      else year.removeAttribute('aria-current');
    });
  }

  function scrollToMilestone(index) {
    if (!timelineViewport || !timelineCards.length) return;
    const normalized = (index + timelineCards.length) % timelineCards.length;
    const card = timelineCards[normalized];
    const left = card.offsetLeft - (timelineViewport.clientWidth - card.offsetWidth) / 2;

    timelineViewport.scrollTo({
      left: Math.max(0, left),
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  }

  function initTimeline() {
    timelineViewport = document.querySelector('[data-timeline-viewport]');
    if (!timelineViewport) return;

    timelineCards = Array.from(timelineViewport.querySelectorAll('[data-milestone]'));
    timelineYears = Array.from(document.querySelectorAll('[data-year-target]'));
    timelineProgress = document.querySelector('[data-timeline-progress]');

    timelineYears.forEach(function (year, index) {
      year.addEventListener('click', function () {
        scrollToMilestone(index);
      });
    });

    timelineViewport.addEventListener('scroll', function () {
      if (timelineFrame) return;
      timelineFrame = window.requestAnimationFrame ? window.requestAnimationFrame(function () {
        timelineFrame = 0;
        updateTimeline();
      }) : (updateTimeline(), 0);
    }, { passive: true });

    timelineViewport.addEventListener('keydown', function (event) {
      if (window.innerWidth < 768) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (event.key === 'ArrowRight') scrollToMilestone(timelineActive + 1);
        else if (event.key === 'ArrowLeft') scrollToMilestone(timelineActive - 1);
        else if (event.key === 'Home') scrollToMilestone(0);
        else scrollToMilestone(timelineCards.length - 1);
      }
    });

    let drag = null;

    timelineViewport.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || window.innerWidth < 768) return;
      drag = { x: event.clientX, left: timelineViewport.scrollLeft };
      timelineViewport.classList.add('is-dragging');
      if (timelineViewport.setPointerCapture) timelineViewport.setPointerCapture(event.pointerId);
    });

    timelineViewport.addEventListener('pointermove', function (event) {
      if (!drag) return;
      timelineViewport.scrollLeft = drag.left - (event.clientX - drag.x);
    });

    const endDrag = function () {
      if (!drag) return;
      drag = null;
      timelineViewport.classList.remove('is-dragging');
    };

    timelineViewport.addEventListener('pointerup', endDrag);
    timelineViewport.addEventListener('pointercancel', endDrag);
    timelineViewport.addEventListener('lostpointercapture', endDrag);

    updateTimeline();
  }

  function setPreviewImage(row) {
    if (!previewImage) return;
    const source = row.dataset.preview;
    if (source && previewImage.getAttribute('src') !== source) previewImage.src = source;
    previewImage.alt = row.dataset.previewAlt || '';
  }

  function positionPreview(clientX, clientY) {
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const x = clamp(clientX, halfWidth + 12, window.innerWidth - halfWidth - 12);
    const y = clamp(clientY, halfHeight + 12, window.innerHeight - halfHeight - 12);
    const tiltX = clamp((clientY - window.innerHeight / 2) / window.innerHeight * 9, -6, 6);
    const tiltY = clamp((clientX - window.innerWidth / 2) / window.innerWidth * -9, -6, 6);

    preview.style.setProperty('--preview-x', x.toFixed(1) + 'px');
    preview.style.setProperty('--preview-y', y.toFixed(1) + 'px');
    preview.style.setProperty('--tilt-x', tiltX.toFixed(2) + 'deg');
    preview.style.setProperty('--tilt-y', tiltY.toFixed(2) + 'deg');
  }

  function showPreview(row, clientX, clientY) {
    if (reducedMotion || !preview) return;
    setPreviewImage(row);
    previewActive = true;
    preview.classList.add('is-active');
    positionPreview(clientX, clientY);
  }

  function hidePreview() {
    previewActive = false;
    if (preview) preview.classList.remove('is-active');
  }

  function initPrinciples() {
    const rows = Array.from(document.querySelectorAll('.principle[data-preview]'));
    preview = document.querySelector('[data-principles-preview]');
    previewImage = preview ? preview.querySelector('[data-preview-image]') : null;
    if (!rows.length || !preview || reducedMotion) return;

    rows.forEach(function (row) {
      row.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch') return;
        showPreview(row, event.clientX, event.clientY);
      });

      row.addEventListener('pointermove', function (event) {
        if (!previewActive || event.pointerType === 'touch') return;
        positionPreview(event.clientX, event.clientY);
      });

      row.addEventListener('pointerleave', hidePreview);

      row.addEventListener('focus', function () {
        const rect = row.getBoundingClientRect();
        const x = window.innerWidth > 900 ? rect.right + 150 : window.innerWidth / 2;
        const y = rect.top + rect.height / 2;
        showPreview(row, x, y);
      });

      row.addEventListener('blur', hidePreview);
    });
  }

  function initGallery() {
    const items = Array.from(document.querySelectorAll('[data-gallery-item]'));

    items.forEach(function (item, index) {
      item.style.setProperty('--gallery-i', String(index));
    });

    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
    } else {
      const observer = new IntersectionObserver(function (entries, galleryObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          galleryObserver.unobserve(entry.target);
        });
      }, { threshold: .12, rootMargin: '0px 0px -30px 0px' });

      items.forEach(function (item) { observer.observe(item); });
    }

    initLightbox();
  }

  function initLightbox() {
    const dialog = document.querySelector('[data-lightbox]');
    const triggers = Array.from(document.querySelectorAll('[data-lightbox-open]'));
    if (!dialog || !triggers.length) return;

    const image = dialog.querySelector('[data-lightbox-image]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const counter = dialog.querySelector('[data-lightbox-counter]');
    const closeButton = dialog.querySelector('[data-lightbox-close]');
    const prevButton = dialog.querySelector('[data-lightbox-prev]');
    const nextButton = dialog.querySelector('[data-lightbox-next]');
    let activeIndex = 0;
    let lastTrigger = null;

    const slides = triggers.map(function (trigger) {
      const sourceImage = trigger.querySelector('img');
      return {
        src: trigger.dataset.full || (sourceImage ? sourceImage.src : ''),
        alt: sourceImage ? sourceImage.alt : '',
        caption: trigger.dataset.caption || ''
      };
    });

    function renderSlide() {
      const slide = slides[activeIndex];
      if (!slide || !image || !caption || !counter) return;
      image.src = slide.src;
      image.alt = slide.alt;
      caption.textContent = slide.caption;
      counter.textContent = (activeIndex + 1) + ' / ' + slides.length;
    }

    function openLightbox(index, trigger) {
      activeIndex = (index + slides.length) % slides.length;
      lastTrigger = trigger || null;
      renderSlide();

      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }

      if (closeButton) closeButton.focus();
    }

    function closeLightbox() {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
    }

    function moveSlide(direction) {
      activeIndex = (activeIndex + direction + slides.length) % slides.length;
      renderSlide();
    }

    triggers.forEach(function (trigger, index) {
      trigger.addEventListener('click', function () {
        openLightbox(index, trigger);
      });
    });

    if (closeButton) closeButton.addEventListener('click', closeLightbox);
    if (prevButton) prevButton.addEventListener('click', function () { moveSlide(-1); });
    if (nextButton) nextButton.addEventListener('click', function () { moveSlide(1); });

    dialog.addEventListener('close', function () {
      if (lastTrigger) lastTrigger.focus();
    });

    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSlide(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSlide(-1);
      } else if (event.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll('button:not([disabled])'));
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
  }

  function initClosingMedia() {
    const media = document.querySelector('[data-closing-media]');
    if (!media) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      media.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(function (entries, closingObserver) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        closingObserver.unobserve(entry.target);
      });
    }, { threshold: .2 });

    observer.observe(media);
  }

  function updateScrollEffects() {
    scrollFrame = 0;
    updateManifestoWords();
    updateParallax();
    updateGalleryParallax();
    updateTimeline();
  }

  function requestScrollFrame() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame ? window.requestAnimationFrame(updateScrollEffects) : (updateScrollEffects(), 0);
  }

  initImageFallbacks();
  if (!reducedMotion) wrapWords();
  initTimeline();
  initPrinciples();
  initGallery();
  initClosingMedia();

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });
  updateScrollEffects();
})();
