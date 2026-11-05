(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const STUDIO_ADDRESS = 'Stackly Tourism, Salem, Tamil Nadu, India';
  const SUCCESS_MESSAGE = 'Thanks — your message is on its way. We reply within one business day.';
  const SUCCESS_HOLD_MS = 3000;
  const SUCCESS_FADE_MS = 300;
  const SIMULATED_REQUEST_MS = 900;

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

  function initAddress() {
    document.querySelectorAll('[data-studio-address]').forEach(function (node) {
      node.textContent = STUDIO_ADDRESS;
    });
  }

  function initMapReveal() {
    const map = document.querySelector('[data-map-card]');
    if (!map) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      map.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(function (entries, mapObserver) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        mapObserver.unobserve(entry.target);
      });
    }, { threshold: .18, rootMargin: '0px 0px -40px 0px' });

    observer.observe(map);
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

  function initContactForm() {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;

    form.noValidate = true;

    const summary = form.querySelector('[data-error-summary]');
    const errorList = form.querySelector('[data-error-list]');
    const successHost = document.querySelector('[data-success-host]');
    const submit = form.querySelector('[data-submit]');
    const submitLabel = form.querySelector('[data-submit-label]');
    const honeypot = form.querySelector('#contact-website');
    const messageInput = form.querySelector('#contact-message');
    const counter = form.querySelector('[data-message-counter]');
    let sending = false;

    const field = function (key, label, validate) {
      const element = form.querySelector('[data-contact-field="' + key + '"]');
      const error = document.getElementById('contact-' + key + '-error');
      return {
        key: key,
        label: label,
        element: element,
        error: error,
        validate: validate,
        touched: false,
        message: ''
      };
    };

    const nameError = function (value) {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 60) return 'Enter a name between 2 and 60 characters.';
      if (!/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(trimmed)) return 'Use letters, spaces, hyphens or apostrophes only.';
      return '';
    };

    const emailError = function (value) {
      const trimmed = value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed)) return 'Enter a valid email address with a domain and TLD.';
      if (trimmed.indexOf('..') !== -1) return 'Remove repeated dots from the email address.';

      const parts = trimmed.split('@');
      if (parts.length !== 2) return 'Enter a valid email address.';
      if (parts[0].charAt(0) === '.' || parts[0].charAt(parts[0].length - 1) === '.') return 'Remove dots from the start or end of the email address.';
      if (parts[1].charAt(0) === '.' || parts[1].charAt(parts[1].length - 1) === '.') return 'Remove dots from the start or end of the email address.';
      return '';
    };

    const companyError = function (value) {
      return value.trim().length > 80 ? 'Keep the company name under 80 characters.' : '';
    };

    const topicError = function (value) {
      return value ? '' : 'Choose a topic.';
    };

    const messageError = function (value) {
      const trimmed = value.trim();
      if (trimmed.length < 20) return 'Write at least 20 characters.';
      if (value.length > 1000) return 'Keep the message under 1,000 characters.';
      return '';
    };

    const consentError = function (value, element) {
      return element.checked ? '' : 'Please confirm you agree to be contacted.';
    };

    const fields = [
      field('name', 'Full name', nameError),
      field('email', 'Email', emailError),
      field('company', 'Company', companyError),
      field('topic', 'Topic', topicError),
      field('message', 'Message', messageError),
      field('consent', 'Consent', consentError)
    ];

    const updateCounter = function () {
      if (!messageInput || !counter) return;
      const length = messageInput.value.length;
      counter.textContent = length + ' / 1000';
      counter.classList.toggle('is-warning', length > 900 && length <= 1000);
      counter.classList.toggle('is-over', length > 1000);
    };

    const clearError = function (item) {
      if (!item.error) return;
      item.error.hidden = true;
      const text = item.error.querySelector('[data-error-text]');
      if (text) text.textContent = '';
      item.message = '';
      item.element.removeAttribute('aria-invalid');
    };

    const validateField = function (item) {
      const message = item.validate(item.element.value, item.element);
      item.message = message;

      if (message) {
        if (item.error) {
          item.error.hidden = false;
          const text = item.error.querySelector('[data-error-text]');
          if (text) text.textContent = message;
        }
        item.element.setAttribute('aria-invalid', 'true');
        return false;
      }

      clearError(item);
      return true;
    };

    const clearSummary = function () {
      if (!summary || !errorList) return;
      summary.hidden = true;
      errorList.textContent = '';
    };

    const renderSummary = function (invalidFields) {
      if (!summary || !errorList) return;
      errorList.textContent = '';

      invalidFields.forEach(function (item) {
        const listItem = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#' + item.element.id;
        link.textContent = item.label + ' — ' + item.message;
        link.addEventListener('click', function (event) {
          event.preventDefault();
          item.element.focus();
        });
        listItem.appendChild(link);
        errorList.appendChild(listItem);
      });

      summary.hidden = false;
    };

    const setSending = function (state) {
      if (!submit) return;
      submit.disabled = state;
      submit.classList.toggle('is-sending', state);
      submit.setAttribute('aria-busy', String(state));
      if (submitLabel) submitLabel.textContent = state ? 'Sending…' : 'Send message';
    };

    const resetForm = function () {
      form.reset();
      fields.forEach(function (item) {
        item.touched = false;
        clearError(item);
      });
      clearSummary();
      updateCounter();
    };

    const showSuccess = function () {
      if (!successHost) return;
      successHost.textContent = '';

      const banner = document.createElement('div');
      banner.className = 'contact-success';
      banner.textContent = SUCCESS_MESSAGE;
      successHost.appendChild(banner);

      window.requestAnimationFrame(function () {
        banner.classList.add('is-visible');
      });

      window.setTimeout(function () {
        banner.classList.remove('is-visible');
        window.setTimeout(function () {
          if (banner.parentNode) banner.remove();
        }, SUCCESS_FADE_MS);
      }, SUCCESS_HOLD_MS);
    };

    fields.forEach(function (item) {
      if (!item.element) return;

      item.element.addEventListener('blur', function () {
        item.touched = true;
        validateField(item);
      });

      item.element.addEventListener('input', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
        if (item.key === 'message') updateCounter();
      });

      item.element.addEventListener('change', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
      });
    });

    updateCounter();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (sending) return;

      clearSummary();
      const invalidFields = [];

      fields.forEach(function (item) {
        if (!item.element) return;
        item.touched = true;
        if (!validateField(item)) invalidFields.push(item);
      });

      if (invalidFields.length) {
        renderSummary(invalidFields);
        invalidFields[0].element.focus();
        return;
      }

      if (honeypot && honeypot.value.trim() !== '') {
        sending = true;
        setSending(true);
        window.setTimeout(function () {
          sending = false;
          setSending(false);
          resetForm();
        }, SIMULATED_REQUEST_MS);
        return;
      }

      sending = true;
      setSending(true);

      // Front-end simulation only. Replace this timeout with a POST to your real endpoint.
      window.setTimeout(function () {
        sending = false;
        setSending(false);
        resetForm();
        showSuccess();
      }, SIMULATED_REQUEST_MS);
    });
  }

  initImageFallbacks();
  initAddress();
  initMapReveal();
  initMagnetic();
  initContactForm();
})();
