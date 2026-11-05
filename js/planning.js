(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  let scrollFrame = 0;
  let roadmapManual = false;
  let tickerUpdate = null;
  let roadmapUpdate = null;

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

  function initTicker() {
    const months = Array.from(document.querySelectorAll('.planning-hero__months li'));
    const progressBar = document.querySelector('[data-ticker-progress]');
    if (!months.length) return;

    const update = function () {
      if (reducedMotion) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = clamp(window.scrollY / Math.max(1, scrollable), 0, 1);
      const active = Math.min(months.length - 1, Math.floor(progress * months.length));

      months.forEach(function (month, index) {
        month.classList.toggle('is-active', index === active);
      });

      if (progressBar) progressBar.style.setProperty('--ticker-progress', progress.toFixed(4));
    };

    tickerUpdate = update;
    update();
  }

  function initPrinciples() {
    const cards = Array.from(document.querySelectorAll('[data-principle]'));
    if (!cards.length) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      cards.forEach(function (card) { card.classList.add('is-visible'); });
      return;
    }

    const observer = new IntersectionObserver(function (entries, principleObserver) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        principleObserver.unobserve(entry.target);
      });
    }, { threshold: .14, rootMargin: '0px 0px -30px 0px' });

    cards.forEach(function (card) { observer.observe(card); });
  }

  function initStages() {
    const stages = document.querySelector('[data-stages]');
    const board = document.querySelector('[data-stages-board]');
    const rows = Array.from(document.querySelectorAll('[data-stage-row]'));

    if (stages) {
      if (reducedMotion || !('IntersectionObserver' in window)) {
        stages.classList.add('is-visible');
      } else if (board) {
        const observer = new IntersectionObserver(function (entries, stageObserver) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            stages.classList.add('is-visible');
            stageObserver.unobserve(entry.target);
          });
        }, { threshold: .12 });
        observer.observe(board);
      }
    }

    rows.forEach(function (row) {
      const button = row.querySelector('.stage-row__button');
      if (!button) return;
      let pinned = false;

      const closeOthers = function () {
        rows.forEach(function (other) {
          if (other === row) return;
          other.classList.remove('is-open');
          const otherButton = other.querySelector('.stage-row__button');
          if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
        });
      };

      const open = function () {
        closeOthers();
        row.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
      };

      const close = function () {
        row.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
      };

      row.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse') open();
      });

      row.addEventListener('pointerleave', function (event) {
        if (event.pointerType !== 'mouse' || pinned) return;
        if (!row.contains(document.activeElement)) close();
      });

      button.addEventListener('focus', open);

      row.addEventListener('focusout', function () {
        window.setTimeout(function () {
          if (!pinned && !row.contains(document.activeElement)) close();
        }, 0);
      });

      button.addEventListener('click', function () {
        if (row.classList.contains('is-open') && pinned) {
          pinned = false;
          close();
        } else {
          pinned = true;
          open();
        }
      });

      row.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !row.classList.contains('is-open')) return;
        event.preventDefault();
        pinned = false;
        close();
        button.focus();
      });
    });

    document.addEventListener('click', function (event) {
      rows.forEach(function (row) {
        if (row.contains(event.target)) return;
        row.classList.remove('is-open');
        const button = row.querySelector('.stage-row__button');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initSimulator() {
    const teamInput = document.querySelector('[data-sim-team]');
    const weeksInput = document.querySelector('[data-sim-weeks]');
    const teamOutput = document.querySelector('#sim-team-value');
    const weeksOutput = document.querySelector('#sim-weeks-value');
    const summary = document.querySelector('[data-sim-summary]');
    const area = document.querySelector('[data-sim-area]');
    const line = document.querySelector('[data-sim-line]');
    const presets = Array.from(document.querySelectorAll('[data-preset]'));
    const outputs = {
      readiness: document.querySelector('[data-sim-output="readiness"]'),
      weeks: document.querySelector('[data-sim-output="weeks"]'),
      risks: document.querySelector('[data-sim-output="risks"]')
    };

    if (!teamInput || !weeksInput) return;

    const presetValues = {
      conservative: { team: 4, weeks: 12 },
      balanced: { team: 6, weeks: 8 },
      aggressive: { team: 10, weeks: 5 }
    };

    const state = {
      current: null,
      target: null,
      frame: 0
    };

    const compute = function (team, weeks) {
      return {
        readiness: clamp(Math.round(88 - Math.abs(team - 6) * 2.5 - Math.abs(weeks - 10) * 1.8), 52, 96),
        weeks: weeks,
        risks: clamp(Math.round(2 + Math.abs(team - 6) * .8 + Math.abs(weeks - 10) * .55), 1, 9)
      };
    };

    const chartPoints = function (values) {
      const points = [];
      for (let index = 0; index < 6; index += 1) {
        const t = index / 5;
        const value = clamp(values.readiness - Math.abs(t - .55) * values.risks * 4 + Math.sin(t * Math.PI) * 8, 20, 100);
        points.push([20 + t * 280, 130 - (value / 100) * 110]);
      }
      return points;
    };

    const pathFromPoints = function (points) {
      return points.map(function (point, index) {
        return (index ? 'L' : 'M') + point[0].toFixed(1) + ' ' + point[1].toFixed(1);
      }).join(' ');
    };

    const renderChart = function (values) {
      const points = chartPoints(values);
      const path = pathFromPoints(points);
      if (line) line.setAttribute('d', path);
      if (area) area.setAttribute('d', path + ' L 300 130 L 20 130 Z');
    };

    const renderNumbers = function () {
      if (outputs.readiness) outputs.readiness.textContent = String(Math.round(state.current.readiness));
      if (outputs.weeks) outputs.weeks.textContent = String(Math.round(state.current.weeks));
      if (outputs.risks) outputs.risks.textContent = String(Math.round(state.current.risks));
      renderChart(state.current);
    };

    const step = function () {
      let done = true;
      ['readiness', 'weeks', 'risks'].forEach(function (key) {
        const difference = state.target[key] - state.current[key];
        if (Math.abs(difference) > .4) {
          state.current[key] += difference * .2;
          done = false;
        } else {
          state.current[key] = state.target[key];
        }
      });

      renderNumbers();

      if (!done) state.frame = window.requestAnimationFrame(step);
      else state.frame = 0;
    };

    const syncPresets = function (team, weeks, activeName) {
      presets.forEach(function (button) {
        const key = button.dataset.preset;
        const preset = presetValues[key];
        const active = activeName ? key === activeName : Boolean(preset && preset.team === team && preset.weeks === weeks);
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
      });
    };

    const updateSummary = function (team, weeks, values, activeName) {
      if (!summary) return;
      let label = activeName;
      if (!label) {
        Object.keys(presetValues).forEach(function (key) {
          const preset = presetValues[key];
          if (preset.team === team && preset.weeks === weeks) label = key;
        });
      }
      label = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Custom';
      summary.textContent = label + ' scenario: ' + team + ' people over ' + weeks + ' weeks. Readiness ' + values.readiness + '. ' + values.risks + ' open risks.';
    };

    const update = function (activeName) {
      const team = Number(teamInput.value);
      const weeks = Number(weeksInput.value);
      const target = compute(team, weeks);

      if (teamOutput) teamOutput.textContent = String(team);
      if (weeksOutput) weeksOutput.textContent = weeks + ' weeks';
      state.target = target;
      syncPresets(team, weeks, activeName);
      updateSummary(team, weeks, target, activeName);

      if (reducedMotion) {
        state.current = {
          readiness: target.readiness,
          weeks: target.weeks,
          risks: target.risks
        };
        renderNumbers();
        return;
      }

      if (!state.frame) state.frame = window.requestAnimationFrame(step);
    };

    const initial = compute(Number(teamInput.value), Number(weeksInput.value));
    state.current = {
      readiness: initial.readiness,
      weeks: initial.weeks,
      risks: initial.risks
    };
    state.target = {
      readiness: initial.readiness,
      weeks: initial.weeks,
      risks: initial.risks
    };
    renderNumbers();
    syncPresets(Number(teamInput.value), Number(weeksInput.value), 'balanced');
    updateSummary(Number(teamInput.value), Number(weeksInput.value), initial, 'balanced');

    presets.forEach(function (button) {
      button.addEventListener('click', function () {
        const preset = presetValues[button.dataset.preset];
        if (!preset) return;
        teamInput.value = String(preset.team);
        weeksInput.value = String(preset.weeks);
        update(button.dataset.preset);
      });
    });

    teamInput.addEventListener('input', function () { update(); });
    weeksInput.addEventListener('input', function () { update(); });
  }

  function initRoadmap() {
    const roadmap = document.querySelector('[data-roadmap]');
    const buttons = Array.from(document.querySelectorAll('[data-quarter]'));
    const columns = Array.from(document.querySelectorAll('[data-quarter-panel]'));
    const images = Array.from(document.querySelectorAll('[data-roadmap-image]'));
    const caption = document.querySelector('[data-roadmap-caption]');
    const sweep = document.querySelector('[data-roadmap-sweep]');
    if (!roadmap || !buttons.length) return;

    const captions = [
      'Q1 / Route briefs',
      'Q2 / Permits and training',
      'Q3 / Weather and kit',
      'Q4 / Departure and review'
    ];

    const setQuarter = function (index) {
      buttons.forEach(function (button, buttonIndex) {
        const active = buttonIndex === index;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
      });

      columns.forEach(function (column, columnIndex) {
        column.classList.toggle('is-active', columnIndex === index);
      });

      images.forEach(function (image, imageIndex) {
        image.classList.toggle('is-active', imageIndex === index);
      });

      if (caption) caption.textContent = captions[index] || '';
    };

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        roadmapManual = true;
        setQuarter(Number(button.dataset.quarter));
      });
    });

    document.addEventListener('click', function (event) {
      if (!roadmap.contains(event.target)) roadmapManual = false;
    });

    document.addEventListener('focusin', function (event) {
      if (!roadmap.contains(event.target)) roadmapManual = false;
    });

    const update = function () {
      if (reducedMotion) {
        if (sweep) sweep.style.setProperty('--roadmap-progress', '1');
        return;
      }

      const viewportHeight = window.innerHeight || 1;
      const rect = roadmap.getBoundingClientRect();
      const progress = clamp((viewportHeight * .8 - rect.top) / (rect.height * .72), 0, 1);

      if (sweep) sweep.style.setProperty('--roadmap-progress', progress.toFixed(4));

      if (!roadmapManual) {
        setQuarter(Math.min(3, Math.floor(progress * 4)));
      }
    };

    roadmapUpdate = update;
    setQuarter(0);
    if (reducedMotion && sweep) sweep.style.setProperty('--roadmap-progress', '1');
    else update();
  }

  function initLivePlan() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = tabs.map(function (tab) {
      const id = tab.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    }).filter(Boolean);
    const underline = document.querySelector('[data-tab-underline]');
    if (!tabs.length || !panels.length) return;

    const positionUnderline = function () {
      const active = tabs.find(function (tab) { return tab.getAttribute('aria-selected') === 'true'; });
      if (!active || !underline) return;
      underline.style.setProperty('--tab-x', active.offsetLeft + 'px');
      underline.style.setProperty('--tab-w', active.offsetWidth + 'px');
    };

    const activate = function (index, focus) {
      const tab = tabs[index];
      if (!tab) return;

      tabs.forEach(function (item, itemIndex) {
        const active = itemIndex === index;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });

      panels.forEach(function (panel, panelIndex) {
        const active = panelIndex === index;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', String(!active));
        panel.tabIndex = active ? 0 : -1;
      });

      positionUnderline();
      if (focus) tab.focus();
    };

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        activate(index, false);
      });

      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else next = tabs.length - 1;
        activate(next, true);
      });
    });

    activate(0, false);
    window.addEventListener('resize', positionUnderline, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionUnderline);
  }

  function initReadiness() {
    const items = Array.from(document.querySelectorAll('[data-readiness-item]'));
    const ring = document.querySelector('[data-readiness-ring]');
    const count = document.querySelector('[data-readiness-count]');
    const live = document.querySelector('[data-readiness-live]');
    if (!items.length) return;

    const update = function () {
      const total = items.length;
      const checked = items.filter(function (item) { return item.checked; }).length;
      const percent = checked / total;

      if (ring) ring.style.strokeDashoffset = String(100 - percent * 100);
      if (count) count.textContent = checked + ' / ' + total;
      if (live) live.textContent = checked + ' of ' + total + ' planning checks complete.';
    };

    items.forEach(function (item) {
      item.addEventListener('change', update);
    });

    update();
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
    if (tickerUpdate) tickerUpdate();
    if (roadmapUpdate) roadmapUpdate();
  }

  function requestScrollFrame() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame ? window.requestAnimationFrame(updateScrollEffects) : (updateScrollEffects(), 0);
  }

  initImageFallbacks();
  initTicker();
  initPrinciples();
  initStages();
  initSimulator();
  initRoadmap();
  initLivePlan();
  initReadiness();
  initMagnetic();

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });
  updateScrollEffects();
})();
