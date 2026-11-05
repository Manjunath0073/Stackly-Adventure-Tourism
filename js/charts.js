/* Stackly shared SVG charts — classic-script module exposed as window.Charts. */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let chartSequence = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function svg(tag, map) {
    const node = document.createElementNS(SVG_NS, tag);
    if (map) {
      Object.keys(map).forEach(function (key) {
        if (map[key] === null || map[key] === undefined || map[key] === false) return;
        node.setAttribute(key, String(map[key]));
      });
    }
    return node;
  }

  function svgText(text, map) {
    const node = svg('text', map);
    node.textContent = text;
    return node;
  }

  function svgRoot(width, height) {
    return svg('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: width,
      height: height,
      preserveAspectRatio: 'none',
      focusable: 'false'
    });
  }

  function formatDate(iso, style) {
    const date = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    if (Number.isNaN(date.getTime())) return '—';
    const options = style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }

  function formatMonthShort(iso) {
    const date = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  }

  function statusLabel(status) {
    const map = { 'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked', complete: 'Complete' };
    return map[status] || 'Unknown';
  }

  function smoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M' + points[0].x + ',' + points[0].y;
    let path = 'M' + points[0].x.toFixed(2) + ',' + points[0].y.toFixed(2);
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const after = points[index + 2] || next;
      const controlOneX = current.x + (next.x - previous.x) / 6;
      const controlOneY = current.y + (next.y - previous.y) / 6;
      const controlTwoX = next.x - (after.x - current.x) / 6;
      const controlTwoY = next.y - (after.y - current.y) / 6;
      path += ' C' + controlOneX.toFixed(2) + ',' + controlOneY.toFixed(2) +
        ' ' + controlTwoX.toFixed(2) + ',' + controlTwoY.toFixed(2) +
        ' ' + next.x.toFixed(2) + ',' + next.y.toFixed(2);
    }
    return path;
  }

  function straightPath(points) {
    return points.map(function (point, index) {
      return (index === 0 ? 'M' : 'L') + point.x.toFixed(2) + ',' + point.y.toFixed(2);
    }).join(' ');
  }

  function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const span = domainMax - domainMin || 1;
    return function (value) {
      return rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
    };
  }

  function maxOf(series) {
    let max = 0;
    series.forEach(function (item) {
      (item.values || []).forEach(function (value) {
        if (value > max) max = value;
      });
    });
    return max || 1;
  }

  function niceMax(value) {
    if (value <= 5) return 5;
    if (value <= 10) return 10;
    if (value <= 20) return 20;
    const magnitude = Math.pow(10, Math.floor(Math.log(value) / Math.LN10));
    const step = magnitude / 2;
    return Math.ceil(value / step) * step;
  }

  function tickIndexes(length, desired) {
    if (length <= 1) return [0];
    const count = Math.min(desired, length);
    const indexes = [];
    for (let index = 0; index < count; index += 1) {
      indexes.push(Math.round(index * (length - 1) / (count - 1)));
    }
    return indexes.filter(function (value, index, list) { return list.indexOf(value) === index; });
  }

  function animatePath(path, animate, duration) {
    if (!animate || !path) return;
    let length = 0;
    try { length = path.getTotalLength(); } catch (error) { length = 0; }
    if (!length) return;
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        path.style.transition = 'stroke-dashoffset ' + (duration || 820) + 'ms var(--ease-out)';
        path.style.strokeDashoffset = '0';
      });
    });
  }

  function animateBars(nodes, axis, animate) {
    if (!animate || !nodes.length) return;
    nodes.forEach(function (node) {
      node.style.transform = axis === 'x' ? 'scaleX(0)' : 'scaleY(0)';
    });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        nodes.forEach(function (node) { node.style.transform = 'scale(1)'; });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Shared tooltip
   * ------------------------------------------------------------------ */

  const Tooltip = (function () {
    let node = null;
    let initialized = false;

    function hide() {
      if (node) node.hidden = true;
    }

    function ensure() {
      if (node) return node;
      node = el('div', 'chart-tooltip');
      node.setAttribute('role', 'tooltip');
      node.id = 'chart-tooltip';
      node.hidden = true;
      document.body.appendChild(node);

      if (!initialized) {
        initialized = true;
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') hide();
        });
        document.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
      }
      return node;
    }

    function show(rows, x, y) {
      const tooltip = ensure();
      clear(tooltip);
      rows.forEach(function (row) {
        if (!row) return;
        if (row.heading) {
          tooltip.appendChild(el('span', 'chart-tooltip__label', row.heading));
          return;
        }
        const line = el('span', 'chart-tooltip__row');
        const left = el('span', null, row.label);
        const right = el('span', 'chart-tooltip__value', row.value);
        line.appendChild(left);
        line.appendChild(right);
        tooltip.appendChild(line);
      });

      tooltip.hidden = false;
      tooltip.style.transform = 'translate3d(-9999px, -9999px, 0)';
      const box = tooltip.getBoundingClientRect();
      const margin = 10;
      let left = x + 14;
      let top = y - 12;
      if (left + box.width > window.innerWidth - margin) left = x - box.width - 14;
      left = clamp(left, margin, Math.max(margin, window.innerWidth - box.width - margin));
      top = clamp(top, margin, Math.max(margin, window.innerHeight - box.height - margin));
      tooltip.style.transform = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
    }

    return { show: show, hide: hide };
  })();

  /* ------------------------------------------------------------------ *
   * Chart controller — reserved plot, resize redraw, table fallback
   * ------------------------------------------------------------------ */

  function createChart(spec) {
    const figure = el('figure', 'chart' + (spec.className ? ' ' + spec.className : ''));
    const plot = el('div', 'chart__plot');
    const height = spec.height || 220;
    plot.style.setProperty('--plot-h', height + 'px');

    const canvas = el('div', 'chart__canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', spec.label || 'Chart');
    const keys = el('div', 'chart__keys');
    keys.tabIndex = 0;
    keys.setAttribute('role', 'group');
    keys.hidden = true;
    const footer = el('div', 'chart__footer');
    const toggle = el('button', 'chart__toggle', 'View as table');
    toggle.type = 'button';
    const tableId = 'chart-table-' + (++chartSequence);
    toggle.setAttribute('aria-controls', tableId);
    toggle.setAttribute('aria-expanded', 'false');
    const tableWrap = el('div', 'chart__table');
    tableWrap.id = tableId;
    tableWrap.hidden = true;

    plot.appendChild(canvas);
    plot.appendChild(keys);
    footer.appendChild(toggle);
    figure.appendChild(plot);
    figure.appendChild(footer);
    figure.appendChild(tableWrap);

    let currentSpec = spec;
    let currentWidth = 0;
    let mounted = false;
    let destroyed = false;
    let resizeObserver = null;
    let resizeTimer = 0;
    let keyboard = null;

    function buildTable(tableSpec) {
      clear(tableWrap);
      if (!tableSpec) return;
      const table = el('table');
      if (tableSpec.caption) {
        const caption = el('caption', null, tableSpec.caption);
        table.appendChild(caption);
      }
      const head = el('thead');
      const headRow = el('tr');
      (tableSpec.columns || []).forEach(function (column) {
        const th = el('th', null, column);
        th.scope = 'col';
        headRow.appendChild(th);
      });
      head.appendChild(headRow);
      table.appendChild(head);
      const body = el('tbody');
      (tableSpec.rows || []).forEach(function (row) {
        const tr = el('tr');
        row.forEach(function (cell) { tr.appendChild(el('td', null, cell)); });
        body.appendChild(tr);
      });
      table.appendChild(body);
      tableWrap.appendChild(table);
    }

    function setLabel() {
      canvas.setAttribute('aria-label', currentSpec.label || 'Chart');
    }

    function draw(animate) {
      if (destroyed) return;
      clear(canvas);
      keyboard = null;
      let result;
      try {
        result = currentSpec.render(currentWidth, { animate: animate && !reducedMotion, height: height });
      } catch (error) {
        console.error('[Stackly] Chart render failed.', error);
        return;
      }

      let node = result;
      let keyboardSpec = null;
      if (result && result.node) {
        node = result.node;
        keyboardSpec = result.keyboard || null;
      }
      if (!node) return;
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      canvas.appendChild(node);

      if (keyboardSpec) {
        keyboard = keyboardSpec;
        keys.hidden = false;
        keys.setAttribute('aria-label', keyboardSpec.label || 'Explore data with the arrow keys.');
      } else {
        keys.hidden = true;
        keys.removeAttribute('aria-label');
      }
    }

    keys.addEventListener('focus', function () {
      if (keyboard && keyboard.show) keyboard.show();
    });

    keys.addEventListener('blur', function () {
      if (keyboard && keyboard.hide) keyboard.hide();
      Tooltip.hide();
    });

    keys.addEventListener('keydown', function (event) {
      if (!keyboard || !keyboard.onKey) return;
      if (keyboard.onKey(event)) {
        event.preventDefault();
        if (keyboard.describe) keys.setAttribute('aria-label', keyboard.describe());
      }
    });

    toggle.addEventListener('click', function () {
      const open = tableWrap.hidden;
      tableWrap.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide table' : 'View as table';
      if (open) tableWrap.scrollTop = 0;
    });

    function applySpec(nextSpec) {
      currentSpec = nextSpec;
      setLabel();
      buildTable(nextSpec.table);
      if (mounted) draw(false);
    }

    applySpec(spec);

    return {
      figure: figure,
      mount: function () {
        if (mounted || destroyed) return;
        mounted = true;
        currentWidth = Math.max(220, Math.round(plot.clientWidth || 600));
        draw(true);
        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(function () {
            const width = Math.round(plot.clientWidth || 0);
            if (!width || Math.abs(width - currentWidth) < 12) return;
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () {
              if (destroyed) return;
              currentWidth = width;
              draw(false);
            }, 140);
          });
          resizeObserver.observe(plot);
        }
      },
      update: applySpec,
      destroy: function () {
        destroyed = true;
        if (resizeObserver) resizeObserver.disconnect();
        window.clearTimeout(resizeTimer);
        Tooltip.hide();
      }
    };
  }

  function mountAll(scope, charts) {
    charts.forEach(function (chart) { scope.add(chart.destroy); });
    scope.defer(function () {
      charts.forEach(function (chart) { chart.mount(); });
    });
  }

  /* ------------------------------------------------------------------ *
   * Renderers
   * ------------------------------------------------------------------ */

  function sparkline(values, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = 3;
    const plotWidth = Math.max(1, width - margin * 2);
    const plotHeight = Math.max(1, height - margin * 2);
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const x = linearScale(0, Math.max(values.length - 1, 1), margin, margin + plotWidth);
    const y = linearScale(min, max, margin + plotHeight, margin);
    const points = values.map(function (value, index) {
      return { x: x(index), y: y(value) };
    });
    const linePath = smoothPath(points);
    const areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(2) + ',' + (margin + plotHeight).toFixed(2) +
      ' L' + points[0].x.toFixed(2) + ',' + (margin + plotHeight).toFixed(2) + ' Z';

    const area = svg('path', {
      d: areaPath,
      fill: 'var(--' + (opts.color || 'chart-2') + ')',
      'fill-opacity': '0.12',
      stroke: 'none'
    });
    const path = svg('path', {
      d: linePath,
      class: 'chart-line series-' + (opts.series || 2)
    });
    root.appendChild(area);
    root.appendChild(path);

    if (opts.lastDot) {
      const last = points[points.length - 1];
      root.appendChild(svg('circle', {
        cx: last.x,
        cy: last.y,
        r: 2.2,
        fill: 'var(--chart-' + (opts.series || 2) + ')'
      }));
    }

    if (opts.animate) animatePath(path, true, 760);
    return root;
  }

  function areaLine(values, labels, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 16, right: 14, bottom: 24, left: 42 };
    const plotWidth = Math.max(30, width - margin.left - margin.right);
    const plotHeight = Math.max(30, height - margin.top - margin.bottom);
    const maxValue = opts.max || 100;
    const minValue = opts.min || 0;
    const x = function (index) {
      return margin.left + (values.length <= 1 ? 0 : (index / (values.length - 1)) * plotWidth);
    };
    const y = linearScale(minValue, maxValue, margin.top + plotHeight, margin.top);
    const points = values.map(function (value, index) {
      return { x: x(index), y: y(value) };
    });

    const gradientId = 'area-gradient-' + (++chartSequence);
    const defs = svg('defs');
    const gradient = svg('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
    gradient.appendChild(svg('stop', { offset: '0%', 'stop-color': 'var(--chart-1)', 'stop-opacity': '0.34' }));
    gradient.appendChild(svg('stop', { offset: '100%', 'stop-color': 'var(--chart-1)', 'stop-opacity': '0.02' }));
    defs.appendChild(gradient);
    root.appendChild(defs);

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = maxValue - ((maxValue - minValue) / 4) * tick;
      const yy = y(value);
      root.appendChild(svg('line', {
        x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'chart-grid'
      }));
      root.appendChild(svgText((opts.formatY ? opts.formatY(value) : Math.round(value) + (opts.suffix || '')), {
        x: margin.left - 7,
        y: yy + 3,
        'text-anchor': 'end',
        class: 'chart-axis-label'
      }));
    }

    tickIndexes(labels.length, 5).forEach(function (index) {
      root.appendChild(svgText(labels[index], {
        x: x(index),
        y: height - 6,
        'text-anchor': index === 0 ? 'start' : (index === labels.length - 1 ? 'end' : 'middle'),
        class: 'chart-axis-label'
      }));
    });

    const smooth = smoothPath(points);
    const areaPath = smooth + ' L' + points[points.length - 1].x.toFixed(2) + ',' + (margin.top + plotHeight) +
      ' L' + points[0].x.toFixed(2) + ',' + (margin.top + plotHeight) + ' Z';
    const area = svg('path', { d: areaPath, fill: 'url(#' + gradientId + ')', class: 'chart-area' });
    const path = svg('path', { d: smooth, class: 'chart-line series-1' });
    root.appendChild(area);
    root.appendChild(path);
    if (opts.animate) {
      area.style.opacity = '0';
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          area.style.transition = 'opacity 800ms var(--ease-out)';
          area.style.opacity = '';
        });
      });
      animatePath(path, true, 850);
    }

    const crosshair = svg('line', {
      x1: 0, x2: 0, y1: margin.top, y2: margin.top + plotHeight, class: 'chart-crosshair'
    });
    const focusDot = svg('circle', { cx: 0, cy: 0, r: 3.2, fill: 'var(--chart-1)', class: 'chart-point' });
    crosshair.style.opacity = '0';
    focusDot.style.opacity = '0';
    root.appendChild(crosshair);
    root.appendChild(focusDot);

    let activeIndex = values.length - 1;
    function showAt(index, clientX, clientY) {
      activeIndex = clamp(index, 0, values.length - 1);
      const point = points[activeIndex];
      crosshair.setAttribute('x1', point.x);
      crosshair.setAttribute('x2', point.x);
      crosshair.style.opacity = '1';
      focusDot.setAttribute('cx', point.x);
      focusDot.setAttribute('cy', point.y);
      focusDot.style.opacity = '1';
      const rect = root.getBoundingClientRect();
      const px = clientX === undefined ? rect.left + point.x : clientX;
      const py = clientY === undefined ? rect.top + point.y : clientY;
      Tooltip.show([
        { heading: opts.tooltipHeading || 'Value' },
        { label: labels[activeIndex] || '', value: opts.formatValue ? opts.formatValue(values[activeIndex]) : values[activeIndex] + (opts.suffix || '') }
      ], px, py);
    }

    function hide() {
      crosshair.style.opacity = '0';
      focusDot.style.opacity = '0';
      Tooltip.hide();
    }

    root.addEventListener('pointermove', function (event) {
      const rect = root.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const ratio = clamp((localX - margin.left) / plotWidth, 0, 1);
      showAt(Math.round(ratio * (values.length - 1)), event.clientX, event.clientY);
    });
    root.addEventListener('pointerleave', hide);

    return {
      node: root,
      keyboard: {
        label: opts.keyboardLabel || 'Chart data. Use the left and right arrow keys to inspect values.',
        describe: function () {
          return (labels[activeIndex] || 'Point') + ': ' +
            (opts.formatValue ? opts.formatValue(values[activeIndex]) : values[activeIndex] + (opts.suffix || '')) +
            '. Use arrow keys to inspect.';
        },
        show: function () { showAt(values.length - 1); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowLeft') { showAt(activeIndex - 1); return true; }
          if (event.key === 'ArrowRight') { showAt(activeIndex + 1); return true; }
          if (event.key === 'Home') { showAt(0); return true; }
          if (event.key === 'End') { showAt(values.length - 1); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  function line(series, labels, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 16, right: 14, bottom: 24, left: 38 };
    const plotWidth = Math.max(30, width - margin.left - margin.right);
    const plotHeight = Math.max(30, height - margin.top - margin.bottom);
    let maxValue = opts.max || niceMax(maxOf(series));
    if (opts.band && opts.band.max > maxValue) maxValue = niceMax(opts.band.max);
    const x = function (index) {
      return margin.left + (labels.length <= 1 ? 0 : (index / (labels.length - 1)) * plotWidth);
    };
    const y = linearScale(0, maxValue, margin.top + plotHeight, margin.top);

    if (opts.band) {
      const bandTop = y(opts.band.max);
      const bandBottom = y(opts.band.min);
      root.appendChild(svg('rect', {
        x: margin.left,
        y: bandTop,
        width: plotWidth,
        height: Math.max(1, bandBottom - bandTop),
        class: 'chart-band'
      }));
      root.appendChild(svg('line', {
        x1: margin.left, x2: width - margin.right, y1: bandTop, y2: bandTop, class: 'chart-band-line'
      }));
      root.appendChild(svg('line', {
        x1: margin.left, x2: width - margin.right, y1: bandBottom, y2: bandBottom, class: 'chart-band-line'
      }));
      root.appendChild(svgText(opts.band.label || 'Healthy band', {
        x: width - margin.right - 3,
        y: bandTop - 4,
        'text-anchor': 'end',
        class: 'chart-band-label'
      }));
    }

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (maxValue / 4) * tick;
      const yy = y(value);
      root.appendChild(svg('line', {
        x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'chart-grid'
      }));
      root.appendChild(svgText((opts.formatY ? opts.formatY(value) : Math.round(value) + (opts.suffix || '')), {
        x: margin.left - 7, y: yy + 3, 'text-anchor': 'end', class: 'chart-axis-label'
      }));
    }

    tickIndexes(labels.length, opts.xTickCount || 6).forEach(function (index) {
      root.appendChild(svgText(labels[index], {
        x: x(index),
        y: height - 6,
        'text-anchor': index === 0 ? 'start' : (index === labels.length - 1 ? 'end' : 'middle'),
        class: 'chart-axis-label'
      }));
    });

    const seriesPoints = [];
    series.forEach(function (item, seriesIndex) {
      const points = item.values.map(function (value, index) {
        return { x: x(index), y: y(value) };
      });
      seriesPoints.push(points);
      const path = svg('path', {
        d: opts.smooth === false ? straightPath(points) : smoothPath(points),
        class: 'chart-line series-' + (item.colorIndex || seriesIndex + 1) + (item.dashed ? ' chart-line--target' : '')
      });
      if (item.opacity !== undefined) path.style.opacity = String(item.opacity);
      root.appendChild(path);
      if (opts.animate) animatePath(path, true, 820);
    });

    const crosshair = svg('line', {
      x1: 0, x2: 0, y1: margin.top, y2: margin.top + plotHeight, class: 'chart-crosshair'
    });
    crosshair.style.opacity = '0';
    root.appendChild(crosshair);

    let activeIndex = labels.length - 1;
    function showAt(index, clientX, clientY) {
      activeIndex = clamp(index, 0, labels.length - 1);
      const firstPoint = seriesPoints[0] ? seriesPoints[0][activeIndex] : null;
      if (!firstPoint) return;
      crosshair.setAttribute('x1', firstPoint.x);
      crosshair.setAttribute('x2', firstPoint.x);
      crosshair.style.opacity = '1';
      const rect = root.getBoundingClientRect();
      const px = clientX === undefined ? rect.left + firstPoint.x : clientX;
      const py = clientY === undefined ? rect.top + firstPoint.y : clientY;
      const rows = [{ heading: opts.tooltipHeading || labels[activeIndex] }];
      series.forEach(function (item) {
        rows.push({
          label: item.name,
          value: opts.formatValue ? opts.formatValue(item.values[activeIndex]) : item.values[activeIndex] + (opts.suffix || '')
        });
      });
      Tooltip.show(rows, px, py);
    }

    function hide() {
      crosshair.style.opacity = '0';
      Tooltip.hide();
    }

    root.addEventListener('pointermove', function (event) {
      const rect = root.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const ratio = clamp((localX - margin.left) / plotWidth, 0, 1);
      showAt(Math.round(ratio * (labels.length - 1)), event.clientX, event.clientY);
    });
    root.addEventListener('pointerleave', hide);

    return {
      node: root,
      keyboard: {
        label: opts.keyboardLabel || 'Multi-series chart. Use arrow keys to inspect values.',
        describe: function () {
          const parts = series.map(function (item) {
            return item.name + ' ' + (opts.formatValue ? opts.formatValue(item.values[activeIndex]) : item.values[activeIndex] + (opts.suffix || ''));
          });
          return (labels[activeIndex] || 'Point') + ': ' + parts.join(', ') + '.';
        },
        show: function () { showAt(labels.length - 1); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowLeft') { showAt(activeIndex - 1); return true; }
          if (event.key === 'ArrowRight') { showAt(activeIndex + 1); return true; }
          if (event.key === 'Home') { showAt(0); return true; }
          if (event.key === 'End') { showAt(labels.length - 1); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  function barsHorizontal(rows, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 8, right: 42, bottom: 8, left: Math.min(126, Math.max(76, width * 0.24)) };
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const maxValue = opts.max || niceMax(rows.length ? Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.value, row.target || 0);
    })) : 1);
    const x = linearScale(0, maxValue, margin.left, margin.left + plotWidth);
    const rowHeight = plotHeight / Math.max(1, rows.length);
    const barHeight = Math.min(13, rowHeight * 0.44);
    const bars = [];

    rows.forEach(function (row, index) {
      const centerY = margin.top + index * rowHeight + rowHeight / 2;
      root.appendChild(svgText(row.name, {
        x: margin.left - 8, y: centerY + 3, 'text-anchor': 'end', class: 'chart-bar-label'
      }));
      root.appendChild(svg('rect', {
        x: margin.left, y: centerY - barHeight / 2, width: plotWidth, height: barHeight,
        rx: barHeight / 2, fill: 'var(--dash-panel-3)', opacity: '0.65'
      }));
      const bar = svg('rect', {
        x: margin.left,
        y: centerY - barHeight / 2,
        width: Math.max(2, x(row.value) - margin.left),
        height: barHeight,
        rx: barHeight / 2,
        class: 'chart-bar chart-bar--h fill-series-' + (opts.colorIndex || ((index % 3) + 1))
      });
      bars.push(bar);
      root.appendChild(bar);

      if (row.target) {
        const targetX = x(row.target);
        root.appendChild(svg('line', {
          x1: targetX, x2: targetX, y1: centerY - barHeight / 2 - 4, y2: centerY + barHeight / 2 + 4,
          class: 'chart-bar--target'
        }));
      }

      root.appendChild(svgText(opts.formatValue ? opts.formatValue(row.value) : row.value + (opts.suffix || ''), {
        x: width - 4, y: centerY + 3, 'text-anchor': 'end', class: 'chart-bar-value'
      }));
    });

    if (opts.animate) animateBars(bars, 'x', true);
    return root;
  }

  function barsGrouped(labels, series, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 14, right: 12, bottom: 24, left: 34 };
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const maxValue = opts.max || niceMax(maxOf(series));
    const groupWidth = plotWidth / labels.length;
    const available = groupWidth * 0.72;
    const barWidth = Math.max(2, available / Math.max(1, series.length));
    const bars = [];

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (maxValue / 4) * tick;
      const yy = margin.top + plotHeight - (value / maxValue) * plotHeight;
      root.appendChild(svg('line', {
        x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: 'chart-grid'
      }));
      root.appendChild(svgText(opts.formatY ? opts.formatY(value) : String(Math.round(value)), {
        x: margin.left - 6, y: yy + 3, 'text-anchor': 'end', class: 'chart-axis-label'
      }));
    }

    labels.forEach(function (label, labelIndex) {
      const groupStart = margin.left + labelIndex * groupWidth + (groupWidth - available) / 2;
      series.forEach(function (item, seriesIndex) {
        const value = item.values[labelIndex];
        const barHeight = Math.max(1, (value / maxValue) * plotHeight);
        const rect = svg('rect', {
          x: groupStart + seriesIndex * barWidth,
          y: margin.top + plotHeight - barHeight,
          width: Math.max(2, barWidth - 2),
          height: barHeight,
          rx: 1.5,
          class: 'chart-bar fill-series-' + (item.colorIndex || seriesIndex + 1)
        });
        if (item.opacity !== undefined) rect.style.opacity = String(item.opacity);
        rect.addEventListener('pointerenter', function (event) {
          Tooltip.show([
            { heading: label },
            { label: item.name, value: opts.formatValue ? opts.formatValue(value) : value + (opts.suffix || '') }
          ], event.clientX, event.clientY);
        });
        rect.addEventListener('pointerleave', function () { Tooltip.hide(); });
        bars.push(rect);
        root.appendChild(rect);
      });
      root.appendChild(svgText(label, {
        x: margin.left + labelIndex * groupWidth + groupWidth / 2,
        y: height - 6,
        'text-anchor': 'middle',
        class: 'chart-axis-label'
      }));
    });

    if (opts.animate) animateBars(bars, 'y', true);
    return root;
  }

  function donut(segments, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const size = Math.min(width, height);
    const center = { x: width / 2, y: height / 2 };
    const stroke = Math.max(12, Math.min(20, size * 0.11));
    const radius = Math.max(20, size / 2 - stroke / 2 - 4);
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce(function (sum, segment) { return sum + segment.value; }, 0) || 1;
    let offset = 0;

    segments.forEach(function (segment) {
      const length = (segment.value / total) * circumference;
      const gap = Math.min(4, length * 0.15);
      const circle = svg('circle', {
        cx: center.x,
        cy: center.y,
        r: radius,
        class: 'donut__seg',
        'data-segment': segment.key,
        transform: 'rotate(-90 ' + center.x + ' ' + center.y + ')',
        'stroke-dasharray': Math.max(0, length - gap) + ' ' + (circumference - Math.max(0, length - gap)),
        'stroke-dashoffset': -offset
      });
      if (segment.colorVar) circle.style.stroke = 'var(' + segment.colorVar + ')';
      if (opts.animate) {
        circle.style.strokeDasharray = '0 ' + circumference;
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            circle.style.strokeDasharray = Math.max(0, length - gap) + ' ' + (circumference - Math.max(0, length - gap));
          });
        });
      }
      root.appendChild(circle);
      offset += length;
    });

    root.appendChild(svgText(opts.centerValue !== undefined ? String(opts.centerValue) : String(total), {
      x: center.x, y: center.y + 4, class: 'donut-center-value'
    }));
    root.appendChild(svgText(opts.centerLabel || 'total', {
      x: center.x, y: center.y + 21, class: 'donut-center-label'
    }));
    return root;
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function weekHeatmap(weeks, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 17, right: 4, bottom: 6, left: 25 };
    const gap = 3;
    const plotWidth = Math.max(60, width - margin.left - margin.right);
    const plotHeight = Math.max(50, height - margin.top - margin.bottom);
    const cellWidth = Math.max(4, (plotWidth - gap * (weeks.length - 1)) / weeks.length);
    const cellHeight = Math.max(4, (plotHeight - gap * 6) / 7);
    const cellSize = Math.min(cellWidth, cellHeight);
    const originX = margin.left;
    const originY = margin.top;
    const cellNodes = [];
    const cellByKey = {};
    let lastMonth = '';

    DAY_NAMES.forEach(function (day, index) {
      if (index % 2 !== 0) return;
      root.appendChild(svgText(day, {
        x: originX - 6, y: originY + index * (cellSize + gap) + cellSize / 2 + 2.5,
        'text-anchor': 'end', class: 'heat-label'
      }));
    });

    weeks.forEach(function (week, weekIndex) {
      const month = formatMonthShort(week.days[0].date);
      if (month !== lastMonth) {
        root.appendChild(svgText(month, {
          x: originX + weekIndex * (cellSize + gap), y: 9, class: 'heat-label'
        }));
        lastMonth = month;
      }
      week.days.forEach(function (day, dayIndex) {
        const rect = svg('rect', {
          x: originX + weekIndex * (cellSize + gap),
          y: originY + dayIndex * (cellSize + gap),
          width: cellSize,
          height: cellSize,
          rx: Math.min(2, cellSize * 0.2),
          class: 'heat-cell',
          'data-level': day.value
        });
        if (opts.animate) rect.style.opacity = '0';
        rect.addEventListener('pointerenter', function (event) {
          highlightCell(weekIndex, dayIndex);
          Tooltip.show([
            { heading: formatDate(day.date, 'long') },
            { label: 'Recorded activity', value: day.value === 0 ? 'None' : String(day.value) }
          ], event.clientX, event.clientY);
        });
        rect.addEventListener('pointerleave', function () {
          rect.classList.remove('is-hover');
          Tooltip.hide();
        });
        root.appendChild(rect);
        cellNodes.push(rect);
        cellByKey[weekIndex + '-' + dayIndex] = { node: rect, day: day };
      });
    });

    if (opts.animate) {
      cellNodes.forEach(function (node, index) {
        window.setTimeout(function () {
          node.style.transition = 'opacity 240ms ease';
          node.style.opacity = '1';
        }, 4 + index * 2);
      });
    }

    let activeWeek = weeks.length - 1;
    let activeDay = 6;

    function highlightCell(weekIndex, dayIndex) {
      cellNodes.forEach(function (node) { node.classList.remove('is-hover'); });
      activeWeek = weekIndex;
      activeDay = dayIndex;
      const cell = cellByKey[weekIndex + '-' + dayIndex];
      if (!cell) return null;
      cell.node.classList.add('is-hover');
      return cell;
    }

    function showAt(weekIndex, dayIndex) {
      const cell = highlightCell(clamp(weekIndex, 0, weeks.length - 1), clamp(dayIndex, 0, 6));
      if (!cell) return;
      const rect = cell.node.getBoundingClientRect();
      Tooltip.show([
        { heading: formatDate(cell.day.date, 'long') },
        { label: 'Recorded activity', value: cell.day.value === 0 ? 'None' : String(cell.day.value) }
      ], rect.left + rect.width / 2, rect.top);
    }

    function hide() {
      cellNodes.forEach(function (node) { node.classList.remove('is-hover'); });
      Tooltip.hide();
    }

    return {
      node: root,
      keyboard: {
        label: 'Activity heatmap. Use arrow keys to inspect days.',
        describe: function () {
          const cell = cellByKey[activeWeek + '-' + activeDay];
          if (!cell) return 'Activity heatmap.';
          return formatDate(cell.day.date, 'long') + ': ' + cell.day.value + ' recorded actions.';
        },
        show: function () { showAt(activeWeek, activeDay); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowLeft') { showAt(activeWeek - 1, activeDay); return true; }
          if (event.key === 'ArrowRight') { showAt(activeWeek + 1, activeDay); return true; }
          if (event.key === 'ArrowUp') { showAt(activeWeek, activeDay - 1); return true; }
          if (event.key === 'ArrowDown') { showAt(activeWeek, activeDay + 1); return true; }
          if (event.key === 'Home') { showAt(0, 0); return true; }
          if (event.key === 'End') { showAt(weeks.length - 1, 6); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  function matrixHeatmap(config, width, height, options) {
    const opts = options || {};
    const rows = config.rows || [];
    const columns = config.columns || [];
    const root = svgRoot(width, height);
    const margin = { top: 20, right: 4, bottom: 6, left: opts.labelWidth || 82 };
    const gap = 2;
    const plotWidth = Math.max(50, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const cellWidth = Math.max(3, (plotWidth - gap * (columns.length - 1)) / Math.max(1, columns.length));
    const cellHeight = Math.max(4, (plotHeight - gap * (rows.length - 1)) / Math.max(1, rows.length));
    const labelEvery = opts.columnLabelEvery || Math.max(1, Math.ceil(columns.length / 8));
    const levelFor = opts.levelFor || function (value) { return clamp(Math.round(value), 0, 5); };
    const cells = [];
    const byKey = {};

    columns.forEach(function (column, index) {
      if (index !== 0 && index % labelEvery !== 0) return;
      root.appendChild(svgText(column, {
        x: margin.left + index * (cellWidth + gap) + cellWidth / 2,
        y: 10,
        'text-anchor': 'middle',
        class: 'heat-label'
      }));
    });

    rows.forEach(function (row, rowIndex) {
      const label = row.label.length > 15 ? row.label.slice(0, 14) + '…' : row.label;
      root.appendChild(svgText(label, {
        x: margin.left - 7,
        y: margin.top + rowIndex * (cellHeight + gap) + cellHeight / 2 + 3,
        'text-anchor': 'end',
        class: 'heat-label'
      }));
      row.values.forEach(function (value, columnIndex) {
        const rect = svg('rect', {
          x: margin.left + columnIndex * (cellWidth + gap),
          y: margin.top + rowIndex * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
          rx: Math.min(2, cellHeight * 0.2),
          class: 'heat-cell',
          'data-level': levelFor(value, row, columnIndex)
        });
        if (opts.animate) rect.style.opacity = '0';
        const cell = {
          node: rect,
          value: value,
          rowLabel: row.label,
          columnLabel: columns[columnIndex] || '',
          detail: row.detail
        };
        rect.addEventListener('pointerenter', function (event) {
          highlight(rowIndex, columnIndex);
          Tooltip.show([
            { heading: row.label },
            { label: columns[columnIndex] || '', value: opts.formatValue ? opts.formatValue(value) : value + (opts.suffix || '') }
          ], event.clientX, event.clientY);
        });
        rect.addEventListener('pointerleave', function () {
          rect.classList.remove('is-hover');
          Tooltip.hide();
        });
        root.appendChild(rect);
        cells.push(cell);
        byKey[rowIndex + '-' + columnIndex] = cell;
      });
    });

    if (opts.animate) {
      cells.forEach(function (cell, index) {
        window.setTimeout(function () {
          cell.node.style.transition = 'opacity 240ms ease';
          cell.node.style.opacity = '1';
        }, 4 + index * 2);
      });
    }

    let activeRow = 0;
    let activeColumn = columns.length - 1;

    function highlight(rowIndex, columnIndex) {
      cells.forEach(function (cell) { cell.node.classList.remove('is-hover'); });
      activeRow = clamp(rowIndex, 0, rows.length - 1);
      activeColumn = clamp(columnIndex, 0, columns.length - 1);
      const cell = byKey[activeRow + '-' + activeColumn];
      if (cell) cell.node.classList.add('is-hover');
      return cell || null;
    }

    function showAt(rowIndex, columnIndex) {
      const cell = highlight(rowIndex, columnIndex);
      if (!cell) return;
      const box = cell.node.getBoundingClientRect();
      Tooltip.show([
        { heading: cell.rowLabel },
        { label: cell.columnLabel, value: opts.formatValue ? opts.formatValue(cell.value) : cell.value + (opts.suffix || '') }
      ], box.left + box.width / 2, box.top);
    }

    function hide() {
      cells.forEach(function (cell) { cell.node.classList.remove('is-hover'); });
      Tooltip.hide();
    }

    return {
      node: root,
      keyboard: {
        label: opts.keyboardLabel || 'Utilization heatmap. Use arrow keys to inspect cells.',
        describe: function () {
          const cell = byKey[activeRow + '-' + activeColumn];
          if (!cell) return 'Utilization heatmap.';
          return cell.rowLabel + ', ' + cell.columnLabel + ': ' + (opts.formatValue ? opts.formatValue(cell.value) : cell.value) + '.';
        },
        show: function () { showAt(activeRow, activeColumn); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowLeft') { showAt(activeRow, activeColumn - 1); return true; }
          if (event.key === 'ArrowRight') { showAt(activeRow, activeColumn + 1); return true; }
          if (event.key === 'ArrowUp') { showAt(activeRow - 1, activeColumn); return true; }
          if (event.key === 'ArrowDown') { showAt(activeRow + 1, activeColumn); return true; }
          if (event.key === 'Home') { showAt(0, 0); return true; }
          if (event.key === 'End') { showAt(rows.length - 1, columns.length - 1); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  function heatmap(data, width, height, options) {
    if (data && !Array.isArray(data) && data.rows && data.columns) {
      return matrixHeatmap(data, width, height, options);
    }
    return weekHeatmap(data, width, height, options);
  }

  function radar(axes, values, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const center = { x: width / 2, y: height / 2 };
    const radius = Math.max(40, Math.min(width, height) / 2 - 38);
    const levels = 4;
    const count = axes.length;
    const maxValue = opts.max || 100;
    const angleFor = function (index) {
      return (Math.PI * 2 * index) / count - Math.PI / 2;
    };
    const pointFor = function (index, ratio) {
      const angle = angleFor(index);
      return {
        x: center.x + Math.cos(angle) * radius * ratio,
        y: center.y + Math.sin(angle) * radius * ratio
      };
    };

    for (let level = 1; level <= levels; level += 1) {
      const ratio = level / levels;
      const points = [];
      for (let index = 0; index < count; index += 1) {
        const point = pointFor(index, ratio);
        points.push(point.x.toFixed(2) + ',' + point.y.toFixed(2));
      }
      root.appendChild(svg('polygon', { points: points.join(' '), class: 'radar-grid' }));
    }

    for (let index = 0; index < count; index += 1) {
      const outer = pointFor(index, 1);
      root.appendChild(svg('line', {
        x1: center.x, y1: center.y, x2: outer.x, y2: outer.y, class: 'radar-axis'
      }));
      const labelPoint = pointFor(index, 1.17);
      const anchor = Math.abs(labelPoint.x - center.x) < 6 ? 'middle' : (labelPoint.x > center.x ? 'start' : 'end');
      const axisLabel = axes[index];
      const shortLabel = axisLabel.length > 15 ? axisLabel.slice(0, 14) + '…' : axisLabel;
      root.appendChild(svgText(shortLabel, {
        x: labelPoint.x, y: labelPoint.y + 3, 'text-anchor': anchor, class: 'radar-label'
      }));
    }

    const shapePoints = values.map(function (value, index) {
      const point = pointFor(index, clamp(value / maxValue, 0, 1));
      return point.x.toFixed(2) + ',' + point.y.toFixed(2);
    });
    const shape = svg('polygon', { points: shapePoints.join(' '), class: 'radar-shape' });
    if (opts.animate) {
      shape.style.opacity = '0';
      shape.style.transform = 'scale(.9)';
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          shape.style.opacity = '';
          shape.style.transform = '';
        });
      });
    }
    root.appendChild(shape);

    values.forEach(function (value, index) {
      const point = pointFor(index, clamp(value / maxValue, 0, 1));
      root.appendChild(svg('circle', { cx: point.x, cy: point.y, r: 2.2, class: 'radar-dot' }));
    });

    return root;
  }

  function ring(value, max, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const size = Math.min(width, height);
    const center = { x: width / 2, y: height / 2 };
    const stroke = Math.max(10, Math.min(15, size * 0.09));
    const radius = Math.max(20, size / 2 - stroke / 2 - 4);
    const circumference = 2 * Math.PI * radius;
    const ratio = clamp(value / (max || 1), 0, 1);
    const targetOffset = circumference * (1 - ratio);

    const track = svg('circle', { cx: center.x, cy: center.y, r: radius, class: 'ring__track' });
    const ringNode = svg('circle', {
      cx: center.x,
      cy: center.y,
      r: radius,
      class: 'ring__value',
      transform: 'rotate(-90 ' + center.x + ' ' + center.y + ')',
      'stroke-dasharray': circumference,
      'stroke-dashoffset': targetOffset
    });
    if (opts.animate) {
      ringNode.style.strokeDashoffset = circumference;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          ringNode.style.strokeDashoffset = targetOffset;
        });
      });
    }
    root.appendChild(track);
    root.appendChild(ringNode);
    root.appendChild(svgText(opts.centerValue || Math.round(ratio * 100) + '%', {
      x: center.x, y: center.y + 3, class: 'ring-center-value'
    }));
    root.appendChild(svgText(opts.centerLabel || 'used', {
      x: center.x, y: center.y + 18, class: 'ring-center-label'
    }));
    return root;
  }

  function gantt(phases, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const range = opts.range || 8;
    const margin = { top: 20, right: 14, bottom: 12, left: Math.min(168, Math.max(96, width * 0.3)) };
    const plotWidth = Math.max(50, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const columnWidth = plotWidth / range;
    const rowHeight = plotHeight / Math.max(1, phases.length);
    const barHeight = Math.min(12, rowHeight * 0.46);
    const xAt = function (week) { return margin.left + week * columnWidth; };
    const rowById = {};

    for (let week = 0; week <= range; week += 1) {
      const x = xAt(week);
      root.appendChild(svg('line', {
        x1: x, x2: x, y1: margin.top, y2: margin.top + plotHeight, class: 'gantt-grid'
      }));
      if (week < range) {
        root.appendChild(svgText('W' + (week + 1), {
          x: x + columnWidth / 2, y: 11, 'text-anchor': 'middle', class: 'heat-label'
        }));
      }
    }

    if (opts.today !== undefined) {
      const todayX = xAt(clamp(opts.today, 0, range));
      root.appendChild(svg('line', {
        x1: todayX, x2: todayX, y1: margin.top - 3, y2: margin.top + plotHeight,
        class: 'gantt-today'
      }));
      root.appendChild(svgText('Today', {
        x: todayX + 4, y: height - 2, class: 'gantt-today-label'
      }));
    }

    const bars = [];
    phases.forEach(function (phase, index) {
      const centerY = margin.top + index * rowHeight + rowHeight / 2;
      const label = phase.name.length > 22 ? phase.name.slice(0, 21) + '…' : phase.name;
      root.appendChild(svgText(label, {
        x: margin.left - 8, y: centerY + 3, 'text-anchor': 'end', class: 'gantt-row-label'
      }));
      const start = clamp(phase.start, 1, range);
      const end = clamp(phase.end, start, range);
      const bar = svg('rect', {
        x: margin.left + (start - 1) * columnWidth + 2,
        y: centerY - barHeight / 2,
        width: Math.max(5, (end - start + 1) * columnWidth - 4),
        height: barHeight,
        class: 'gantt-bar',
        'data-status': phase.status
      });
      if (phase.id) rowById[phase.id] = { phase: phase, index: index, start: start, end: end, y: centerY };
      bar.addEventListener('pointerenter', function (event) {
        Tooltip.show([
          { heading: phase.name },
          { label: 'Phase', value: 'W' + start + '–W' + end },
          { label: 'Status', value: statusLabel(phase.status) }
        ], event.clientX, event.clientY);
      });
      bar.addEventListener('pointerleave', function () { Tooltip.hide(); });
      bars.push(bar);
      root.appendChild(bar);
    });

    (opts.dependencies || []).forEach(function (dependency) {
      const from = rowById[dependency.from];
      const to = rowById[dependency.to];
      if (!from || !to) return;
      const startX = margin.left + from.end * columnWidth;
      const endX = margin.left + (to.start - 1) * columnWidth;
      const midX = startX + Math.max(6, (endX - startX) / 2);
      const path = svg('path', {
        d: 'M' + startX.toFixed(1) + ',' + from.y.toFixed(1) +
          ' H' + midX.toFixed(1) +
          ' V' + to.y.toFixed(1) +
          ' H' + (endX - 2).toFixed(1),
        class: 'gantt-dependency'
      });
      root.appendChild(path);
    });

    if (opts.animate) animateBars(bars, 'x', true);
    return root;
  }

  function allocationBars(rows, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 8, right: 46, bottom: 8, left: Math.min(124, Math.max(80, width * 0.25)) };
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const maxValue = opts.max || 100;
    const rowHeight = plotHeight / Math.max(1, rows.length);
    const barHeight = Math.min(13, rowHeight * 0.48);
    const x = linearScale(0, maxValue, margin.left, margin.left + plotWidth);
    const bars = [];

    rows.forEach(function (row, index) {
      const centerY = margin.top + index * rowHeight + rowHeight / 2;
      root.appendChild(svgText(row.name, {
        x: margin.left - 8, y: centerY + 3, 'text-anchor': 'end', class: 'chart-bar-label'
      }));
      root.appendChild(svg('rect', {
        x: margin.left, y: centerY - barHeight / 2, width: plotWidth, height: barHeight,
        rx: barHeight / 2, fill: 'var(--dash-panel-3)'
      }));
      const allocatedWidth = Math.max(1, x(clamp(row.allocated, 0, maxValue)) - margin.left);
      const availableWidth = Math.max(0, x(clamp(row.allocated + row.available, 0, maxValue)) - x(row.allocated));
      const allocated = svg('rect', {
        x: margin.left, y: centerY - barHeight / 2, width: allocatedWidth, height: barHeight,
        rx: barHeight / 2, class: 'chart-bar chart-bar--h fill-series-2'
      });
      const available = svg('rect', {
        x: margin.left + allocatedWidth,
        y: centerY - barHeight / 2,
        width: availableWidth,
        height: barHeight,
        rx: barHeight / 2,
        class: 'chart-bar chart-bar--h allocation-available'
      });
      bars.push(allocated, available);
      root.appendChild(allocated);
      root.appendChild(available);
      const targetX = x(opts.target || 100);
      root.appendChild(svg('line', {
        x1: targetX, x2: targetX, y1: centerY - barHeight / 2 - 4, y2: centerY + barHeight / 2 + 4,
        class: 'chart-bar--target'
      }));
      root.appendChild(svgText(Math.round(row.allocated) + '%', {
        x: width - 4, y: centerY + 3, 'text-anchor': 'end', class: 'chart-bar-value'
      }));
    });

    if (opts.animate) animateBars(bars, 'x', true);
    return root;
  }

  function quadrantScatter(points, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const margin = { top: 18, right: 16, bottom: 38, left: 54 };
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const xMax = opts.xMax || 100;
    const yMax = opts.yMax || niceMax(Math.max.apply(null, points.map(function (point) { return point.y; })));
    const xMid = opts.xMid === undefined ? xMax / 2 : opts.xMid;
    const yMid = opts.yMid === undefined ? yMax / 2 : opts.yMid;
    const x = linearScale(0, xMax, margin.left, margin.left + plotWidth);
    const y = linearScale(0, yMax, margin.top + plotHeight, margin.top);
    const quadrants = opts.quadrants || {};

    const quadWidth = x(xMid) - margin.left;
    const quadHeight = y(yMid) - margin.top;
    [
      { x: margin.left, y: margin.top, w: quadWidth, h: quadHeight, label: quadrants.topLeft || 'Protect', anchor: 'start' },
      { x: x(xMid), y: margin.top, w: plotWidth - quadWidth, h: quadHeight, label: quadrants.topRight || 'Grow', anchor: 'end' },
      { x: margin.left, y: y(yMid), w: quadWidth, h: plotHeight - quadHeight, label: quadrants.bottomLeft || 'Review', anchor: 'start' },
      { x: x(xMid), y: y(yMid), w: plotWidth - quadWidth, h: plotHeight - quadHeight, label: quadrants.bottomRight || 'Nurture', anchor: 'end' }
    ].forEach(function (quadrant, index) {
      root.appendChild(svg('rect', {
        x: quadrant.x,
        y: quadrant.y,
        width: Math.max(0, quadrant.w),
        height: Math.max(0, quadrant.h),
        class: 'scatter-quadrant' + (index % 2 ? ' scatter-quadrant--alt' : '')
      }));
      const labelX = quadrant.anchor === 'start' ? quadrant.x + 6 : quadrant.x + quadrant.w - 6;
      root.appendChild(svgText(quadrant.label, {
        x: labelX,
        y: quadrant.y + 12,
        'text-anchor': quadrant.anchor,
        class: 'scatter-quadrant-label'
      }));
    });

    root.appendChild(svg('line', {
      x1: x(xMid), x2: x(xMid), y1: margin.top, y2: margin.top + plotHeight, class: 'scatter-divider'
    }));
    root.appendChild(svg('line', {
      x1: margin.left, x2: margin.left + plotWidth, y1: y(yMid), y2: y(yMid), class: 'scatter-divider'
    }));

    for (let tick = 0; tick <= 2; tick += 1) {
      const value = (xMax / 2) * tick;
      const xx = x(value);
      root.appendChild(svg('line', {
        x1: xx, x2: xx, y1: margin.top, y2: margin.top + plotHeight, class: 'chart-grid'
      }));
      root.appendChild(svgText(opts.formatX ? opts.formatX(value) : String(Math.round(value)), {
        x: xx, y: margin.top + plotHeight + 14, 'text-anchor': 'middle', class: 'chart-axis-label'
      }));
    }

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = (yMax / 4) * tick;
      const yy = y(value);
      root.appendChild(svg('line', {
        x1: margin.left, x2: margin.left + plotWidth, y1: yy, y2: yy, class: 'chart-grid'
      }));
      root.appendChild(svgText(opts.formatY ? opts.formatY(value) : String(Math.round(value)), {
        x: margin.left - 7, y: yy + 3, 'text-anchor': 'end', class: 'chart-axis-label'
      }));
    }

    root.appendChild(svgText(opts.xLabel || '', {
      x: margin.left + plotWidth / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-axis-title'
    }));
    root.appendChild(svgText(opts.yLabel || '', {
      x: 10,
      y: margin.top + plotHeight / 2,
      'text-anchor': 'middle',
      transform: 'rotate(-90 10 ' + (margin.top + plotHeight / 2) + ')',
      class: 'chart-axis-title'
    }));

    const showLabels = width >= 480;
    const nodes = [];
    points.forEach(function (point, index) {
      const cx = x(point.x);
      const cy = y(point.y);
      const dot = svg('circle', {
        cx: cx, cy: cy, r: 5, class: 'scatter-dot fill-series-' + (point.colorIndex || 1)
      });
      dot.addEventListener('pointerenter', function (event) {
        highlight(index);
        Tooltip.show([
          { heading: point.label },
          { label: opts.xLabel || 'Health', value: opts.formatX ? opts.formatX(point.x) : point.x },
          { label: opts.yLabel || 'Value', value: opts.formatY ? opts.formatY(point.y) : point.y }
        ], event.clientX, event.clientY);
      });
      dot.addEventListener('pointerleave', function () {
        dot.classList.remove('is-hover');
        Tooltip.hide();
      });
      root.appendChild(dot);
      if (showLabels) {
        const label = point.label.length > 15 ? point.label.slice(0, 14) + '…' : point.label;
        root.appendChild(svgText(label, { x: cx + 8, y: cy + 3, class: 'scatter-dot-label' }));
      }
      nodes.push({ node: dot, point: point, cx: cx, cy: cy });
    });

    let activeIndex = 0;
    function highlight(index) {
      activeIndex = clamp(index, 0, nodes.length - 1);
      nodes.forEach(function (item, itemIndex) {
        item.node.classList.toggle('is-hover', itemIndex === activeIndex);
      });
      return nodes[activeIndex];
    }

    function showAt(index) {
      const item = highlight(index);
      if (!item) return;
      const box = root.getBoundingClientRect();
      Tooltip.show([
        { heading: item.point.label },
        { label: opts.xLabel || 'Health', value: opts.formatX ? opts.formatX(item.point.x) : item.point.x },
        { label: opts.yLabel || 'Value', value: opts.formatY ? opts.formatY(item.point.y) : item.point.y }
      ], box.left + item.cx, box.top + item.cy);
    }

    function hide() {
      nodes.forEach(function (item) { item.node.classList.remove('is-hover'); });
      Tooltip.hide();
    }

    return {
      node: root,
      keyboard: {
        label: opts.keyboardLabel || 'Quadrant scatter. Use arrow keys to cycle clients.',
        describe: function () {
          const item = nodes[activeIndex];
          if (!item) return 'Quadrant scatter.';
          return item.point.label + ': ' +
            (opts.xLabel || 'Health') + ' ' + (opts.formatX ? opts.formatX(item.point.x) : item.point.x) + ', ' +
            (opts.yLabel || 'Value') + ' ' + (opts.formatY ? opts.formatY(item.point.y) : item.point.y) + '.';
        },
        show: function () { showAt(activeIndex); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { showAt(activeIndex + 1); return true; }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { showAt(activeIndex - 1); return true; }
          if (event.key === 'Home') { showAt(0); return true; }
          if (event.key === 'End') { showAt(nodes.length - 1); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  function treemap(nodes, width, height, options) {
    const opts = options || {};
    const root = svgRoot(width, height);
    const items = nodes.filter(function (node) { return node.value > 0; }).slice();
    if (!items.length) return root;
    const total = items.reduce(function (sum, node) { return sum + node.value; }, 0);
    items.sort(function (a, b) { return b.value - a.value; });
    const layouts = [];

    function layout(list, rect) {
      if (!list.length) return;
      if (list.length === 1) {
        layouts.push({ node: list[0], rect: rect });
        return;
      }
      const sum = list.reduce(function (acc, node) { return acc + node.value; }, 0);
      let running = 0;
      let bestIndex = 1;
      let bestDiff = Infinity;
      for (let index = 1; index < list.length; index += 1) {
        running += list[index - 1].value;
        const diff = Math.abs(sum / 2 - running);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = index;
        }
      }
      const first = list.slice(0, bestIndex);
      const second = list.slice(bestIndex);
      const firstSum = first.reduce(function (acc, node) { return acc + node.value; }, 0);
      const ratio = firstSum / sum;
      if (rect.w >= rect.h) {
        layout(first, { x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h });
        layout(second, { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h });
      } else {
        layout(first, { x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio });
        layout(second, { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) });
      }
    }

    layout(items, { x: 0, y: 0, w: width, h: height });
    const nodeMap = [];
    const labelSmall = width < 520;
    layouts.forEach(function (entry, index) {
      const rect = entry.rect;
      const x = rect.x + 1.5;
      const y = rect.y + 1.5;
      const w = Math.max(1, rect.w - 3);
      const h = Math.max(1, rect.h - 3);
      const box = svg('rect', {
        x: x, y: y, width: w, height: h, rx: 2,
        class: 'treemap-rect',
        fill: 'var(--tm-' + ((index % 6) + 1) + ')'
      });
      box.addEventListener('pointerenter', function (event) {
        highlight(index);
        Tooltip.show([
          { heading: entry.node.label },
          { label: 'Revenue', value: opts.formatValue ? opts.formatValue(entry.node.value) : String(entry.node.value) }
        ], event.clientX, event.clientY);
      });
      box.addEventListener('pointerleave', function () {
        box.classList.remove('is-hover');
        Tooltip.hide();
      });
      root.appendChild(box);
      const canLabel = w > (labelSmall ? 92 : 58) && h > 26;
      if (canLabel) {
        const maxChars = Math.max(4, Math.floor(w / 7));
        const label = entry.node.label.length > maxChars ? entry.node.label.slice(0, maxChars - 1) + '…' : entry.node.label;
        root.appendChild(svgText(label, { x: x + 7, y: y + 16, class: 'treemap-label' }));
        if (h > 38) {
          root.appendChild(svgText(opts.formatValue ? opts.formatValue(entry.node.value) : String(entry.node.value), {
            x: x + 7, y: y + 29, class: 'treemap-value'
          }));
        }
      }
      nodeMap.push({ node: box, entry: entry, x: x + w / 2, y: y + h / 2 });
    });

    let activeIndex = 0;
    function highlight(index) {
      activeIndex = clamp(index, 0, nodeMap.length - 1);
      nodeMap.forEach(function (item, itemIndex) {
        item.node.classList.toggle('is-hover', itemIndex === activeIndex);
      });
      return nodeMap[activeIndex];
    }

    function showAt(index) {
      const item = highlight(index);
      if (!item) return;
      const box = root.getBoundingClientRect();
      Tooltip.show([
        { heading: item.entry.node.label },
        { label: 'Revenue', value: opts.formatValue ? opts.formatValue(item.entry.node.value) : String(item.entry.node.value) }
      ], box.left + item.x, box.top + item.y);
    }

    function hide() {
      nodeMap.forEach(function (item) { item.node.classList.remove('is-hover'); });
      Tooltip.hide();
    }

    return {
      node: root,
      keyboard: {
        label: opts.keyboardLabel || 'Revenue treemap. Use arrow keys to cycle clients.',
        describe: function () {
          const item = nodeMap[activeIndex];
          if (!item) return 'Revenue treemap.';
          return item.entry.node.label + ': ' +
            (opts.formatValue ? opts.formatValue(item.entry.node.value) : item.entry.node.value) + '.';
        },
        show: function () { showAt(activeIndex); },
        hide: hide,
        onKey: function (event) {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { showAt(activeIndex + 1); return true; }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { showAt(activeIndex - 1); return true; }
          if (event.key === 'Home') { showAt(0); return true; }
          if (event.key === 'End') { showAt(nodeMap.length - 1); return true; }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        }
      }
    };
  }

  window.Charts = Object.freeze({
    sparkline: sparkline,
    areaLine: areaLine,
    line: line,
    bars: barsGrouped,
    barsHorizontal: barsHorizontal,
    barsGrouped: barsGrouped,
    donut: donut,
    heatmap: heatmap,
    radar: radar,
    ring: ring,
    gantt: gantt,
    allocationBars: allocationBars,
    quadrantScatter: quadrantScatter,
    treemap: treemap,
    createChart: createChart,
    mountAll: mountAll,
    tooltip: Tooltip,
    niceMax: niceMax,
    prefersReducedMotion: reducedMotion
  });
})();
