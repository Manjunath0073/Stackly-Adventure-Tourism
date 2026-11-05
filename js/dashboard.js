/* Stackly Tourism client dashboard — SPA shell, hash router, views and hand-built SVG charts. */
(function () {
  'use strict';

  const Session = window.StacklySession;
  const DATA = window.ClientData;

  if (!Session || !DATA) {
    console.error('[Stackly] Dashboard dependencies missing (session.js / client-data.js).');
    return;
  }

  const Charts = window.Charts;
  if (!Charts) {
    console.error('[Stackly] Shared charts module missing (charts.js).');
    return;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const Tooltip = Charts.tooltip;
  const createChart = Charts.createChart;
  const mountCharts = Charts.mountAll;
  const renderSparkline = Charts.sparkline;
  const renderAreaLine = Charts.areaLine;
  const renderLineChart = Charts.line;
  const renderCapacityBars = Charts.barsHorizontal;
  const renderGroupedBars = Charts.barsGrouped;
  const renderDonut = Charts.donut;
  const renderHeatmap = Charts.heatmap;
  const renderRadar = Charts.radar;
  const renderRing = Charts.ring;
  const renderGantt = Charts.gantt;
  const niceMax = Charts.niceMax;

  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1' && !Session.getSession()) {
    console.warn('[Stackly] Demo session seeded because ?demo=1 was present. All workspace data is illustrative.');
    Session.setSession({
      name: 'Demo Client',
      email: 'demo.client@stackly.example',
      company: 'Demo Workspace',
      role: 'client',
      createdAt: new Date().toISOString()
    });
  }

  let currentSession = Session.requireRole('client');
  if (!currentSession) return;

  const app = document.getElementById('app');
  const viewRoot = document.getElementById('view-root');
  const main = document.getElementById('main');
  const announcer = document.getElementById('route-announcer');
  const toastNode = document.getElementById('toast');
  const searchInput = document.getElementById('workspace-search');
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = Boolean(motionQuery && motionQuery.matches);
  const PREFS_KEY = 'zstackly.client.prefs.v1';
  const NAV_SHORTCUT = '/';
  let toastTimer = 0;
  let activeView = null;
  let activeRoute = 'overview';
  let drawerOpen = false;
  let detailCloseHandler = null;

  const appState = {
    searchQuery: '',
    notifications: clone(DATA.notifications),
    threads: clone(DATA.threads),
    selectedThreadId: DATA.threads.length ? DATA.threads[0].id : null,
    prefs: loadPrefs()
  };

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function attrs(node, map) {
    Object.keys(map).forEach(function (key) {
      if (map[key] === null || map[key] === undefined || map[key] === false) return;
      node.setAttribute(key, String(map[key]));
    });
    return node;
  }

  function append(parent) {
    for (let index = 1; index < arguments.length; index += 1) {
      const child = arguments[index];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        child.forEach(function (item) { if (item !== null && item !== undefined) parent.appendChild(item); });
      } else {
        parent.appendChild(child);
      }
    }
    return parent;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function localISODate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseDate(iso) {
    if (!iso) return null;
    const date = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(iso, style) {
    const date = parseDate(iso);
    if (!date) return '—';
    const options = style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }

  function formatDayMonth(iso) {
    const date = parseDate(iso);
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
  }

  function formatTime(iso) {
    const date = parseDate(iso);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function formatMonthShort(iso) {
    const date = parseDate(iso);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const base = new Date(DATA.meta.now);
    const minutes = Math.max(0, Math.round((base.getTime() - date.getTime()) / 60000));
    if (minutes < 2) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.round(hours / 24);
    if (days < 7) return days + 'd ago';
    return formatDayMonth(iso);
  }

  function threadTime(iso) {
    const date = parseDate(iso);
    if (!date) return '';
    const today = DATA.meta.today;
    if (iso.slice(0, 10) === today) return formatTime(iso);
    const yesterday = new Date(DATA.meta.now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (iso.slice(0, 10) === localISODate(yesterday)) return 'Yesterday';
    return formatDayMonth(iso);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-GB').format(value);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function firstName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return 'there';
    return trimmed.split(/\s+/)[0];
  }

  function initialsFor(name, email) {
    return Session.initials(name, email);
  }

  function avatarEl(name, email, className) {
    const node = el('span', 'avatar' + (className ? ' ' + className : ''), initialsFor(name, email));
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('--avatar-bg', Session.avatarColor(name, email));
    return node;
  }

  function setAvatar(node, name, email) {
    if (!node) return;
    node.textContent = initialsFor(name, email);
    node.style.setProperty('--avatar-bg', Session.avatarColor(name, email));
  }

  function statusMeta(status) {
    const map = {
      'on-track': { label: 'On track' },
      'at-risk': { label: 'At risk' },
      blocked: { label: 'Blocked' },
      complete: { label: 'Complete' },
      draft: { label: 'Draft' }
    };
    return map[status] || { label: 'Unknown' };
  }

  function statusChip(status, label) {
    const meta = statusMeta(status);
    const chip = el('span', 'status-chip', null);
    chip.setAttribute('data-status', status);
    append(chip, el('span', 'status-chip__dot'), el('span', null, label || meta.label));
    return chip;
  }

  function docStatusChip(status) {
    const map = {
      Approved: 'complete',
      'In review': 'at-risk',
      Draft: 'draft'
    };
    return statusChip(map[status] || 'draft', status);
  }

  function progressBar(value, status) {
    const wrapper = el('div', 'progress');
    const track = el('div', 'progress__track');
    const fill = el('div', 'progress__fill');
    fill.style.width = clamp(value, 0, 100) + '%';
    fill.setAttribute('data-status', status || 'on-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(value));
    track.setAttribute('aria-label', value + ' percent complete');
    append(track, fill);
    const text = el('span', 'progress__value', value + '%');
    append(wrapper, track, text);
    return wrapper;
  }

  function makeButton(label, className, onClick) {
    const button = el('button', className || 'btn btn--secondary', label);
    button.type = 'button';
    if (onClick) button.addEventListener('click', onClick);
    return button;
  }

  function iconSvg(name) {
    const paths = ICONS[name] || ICONS.dot;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }

  function emptyState(options) {
    const wrapper = el('div', 'empty-state');
    const icon = el('span', 'empty-state__icon');
    icon.appendChild(iconSvg(options.icon || 'search'));
    append(wrapper, icon, el('h3', null, options.title || 'Nothing here yet'), el('p', null, options.text || ''));
    if (options.actionLabel) {
      const button = makeButton(options.actionLabel, 'btn btn--secondary btn--sm', options.onAction);
      wrapper.appendChild(button);
    }
    return wrapper;
  }

  function createScope() {
    const cleanups = [];
    let destroyed = false;
    return {
      on: function (target, type, handler, options) {
        if (!target) return;
        target.addEventListener(type, handler, options);
        cleanups.push(function () { target.removeEventListener(type, handler, options); });
      },
      timeout: function (fn, delay) {
        let id = 0;
        id = window.setTimeout(function () {
          if (!destroyed) fn();
        }, delay);
        cleanups.push(function () { window.clearTimeout(id); });
        return id;
      },
      interval: function (fn, delay) {
        const id = window.setInterval(function () {
          if (destroyed) return;
          fn();
        }, delay);
        cleanups.push(function () { window.clearInterval(id); });
        return id;
      },
      add: function (fn) {
        if (typeof fn === 'function') cleanups.push(fn);
      },
      defer: function (fn) {
        let inner = 0;
        const outer = window.requestAnimationFrame(function () {
          inner = window.requestAnimationFrame(function () {
            if (!destroyed) fn();
          });
          cleanups.push(function () { window.cancelAnimationFrame(inner); });
        });
        cleanups.push(function () { window.cancelAnimationFrame(outer); });
      },
      isDestroyed: function () { return destroyed; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        cleanups.splice(0).forEach(function (cleanup) {
          try { cleanup(); } catch (error) { /* cleanup must never break navigation */ }
        });
        Tooltip.hide();
      }
    };
  }

  function announce(message) {
    if (!announcer) return;
    announcer.textContent = '';
    window.setTimeout(function () { announcer.textContent = message; }, 30);
  }

  function showToast(message) {
    if (!toastNode) return;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastNode.textContent = message;
    toastNode.hidden = false;
    toastTimer = window.setTimeout(function () {
      toastNode.hidden = true;
      toastTimer = 0;
    }, 3200);
  }

  function readJSON(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* Storage can be unavailable. */
    }
  }

  function loadPrefs() {
    const defaults = {
      timezone: DATA.preferences.timezone,
      weeklyDigest: DATA.preferences.weeklyDigest,
      emailNotifications: DATA.preferences.emailNotifications,
      compact: DATA.preferences.compact
    };
    const saved = readJSON(PREFS_KEY);
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      timezone: typeof saved.timezone === 'string' ? saved.timezone : defaults.timezone,
      weeklyDigest: typeof saved.weeklyDigest === 'boolean' ? saved.weeklyDigest : defaults.weeklyDigest,
      emailNotifications: typeof saved.emailNotifications === 'boolean' ? saved.emailNotifications : defaults.emailNotifications,
      compact: typeof saved.compact === 'boolean' ? saved.compact : defaults.compact
    };
  }

  function savePrefs() {
    writeJSON(PREFS_KEY, appState.prefs);
  }

  function applyDensity() {
    if (!app) return;
    app.setAttribute('data-density', appState.prefs.compact ? 'compact' : 'comfortable');
  }

  function isDemoSession(session) {
    return Boolean(session && /^demo[._-]/i.test(session.email));
  }

  const ICONS = {
    dot: '<circle cx="10" cy="10" r="2"/>',
    compass: '<circle cx="10" cy="10" r="7.5"/><path d="m13 7-2 4-4 2 2-4z"/>',
    search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
    calendar: '<rect x="2.5" y="4.5" width="15" height="12"/><path d="M2.5 8.5h15M6 2.5v4M14 2.5v4M6 12h3M11 12h3"/>',
    file: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M12 2.5v3h3M7.5 9h5M7.5 12h5M7.5 15h3"/>',
    flag: '<path d="M5 17V3.5c3-1.5 6 1.5 10 0V12c-4 1.5-7-1.5-10 0"/>',
    alert: '<path d="M10 3 18 17H2z"/><path d="M10 8v4M10 14.5v.1"/>',
    chat: '<path d="M3 4.5h14v9H9l-4 3v-3H3z"/><path d="M6 8h8M6 10.5h5"/>',
    route: '<circle cx="4.5" cy="15.5" r="2"/><circle cx="15.5" cy="4.5" r="2"/><path d="M6 14c2.5-1.5 1.5-4 4-5.5S14 8 14 6"/>',
    check: '<path d="m4 10.5 4 4 8-9"/>',
    complete: '<circle cx="10" cy="10" r="7.5"/><path d="m6.5 10 2.5 2.5 4.5-5"/>',
    clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/>',
    download: '<path d="M10 2.5v10M6 9l4 4 4-4M3.5 16.5h13"/>',
    upload: '<path d="M10 13.5v-10M6 7l4-4 4 4M3.5 16.5h13"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>',
    send: '<path d="M3 10 17.5 3l-4 14.5-2.8-5.7z"/><path d="m10.7 11.8 6.8-8.8"/>',
    arrowRight: '<path d="M3 10h14M12 5l5 5-5 5"/>',
    arrowLeft: '<path d="M17 10H3M8 5l-5 5 5 5"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
    trash: '<path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5M11.5 8.5v5"/>',
    user: '<circle cx="10" cy="7" r="3"/><path d="M4 17c.7-3.1 3-4.5 6-4.5s5.3 1.4 6 4.5"/>',
    table: '<rect x="2.5" y="3.5" width="15" height="13"/><path d="M2.5 8h15M8 8v8.5M2.5 12.5h15"/>',
    filter: '<path d="M3 4h14l-5.5 6v5.5l-3 1V10z"/>',
    plus: '<path d="M10 3v14M3 10h14"/>',
    mountain: '<path d="m2 16 6-10 3.5 5.5L14 8l4 8z"/>',
    spark: '<path d="m10 2 1.6 5.4L17 9l-5.4 1.6L10 16l-1.6-5.4L3 9l5.4-1.6z"/>'
  };

  /* ------------------------------------------------------------------ *
   * Shell — user chrome, navigation badges, notifications, menus
   * ------------------------------------------------------------------ */

  const notifToggle = document.querySelector('[data-notif-toggle]');
  const notifPanel = document.getElementById('notification-panel');
  const notifList = document.querySelector('[data-notification-list]');
  const notifEmpty = document.querySelector('[data-notif-empty]');
  const notifBadge = document.querySelector('[data-notif-badge]');
  const notifCount = document.querySelector('[data-notif-count]');
  const userMenuToggle = document.querySelector('[data-user-menu-toggle]');
  const userMenu = document.getElementById('user-menu');
  const userMenuAvatar = document.querySelector('[data-menu-avatar]');
  const userMenuName = document.querySelector('[data-menu-name]');
  const userMenuEmail = document.querySelector('[data-menu-email]');
  const demoFlag = document.querySelector('[data-demo-flag]');
  const drawerOpenButton = document.querySelector('[data-drawer-open]');
  const drawerCloseButton = document.querySelector('[data-drawer-close]');
  const drawerBackdrop = document.querySelector('[data-drawer-backdrop]');
  const signOutButton = document.querySelector('[data-signout]');
  const skipLink = document.querySelector('.skip-link');
  let drawerTrigger = null;

  function refreshUserChrome() {
    const name = currentSession.name;
    const email = currentSession.email;
    const company = currentSession.company;

    document.querySelectorAll('[data-user-name]').forEach(function (node) { node.textContent = name; });
    document.querySelectorAll('[data-user-company]').forEach(function (node) { node.textContent = company; });
    document.querySelectorAll('[data-user-avatar], [data-topbar-avatar]').forEach(function (node) {
      setAvatar(node, name, email);
    });
    if (userMenuAvatar) setAvatar(userMenuAvatar, name, email);
    if (userMenuName) userMenuName.textContent = name;
    if (userMenuEmail) userMenuEmail.textContent = email;
    document.querySelectorAll('[data-user-link]').forEach(function (node) {
      node.setAttribute('aria-label', 'Open account settings for ' + name);
    });
    if (userMenuToggle) userMenuToggle.setAttribute('aria-label', 'Open account menu for ' + name);
    if (demoFlag) demoFlag.hidden = !isDemoSession(currentSession);
  }

  function unreadCount() {
    return appState.threads.reduce(function (total, thread) {
      return total + (thread.unread ? 1 : 0);
    }, 0);
  }

  function setBadge(name, count) {
    const badge = document.querySelector('[data-nav-badge="' + name + '"]');
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function updateNavAria() {
    document.querySelectorAll('.side-link[data-route]').forEach(function (link) {
      const name = link.getAttribute('data-route');
      const base = link.getAttribute('data-tip') || name;
      let label = base;
      if (name === 'messages') {
        const count = unreadCount();
        label = count ? 'Messages, ' + count + ' unread' : 'Messages';
      } else if (name === 'documents') {
        const review = DATA.documents.filter(function (doc) { return doc.status === 'In review'; }).length;
        label = review ? 'Documents, ' + review + ' in review' : 'Documents';
      } else if (name === 'journeys') {
        label = 'Journeys, ' + DATA.journeys.length + ' total';
      }
      link.setAttribute('aria-label', label);
    });
  }

  function updateNavBadges() {
    setBadge('journeys', DATA.journeys.length);
    setBadge('documents', DATA.documents.filter(function (doc) { return doc.status === 'In review'; }).length);
    setBadge('messages', unreadCount());
    updateNavAria();
  }

  function renderNotifications() {
    if (!notifList) return;
    clear(notifList);
    const notes = appState.notifications;
    if (notifEmpty) notifEmpty.hidden = notes.length !== 0;
    if (notifBadge) {
      notifBadge.hidden = notes.length === 0;
      notifBadge.textContent = notes.length ? String(notes.length) : '';
    }
    if (notifCount) notifCount.textContent = notes.length ? notes.length + ' new' : 'All read';
    if (notifToggle) {
      notifToggle.setAttribute('aria-label', notes.length ? 'Notifications, ' + notes.length + ' unread' : 'Notifications, none unread');
    }

    notes.forEach(function (note) {
      const item = el('div', 'notification');
      const link = el('a', 'notification__main');
      link.href = note.route;
      const dot = el('span', 'notification__dot');
      dot.setAttribute('aria-hidden', 'true');
      const copy = el('span', 'notification__copy');
      append(copy,
        el('span', 'notification__title', note.title),
        el('span', 'notification__body', note.body),
        el('span', 'notification__time', relativeTime(note.at))
      );
      append(link, dot, copy);
      link.addEventListener('click', function () { closePopovers(false); });

      const dismiss = el('button', 'notification__dismiss', '×');
      dismiss.type = 'button';
      dismiss.setAttribute('aria-label', 'Dismiss notification: ' + note.title);
      dismiss.addEventListener('click', function () {
        appState.notifications = appState.notifications.filter(function (candidate) {
          return candidate.id !== note.id;
        });
        renderNotifications();
        announce('Notification dismissed.');
        if (notifToggle) notifToggle.focus();
      });

      append(item, link, dismiss);
      notifList.appendChild(item);
    });
  }

  let openPopoverName = '';

  function closePopovers(returnFocus) {
    const trigger = openPopoverName === 'notifications' ? notifToggle : userMenuToggle;
    if (notifPanel) notifPanel.hidden = true;
    if (userMenu) userMenu.hidden = true;
    if (notifToggle) notifToggle.setAttribute('aria-expanded', 'false');
    if (userMenuToggle) userMenuToggle.setAttribute('aria-expanded', 'false');
    openPopoverName = '';
    if (returnFocus && trigger) trigger.focus();
  }

  function togglePopover(name) {
    const isOpen = openPopoverName === name;
    closePopovers(false);
    if (isOpen) return;
    openPopoverName = name;
    if (name === 'notifications') {
      if (notifPanel) notifPanel.hidden = false;
      if (notifToggle) notifToggle.setAttribute('aria-expanded', 'true');
    } else {
      if (userMenu) userMenu.hidden = false;
      if (userMenuToggle) userMenuToggle.setAttribute('aria-expanded', 'true');
    }
  }

  if (notifToggle) {
    notifToggle.addEventListener('click', function () { togglePopover('notifications'); });
  }
  if (userMenuToggle) {
    userMenuToggle.addEventListener('click', function () { togglePopover('account'); });
  }
  if (userMenu) {
    userMenu.addEventListener('click', function (event) {
      if (event.target.closest('a, button')) closePopovers(false);
    });
  }
  if (signOutButton) {
    signOutButton.addEventListener('click', function () {
      Session.clearSession();
      window.location.href = '/login.html';
    });
  }

  document.addEventListener('pointerdown', function (event) {
    if (!openPopoverName) return;
    if (event.target.closest('.popover-anchor')) return;
    closePopovers(false);
  });

  function setDrawer(open, returnFocus) {
    if (!app) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (open && !isMobile) return;
    if (open && !drawerOpen) drawerTrigger = drawerOpenButton || document.activeElement;
    drawerOpen = open;
    app.classList.toggle('is-drawer-open', open);
    document.body.classList.toggle('drawer-open', open);
    if (drawerOpenButton) drawerOpenButton.setAttribute('aria-expanded', String(open));
    if (open) {
      closePopovers(false);
      const target = drawerCloseButton || document.querySelector('.side-link');
      if (target) target.focus();
    } else if (returnFocus && drawerTrigger && document.contains(drawerTrigger)) {
      drawerTrigger.focus();
      drawerTrigger = null;
    }
  }

  if (drawerOpenButton) {
    drawerOpenButton.addEventListener('click', function () {
      setDrawer(drawerOpenButton.getAttribute('aria-expanded') !== 'true', true);
    });
  }
  if (drawerCloseButton) {
    drawerCloseButton.addEventListener('click', function () { setDrawer(false, true); });
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', function () { setDrawer(false, true); });
  }
  document.querySelectorAll('.side-link').forEach(function (link) {
    link.addEventListener('click', function () {
      if (drawerOpen) setDrawer(false, false);
    });
  });

  function trapDrawerFocus(event) {
    if (!drawerOpen || event.key !== 'Tab') return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const focusables = Array.from(sidebar.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (node) { return node.getClientRects().length > 0; });
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const mobileQuery = window.matchMedia('(max-width: 900px)');
  function handleMobileChange(event) {
    if (!event.matches && drawerOpen) setDrawer(false, false);
  }
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleMobileChange);
  else if (mobileQuery.addListener) mobileQuery.addListener(handleMobileChange);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (detailCloseHandler) {
        detailCloseHandler(true);
        return;
      }
      if (openPopoverName) {
        closePopovers(true);
        return;
      }
      if (drawerOpen) {
        setDrawer(false, true);
        return;
      }
    }

    trapDrawerFocus(event);

    if (event.key === NAV_SHORTCUT && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (!typing && searchInput) {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  if (skipLink) {
    skipLink.addEventListener('click', function (event) {
      event.preventDefault();
      main.focus();
      main.scrollTop = 0;
      announce('Main content.');
    });
  }

  function setSearchValue(value) {
    appState.searchQuery = value;
    if (searchInput && searchInput.value !== value) searchInput.value = value;
    if (activeView && activeView.setQuery) activeView.setQuery(value);
  }

  function clearSearch() {
    setSearchValue('');
    if (searchInput) searchInput.focus();
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      setSearchValue(searchInput.value);
    });
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && searchInput.value) {
        event.stopPropagation();
        setSearchValue('');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Router
   * ------------------------------------------------------------------ */

  const ROUTES = {
    overview: {
      title: 'Overview',
      search: 'Search journeys, documents, messages',
      render: renderOverview
    },
    journeys: {
      title: 'Journeys',
      search: 'Search journeys…',
      render: renderJourneys
    },
    planning: {
      title: 'Planning',
      search: 'Search this workspace',
      render: renderPlanning
    },
    reports: {
      title: 'Reports',
      search: 'Search this workspace',
      render: renderReports
    },
    documents: {
      title: 'Documents',
      search: 'Search documents…',
      render: renderDocuments
    },
    messages: {
      title: 'Messages',
      search: 'Search messages…',
      render: renderMessages
    },
    settings: {
      title: 'Settings',
      search: 'Search this workspace',
      render: renderSettings
    }
  };

  function routeNameFromHash() {
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim().toLowerCase();
    return raw || 'overview';
  }

  function setNavState(name) {
    document.querySelectorAll('.side-link[data-route]').forEach(function (link) {
      if (link.getAttribute('data-route') === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderNotFound() {
    const wrapper = el('div', 'view view--not-found');
    const head = el('div', 'view__head');
    const copy = el('div');
    append(copy,
      el('p', 'view__eyebrow', 'Workspace / Not found'),
      attrs(el('h1', 'view__title', 'This view doesn’t exist.'), { tabindex: '-1' }),
      el('p', 'view__sub', 'The address may be out of date. Return to the overview to keep working.')
    );
    append(head, copy);
    wrapper.appendChild(head);
    wrapper.appendChild(emptyState({
      icon: 'compass',
      title: 'Nothing at this address',
      text: 'Check the link, or use the workspace navigation to choose a view.',
      actionLabel: 'Go to overview',
      onAction: function () { window.location.hash = '#/overview'; }
    }));
    return wrapper;
  }

  function destroyActiveView() {
    if (activeView && activeView.destroy) activeView.destroy();
    activeView = null;
    if (detailCloseHandler) {
      detailCloseHandler();
      detailCloseHandler = null;
    }
  }

  function renderRoute(announceRoute) {
    const name = routeNameFromHash();
    const route = ROUTES[name];
    const isKnown = Boolean(route);
    closePopovers(false);
    if (drawerOpen) setDrawer(false, false);
    destroyActiveView();
    clear(viewRoot);

    if (isKnown) {
      setSearchValue('');
      if (searchInput) searchInput.placeholder = route.search;
      let result;
      try {
        result = route.render(DATA, currentSession, {
          clearSearch: clearSearch,
          setSearch: setSearchValue
        });
      } catch (error) {
        console.error('[Stackly] View failed to render.', error);
        result = { node: renderNotFound() };
      }
      activeView = result;
      viewRoot.appendChild(result.node);
      activeRoute = name;
      setNavState(name);
      document.title = route.title + ' — Stackly Tourism Client';
      const title = document.querySelector('[data-view-title]');
      if (title) title.textContent = route.title;
    } else {
      setSearchValue('');
      if (searchInput) searchInput.placeholder = 'Search this workspace';
      const node = renderNotFound();
      viewRoot.appendChild(node);
      activeView = { node: node, destroy: null };
      activeRoute = 'not-found';
      setNavState('');
      document.title = 'View not found — Stackly Tourism Client';
      const title = document.querySelector('[data-view-title]');
      if (title) title.textContent = 'Not found';
    }

    if (app) app.hidden = false;

    const heading = viewRoot.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      try { heading.focus({ preventScroll: true }); } catch (error) { heading.focus(); }
    }
    main.scrollTop = 0;
    if (announceRoute) {
      const titleText = document.title.replace(' — Stackly Tourism Client', '');
      announce(titleText + ' view loaded.');
    }
  }

  window.addEventListener('hashchange', function () {
    renderRoute(true);
  });

  /* ------------------------------------------------------------------ *
   * Boot shell
   * ------------------------------------------------------------------ */

  applyDensity();
  refreshUserChrome();
  updateNavBadges();
  renderNotifications();

  if (!window.location.hash) {
    try {
      window.history.replaceState(null, '', '#/overview');
    } catch (error) {
      window.location.hash = '#/overview';
    }
  }

  /* ------------------------------------------------------------------ *
   * View: Overview
   * ------------------------------------------------------------------ */

  function daysUntil(iso) {
    const target = parseDate(iso);
    const today = parseDate(DATA.meta.today);
    if (!target || !today) return 0;
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  function renderOverview(data, session) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--overview');

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Field planning')
    );
    const title = el('h1', 'view__title', 'Good morning, ' + firstName(session.name) + '.');
    const today = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
    const dateRow = el('div', 'greeting-date');
    const calIcon = iconSvg('calendar');
    calIcon.setAttribute('class', 'greeting-date__icon');
    append(dateRow, calIcon, el('span', null, today), el('span', null, '·'), el('span', null, 'Your journeys at a glance'));
    append(copy, eyebrow, title, dateRow);
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', 'Client'),
      isDemoSession(session) ? el('span', 'status-pill', 'Demo session') : null,
      el('span', 'status-pill', 'Field plan')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const kpiGrid = el('section', 'kpi-grid');
    kpiGrid.setAttribute('aria-label', 'Workspace summary');
    data.kpis.forEach(function (kpi, index) {
      const card = el('article', 'panel kpi');
      const top = el('div', 'kpi__top');
      append(top,
        el('span', 'kpi__label', kpi.label),
        el('span', 'kpi__delta', kpi.delta + ' ' + kpi.note)
      );
      top.lastChild.setAttribute('data-tone', kpi.deltaTone);
      const value = el('div', 'kpi__value', formatNumber(kpi.value));
      if (kpi.unit) {
        const unit = el('span', 'kpi__unit', kpi.unit);
        value.appendChild(unit);
      }
      const chartHost = el('div', 'kpi__spark');
      const spark = createChart({
        className: 'chart--micro',
        height: 42,
        label: kpi.label + ' trend over the last 12 weeks. Latest value ' + kpi.value + (kpi.unit || '') + '.',
        render: function (width, context) {
          return {
            node: renderSparkline(kpi.series, width, context.height, {
              series: (index % 3) + 1,
              color: 'chart-' + ((index % 3) + 1),
              lastDot: true,
              animate: context.animate
            })
          };
        },
        table: {
          caption: kpi.label + ' — 12 week trend',
          columns: ['Week starting', 'Value'],
          rows: kpi.weekLabels.map(function (label, weekIndex) {
            return [formatDayMonth(label), kpi.series[weekIndex] + (kpi.unit || '')];
          })
        }
      });
      chartHost.appendChild(spark.figure);
      charts.push(spark);
      append(card, top, value, chartHost);
      kpiGrid.appendChild(card);
    });
    view.appendChild(kpiGrid);

    const overviewGrid = el('div', 'overview-grid');

    const progressPanel = el('section', 'panel');
    const progressHead = el('div', 'panel__head');
    const progressCopy = el('div');
    append(progressCopy,
      el('h2', 'panel__title', 'Journey progress — last 12 weeks'),
      el('p', 'panel__sub', 'Portfolio completion across active and completed journeys')
    );
    const rangeSwitch = el('div', 'range-switch');
    rangeSwitch.setAttribute('role', 'group');
    rangeSwitch.setAttribute('aria-label', 'Progress chart range');
    const ranges = [
      { key: '7d', label: '7d' },
      { key: '30d', label: '30d' },
      { key: '90d', label: '90d' }
    ];
    const rangeButtons = {};
    ranges.forEach(function (range) {
      const button = el('button', null, range.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(range.key === '90d'));
      button.addEventListener('click', function () {
        setRange(range.key);
      });
      rangeButtons[range.key] = button;
      rangeSwitch.appendChild(button);
    });
    append(progressHead, progressCopy, rangeSwitch);
    const progressBody = el('div', 'panel__body chart-panel__body');

    function rangeData(range) {
      const slice = range === '7d' ? 7 : (range === '30d' ? 30 : 90);
      const points = data.overview.dailyProgress.slice(-slice);
      return {
        points: points,
        values: points.map(function (point) { return point.value; }),
        labels: points.map(function (point) { return formatDayMonth(point.date); })
      };
    }

    function areaSpec(range) {
      const series = rangeData(range);
      const rangeLabel = range === '7d' ? 'the last 7 days' : (range === '30d' ? 'the last 30 days' : 'the last 90 days');
      return {
        className: '',
        height: 252,
        label: 'Journey progress over ' + rangeLabel + ', from ' + series.values[0] + ' percent to ' + series.values[series.values.length - 1] + ' percent.',
        render: function (width, context) {
          return renderAreaLine(series.values, series.labels, width, context.height, {
            animate: context.animate,
            suffix: '%',
            max: 100,
            tooltipHeading: 'Journey progress',
            keyboardLabel: 'Journey progress line chart. Use the left and right arrow keys to inspect dates.'
          });
        },
        table: {
          caption: 'Journey progress — ' + rangeLabel,
          columns: ['Date', 'Progress'],
          rows: series.points.map(function (point) {
            return [formatDate(point.date), point.value + '%'];
          })
        }
      };
    }

    const areaChart = createChart(areaSpec('90d'));
    progressBody.appendChild(areaChart.figure);
    charts.push(areaChart);
    append(progressPanel, progressHead, progressBody);

    function setRange(range) {
      Object.keys(rangeButtons).forEach(function (key) {
        rangeButtons[key].setAttribute('aria-pressed', String(key === range));
      });
      areaChart.update(areaSpec(range));
      const series = rangeData(range);
      announce('Progress range changed to ' + range + '. Latest value ' + series.values[series.values.length - 1] + ' percent.');
    }

    const donutPanel = el('section', 'panel');
    const donutHead = el('div', 'panel__head');
    const donutCopy = el('div');
    append(donutCopy,
      el('h2', 'panel__title', 'Journey status split'),
      el('p', 'panel__sub', 'All journeys in the client portfolio')
    );
    donutHead.appendChild(donutCopy);
    const donutBody = el('div', 'panel__body');
    const statusOrder = ['on-track', 'at-risk', 'blocked', 'complete'];
    const statusLabels = { 'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked', complete: 'Complete' };
    const statusColors = { 'on-track': 'var(--chart-2)', 'at-risk': 'var(--chart-1)', blocked: 'var(--chart-4)', complete: 'var(--chart-5)' };
    const segments = statusOrder.map(function (key) {
      return {
        key: key,
        label: statusLabels[key],
        value: data.journeys.filter(function (journey) { return journey.status === key; }).length
      };
    });
    const totalJourneys = data.journeys.length;
    const donutLayout = el('div', 'donut-layout');
    const donutChart = createChart({
      height: 176,
      label: 'Journey status split. ' + segments.map(function (segment) {
        return segment.value + ' ' + segment.label.toLowerCase();
      }).join(', ') + '. Total ' + totalJourneys + ' journeys.',
      render: function (width, context) {
        return {
          node: renderDonut(segments, width, context.height, {
            centerValue: totalJourneys,
            centerLabel: 'journeys',
            animate: context.animate
          })
        };
      },
      table: {
        caption: 'Journey status split',
        columns: ['Status', 'Journeys', 'Share'],
        rows: segments.map(function (segment) {
          return [segment.label, segment.value, Math.round((segment.value / totalJourneys) * 100) + '%'];
        }).concat([['Total', totalJourneys, '100%']])
      }
    });
    donutLayout.appendChild(donutChart.figure);
    charts.push(donutChart);

    const donutLegend = el('div', 'donut-legend');
    function setDonutHighlight(key) {
      const chartNode = donutChart.figure;
      chartNode.querySelectorAll('.donut__seg').forEach(function (segment) {
        segment.classList.toggle('is-muted', key ? segment.getAttribute('data-segment') !== key : false);
      });
      donutLegend.querySelectorAll('.legend__item').forEach(function (item) {
        item.classList.toggle('is-active', key ? item.getAttribute('data-status') === key : false);
      });
    }
    segments.forEach(function (segment) {
      const item = el('button', 'legend__item');
      item.type = 'button';
      item.setAttribute('data-status', segment.key);
      item.setAttribute('aria-label', 'Highlight ' + segment.label + ': ' + segment.value + ' journeys, ' +
        Math.round((segment.value / totalJourneys) * 100) + ' percent.');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', statusColors[segment.key]);
      append(item, swatch, el('span', null, segment.label), el('span', 'legend__value', segment.value));
      item.addEventListener('mouseenter', function () { setDonutHighlight(segment.key); });
      item.addEventListener('mouseleave', function () { setDonutHighlight(''); });
      item.addEventListener('focus', function () { setDonutHighlight(segment.key); });
      item.addEventListener('blur', function () { setDonutHighlight(''); });
      donutLegend.appendChild(item);
    });
    donutLayout.appendChild(donutLegend);
    donutBody.appendChild(donutLayout);
    append(donutPanel, donutHead, donutBody);

    append(overviewGrid, progressPanel, donutPanel);
    view.appendChild(overviewGrid);

    const lower = el('div', 'overview-lower');
    const next = data.milestones[0];
    const milestoneCard = el('section', 'panel milestone-card');
    milestoneCard.setAttribute('aria-labelledby', 'next-milestone-title');
    const dueDays = daysUntil(next.due);
    append(milestoneCard,
      el('p', 'milestone-card__date', 'Next milestone · ' + formatDate(next.due)),
      el('h2', 'milestone-card__title', next.name),
      el('p', 'milestone-card__journey', next.journey + ' · ' + next.owner),
      el('p', 'milestone-card__detail', next.detail)
    );
    milestoneCard.querySelector('.milestone-card__title').id = 'next-milestone-title';
    const milestoneFoot = el('div', 'milestone-card__foot');
    append(milestoneFoot,
      el('span', 'status-pill', dueDays >= 0 ? dueDays + ' days remaining' : 'Overdue'),
      statusChip(next.status)
    );
    const planLink = el('a', 'inline-link', 'Review the plan');
    planLink.href = '#/planning';
    milestoneFoot.appendChild(planLink);
    milestoneCard.appendChild(milestoneFoot);

    const activityPanel = el('section', 'panel');
    const activityHead = el('div', 'panel__head');
    const activityCopy = el('div');
    append(activityCopy,
      el('h2', 'panel__title', 'Recent activity'),
      el('p', 'panel__sub', 'Six changes across journeys, documents and messages')
    );
    activityHead.appendChild(activityCopy);
    const activityBody = el('div', 'panel__body');
    const activityList = el('ol', 'activity-list');
    const activityIcons = {
      milestone: 'flag',
      document: 'file',
      risk: 'alert',
      message: 'chat',
      stage: 'route',
      complete: 'complete'
    };
    data.activity.forEach(function (item) {
      const row = el('li', 'activity-item');
      row.setAttribute('data-type', item.type);
      const icon = el('span', 'activity-item__icon');
      icon.appendChild(iconSvg(activityIcons[item.type] || 'dot'));
      const text = el('span', 'activity-item__text', item.text);
      const time = el('time', 'activity-item__time', relativeTime(item.at));
      time.dateTime = item.at;
      time.title = formatDate(item.at, 'long') + ' at ' + formatTime(item.at);
      append(row, icon, text, time);
      activityList.appendChild(row);
    });
    activityBody.appendChild(activityList);
    append(activityPanel, activityHead, activityBody);

    append(lower, milestoneCard, activityPanel);
    view.appendChild(lower);

    mountCharts(scope, charts);

    return {
      node: view,
      setQuery: null,
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Journeys
   * ------------------------------------------------------------------ */

  function closeJourneyDrawer(returnFocus) {
    if (!detailCloseHandler) return;
    const handler = detailCloseHandler;
    detailCloseHandler = null;
    handler(returnFocus);
  }

  function renderJourneys(data, session, context) {
    const scope = createScope();
    const view = el('div', 'view view--journeys');

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Portfolio')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Journeys'),
      el('p', 'view__sub', 'Every journey in one place. Filter by status, open a journey to see its stage breakdown, current checklist and progress history.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill', data.journeys.length + ' journeys'),
      el('span', 'status-pill status-pill--accent', 'Field plan')
    );
    append(head, copy, meta);
    view.appendChild(head);

    let statusFilter = 'all';
    let sortKey = 'progress';
    let sortDir = -1;
    let query = '';

    const toolbar = el('div', 'view-toolbar');
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter journeys by status');
    const chipOptions = [{ key: 'all', label: 'All' }].concat(['on-track', 'at-risk', 'blocked', 'complete'].map(function (status) {
      return { key: status, label: statusMeta(status).label };
    }));
    const chipButtons = {};
    chipOptions.forEach(function (option) {
      const count = option.key === 'all'
        ? data.journeys.length
        : data.journeys.filter(function (journey) { return journey.status === option.key; }).length;
      const button = el('button', 'filter-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(option.key === 'all'));
      append(button, el('span', null, option.label), el('span', 'filter-chip__count', count));
      button.addEventListener('click', function () {
        statusFilter = option.key;
        Object.keys(chipButtons).forEach(function (key) {
          chipButtons[key].setAttribute('aria-pressed', String(key === statusFilter));
        });
        renderRows();
      });
      chipButtons[option.key] = button;
      chips.appendChild(button);
    });

    const listCount = el('p', 'toolbar-note');
    listCount.setAttribute('aria-live', 'polite');
    append(toolbar, chips, listCount);
    view.appendChild(toolbar);

    const tablePanel = el('div', 'data-panel');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    const thJourney = el('th', null, 'Journey');
    thJourney.scope = 'col';
    const thStage = el('th', null, 'Stage');
    thStage.scope = 'col';
    const thOwner = el('th', null, 'Owner');
    thOwner.scope = 'col';
    const thProgress = el('th');
    thProgress.scope = 'col';
    const thDate = el('th');
    thDate.scope = 'col';
    const thStatus = el('th', null, 'Status');
    thStatus.scope = 'col';

    function sortButton(key, label) {
      const button = el('button', 'sort-button');
      button.type = 'button';
      append(button, el('span', null, label), el('span', 'sort-arrow', key === 'progress' ? '→' : '→'));
      button.setAttribute('aria-label', 'Sort by ' + label);
      button.addEventListener('click', function () {
        if (sortKey === key) sortDir *= -1;
        else {
          sortKey = key;
          sortDir = key === 'progress' ? -1 : 1;
        }
        updateSortHeaders();
        renderRows();
      });
      return button;
    }

    thProgress.appendChild(sortButton('progress', 'Progress'));
    thDate.appendChild(sortButton('date', 'Next date'));
    append(headRow, thJourney, thStage, thOwner, thProgress, thDate, thStatus);
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    table.appendChild(tbody);
    tablePanel.appendChild(table);
    view.appendChild(tablePanel);

    const emptyHost = el('div');
    emptyHost.hidden = true;
    view.appendChild(emptyHost);

    function updateSortHeaders() {
      thProgress.setAttribute('aria-sort', sortKey === 'progress' ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
      thDate.setAttribute('aria-sort', sortKey === 'date' ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
      const progressArrow = thProgress.querySelector('.sort-arrow');
      const dateArrow = thDate.querySelector('.sort-arrow');
      if (progressArrow) progressArrow.textContent = sortKey === 'progress' ? (sortDir === 1 ? '→' : '→') : '→';
      if (dateArrow) dateArrow.textContent = sortKey === 'date' ? (sortDir === 1 ? '→' : '→') : '→';
    }

    function visibleJourneys() {
      const filtered = data.journeys.filter(function (journey) {
        if (statusFilter !== 'all' && journey.status !== statusFilter) return false;
        if (!query) return true;
        const haystack = [journey.name, journey.region, journey.stage, journey.owner].join(' ').toLowerCase();
        return haystack.indexOf(query) !== -1;
      });
      return filtered.sort(function (a, b) {
        if (sortKey === 'date') {
          const aTime = a.nextDate ? Date.parse(a.nextDate) : Number.POSITIVE_INFINITY;
          const bTime = b.nextDate ? Date.parse(b.nextDate) : Number.POSITIVE_INFINITY;
          return (aTime - bTime) * sortDir;
        }
        return (a.progress - b.progress) * sortDir;
      });
    }

    function openDrawer(journey, trigger) {
      closeJourneyDrawer(false);
      const drawerScope = createScope();
      const chartsInDrawer = [];
      const backdrop = el('button', 'detail-backdrop');
      backdrop.type = 'button';
      backdrop.setAttribute('aria-label', 'Close journey detail');
      const drawer = el('aside', 'detail-drawer');
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-labelledby', 'journey-detail-title');

      const drawerHead = el('div', 'detail-drawer__head');
      const titleWrap = el('div');
      const statusWrap = el('div', 'view__meta');
      statusWrap.appendChild(statusChip(journey.status));
      append(titleWrap,
        el('p', 'detail-drawer__eyebrow', journey.region + ' · Journey detail'),
        el('h2', 'detail-drawer__title', journey.name)
      );
      titleWrap.querySelector('.detail-drawer__title').id = 'journey-detail-title';
      const closeButton = el('button', 'icon-button');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close journey detail');
      closeButton.appendChild(iconSvg('close'));
      append(drawerHead, titleWrap, statusWrap, closeButton);
      drawerHead.insertBefore(statusWrap, closeButton);

      const drawerBody = el('div', 'detail-drawer__body');
      const metaGrid = el('div', 'detail-meta');
      [
        { label: 'Stage', value: journey.stage },
        { label: 'Owner', value: journey.owner },
        { label: 'Next date', value: journey.nextDate ? formatDate(journey.nextDate) : 'Journey complete' },
        { label: 'Travellers', value: journey.travellers + ' guests' }
      ].forEach(function (item) {
        const metaItem = el('div', 'detail-meta__item');
        append(metaItem, el('span', 'detail-meta__label', item.label), el('span', 'detail-meta__value', item.value));
        metaGrid.appendChild(metaItem);
      });
      drawerBody.appendChild(metaGrid);

      const progressBlock = el('div', 'drawer-block');
      const progressHead = el('div', 'drawer-block__head');
      append(progressHead, el('h3', 'drawer-block__title', 'Overall progress'), el('span', 'quarter-note', journey.progress + '%'));
      progressBlock.appendChild(progressHead);
      progressBlock.appendChild(progressBar(journey.progress, journey.status));
      drawerBody.appendChild(progressBlock);

      const stageBlock = el('div', 'drawer-block');
      const stageHead = el('div', 'drawer-block__head');
      append(stageHead, el('h3', 'drawer-block__title', 'Stage effort split'), el('span', 'quarter-note', 'share of plan'));
      const stageBar = el('div', 'stack-bar');
      stageBar.setAttribute('role', 'img');
      stageBar.setAttribute('aria-label', 'Stage effort split: ' + data.meta.stages.map(function (stage, index) {
        return stage + ' ' + journey.stageSplit[index] + ' percent';
      }).join(', ') + '.');
      const stageColors = ['--chart-1', '--chart-2', '--chart-4', '--chart-3', '--chart-5'];
      journey.stageSplit.forEach(function (value, index) {
        const segment = el('span', 'stack-bar__seg');
        segment.style.width = value + '%';
        segment.style.background = 'var(' + stageColors[index % stageColors.length] + ')';
        stageBar.appendChild(segment);
      });
      const stageLegend = el('div', 'stage-legend');
      data.meta.stages.forEach(function (stage, index) {
        const row = el('div', 'stage-legend__item');
        const dot = el('span', 'stage-legend__dot');
        dot.style.background = 'var(' + stageColors[index % stageColors.length] + ')';
        append(row, dot, el('span', null, stage), el('span', 'stage-legend__value', journey.stageSplit[index] + '%'));
        stageLegend.appendChild(row);
      });
      const stageTable = el('table', 'mini-table');
      const stageCaption = el('caption', 'sr-only', 'Stage effort split table');
      stageTable.appendChild(stageCaption);
      const stageThead = el('thead');
      const stageHeadRow = el('tr');
      append(stageHeadRow, el('th', null, 'Stage'), el('th', null, 'Share'));
      stageThead.appendChild(stageHeadRow);
      stageTable.appendChild(stageThead);
      const stageTbody = el('tbody');
      data.meta.stages.forEach(function (stage, index) {
        const row = el('tr');
        append(row, el('td', null, stage), el('td', null, journey.stageSplit[index] + '%'));
        stageTbody.appendChild(row);
      });
      stageTable.appendChild(stageTbody);
      const stageTableId = 'journey-stage-table-' + journey.id;
      const stageTableWrap = el('div', 'chart__table');
      stageTableWrap.id = stageTableId;
      stageTableWrap.hidden = true;
      stageTableWrap.appendChild(stageTable);
      const stageToggle = el('button', 'chart__toggle', 'View as table');
      stageToggle.type = 'button';
      stageToggle.setAttribute('aria-controls', stageTableId);
      stageToggle.setAttribute('aria-expanded', 'false');
      stageToggle.addEventListener('click', function () {
        const opening = stageTableWrap.hidden;
        stageTableWrap.hidden = !opening;
        stageToggle.setAttribute('aria-expanded', String(opening));
        stageToggle.textContent = opening ? 'Hide table' : 'View as table';
      });
      append(stageBlock, stageHead, stageBar, stageLegend, stageToggle, stageTableWrap);
      drawerBody.appendChild(stageBlock);

      const checklistBlock = el('div', 'drawer-block');
      const checklistHead = el('div', 'drawer-block__head');
      append(checklistHead, el('h3', 'drawer-block__title', 'Stage checklist'), el('span', 'quarter-note', journey.stage === 'Complete' ? 'All stages complete' : 'Current stage'));
      const checklist = el('ul', 'checklist');
      const currentIndex = data.meta.stages.indexOf(journey.stage);
      data.meta.stages.forEach(function (stage, index) {
        let state = 'pending';
        if (journey.status === 'complete' || (currentIndex !== -1 && index < currentIndex)) state = 'done';
        else if (index === currentIndex) state = 'current';
        const item = el('li', 'checklist__item is-' + state);
        const mark = el('span', 'checklist__mark', state === 'done' ? '✓' : (state === 'current' ? '•' : ''));
        append(item, mark, el('span', null, stage), el('span', 'sr-only', state === 'done' ? ' — complete' : (state === 'current' ? ' — current stage' : ' — not started')));
        checklist.appendChild(item);
      });
      append(checklistBlock, checklistHead, checklist);
      drawerBody.appendChild(checklistBlock);

      const historyBlock = el('div', 'drawer-block');
      const historyHead = el('div', 'drawer-block__head');
      append(historyHead, el('h3', 'drawer-block__title', 'Progress over time'), el('span', 'quarter-note', '8 checkpoints'));
      const historyChart = createChart({
        height: 142,
        label: 'Progress over time for ' + journey.name + ', ending at ' + journey.progress + ' percent.',
        render: function (width, chartContext) {
          return renderLineChart(
            [{ name: 'Progress', values: journey.progressTrail, colorIndex: 1 }],
            ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
            width,
            chartContext.height,
            {
              animate: chartContext.animate,
              suffix: '%',
              max: 100,
              tooltipHeading: 'Journey progress',
              smooth: true,
              xTickCount: 8
            }
          );
        },
        table: {
          caption: journey.name + ' — progress checkpoints',
          columns: ['Checkpoint', 'Progress'],
          rows: journey.progressTrail.map(function (value, index) {
            return ['Week ' + (index + 1), value + '%'];
          })
        }
      });
      historyBlock.appendChild(historyChart.figure);
      chartsInDrawer.push(historyChart);
      drawerBody.appendChild(historyBlock);

      drawer.appendChild(drawerHead);
      drawer.appendChild(drawerBody);
      app.appendChild(backdrop);
      app.appendChild(drawer);

      mountCharts(drawerScope, chartsInDrawer);

      let closed = false;
      function close(shouldReturnFocus) {
        if (closed) return;
        closed = true;
        if (detailCloseHandler === closeHandler) detailCloseHandler = null;
        drawerScope.destroy();
        backdrop.classList.remove('is-open');
        drawer.classList.remove('is-open');
        const restoreFocus = shouldReturnFocus && trigger && document.contains(trigger);
        window.setTimeout(function () {
          if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          document.body.classList.remove('drawer-open');
          if (restoreFocus) trigger.focus();
        }, reducedMotion ? 0 : 280);
      }
      function closeHandler(shouldReturnFocus) { close(shouldReturnFocus); }

      detailCloseHandler = closeHandler;
      scope.add(function () { close(false); });

      closeButton.addEventListener('click', function () { close(true); });
      backdrop.addEventListener('click', function () { close(true); });
      drawer.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
          .filter(function (node) { return node.getClientRects().length > 0; });
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
      });

      document.body.classList.add('drawer-open');
      window.requestAnimationFrame(function () {
        backdrop.classList.add('is-open');
        drawer.classList.add('is-open');
        closeButton.focus();
      });
    }

    function renderRows() {
      const journeys = visibleJourneys();
      clear(tbody);
      journeys.forEach(function (journey) {
        const row = el('tr', 'is-clickable');
        const journeyCell = el('td');
        journeyCell.setAttribute('data-col', 'journey');
        journeyCell.setAttribute('data-label', 'Journey');
        const openButton = el('button', 'cell-title', journey.name);
        openButton.type = 'button';
        append(journeyCell, openButton, el('span', 'cell-sub', journey.region));
        openButton.addEventListener('click', function () { openDrawer(journey, openButton); });
        row.addEventListener('click', function (event) {
          if (event.target.closest('button, a')) return;
          openDrawer(journey, openButton);
        });

        const stageCell = el('td', null, journey.stage);
        stageCell.setAttribute('data-col', 'stage');
        stageCell.setAttribute('data-label', 'Stage');
        const ownerCell = el('td', null, journey.owner);
        ownerCell.setAttribute('data-col', 'owner');
        ownerCell.setAttribute('data-label', 'Owner');
        const progressCell = el('td');
        progressCell.setAttribute('data-col', 'progress');
        progressCell.setAttribute('data-label', 'Progress');
        progressCell.appendChild(progressBar(journey.progress, journey.status));
        const dateCell = el('td');
        dateCell.setAttribute('data-col', 'date');
        dateCell.setAttribute('data-label', 'Next date');
        if (journey.nextDate) {
          const time = el('time', 'table-date', formatDate(journey.nextDate));
          time.dateTime = journey.nextDate;
          dateCell.appendChild(time);
        } else {
          dateCell.appendChild(el('span', 'table-date', '—'));
        }
        const statusCell = el('td');
        statusCell.setAttribute('data-col', 'status');
        statusCell.setAttribute('data-label', 'Status');
        statusCell.appendChild(statusChip(journey.status));

        append(row, journeyCell, stageCell, ownerCell, progressCell, dateCell, statusCell);
        tbody.appendChild(row);
      });

      const hasRows = journeys.length > 0;
      tablePanel.hidden = !hasRows;
      emptyHost.hidden = hasRows;
      if (hasRows) {
        clear(emptyHost);
      } else {
        clear(emptyHost);
        const hasFilters = Boolean(query) || statusFilter !== 'all';
        const actionLabel = query && statusFilter !== 'all' ? 'Clear search and filters' : (query ? 'Clear search' : 'Show all journeys');
        emptyHost.appendChild(emptyState({
          icon: hasFilters ? 'search' : 'route',
          title: query ? 'No journeys match “' + query + '”' : 'No journeys in this status',
          text: hasFilters
            ? 'Try a different name, region or owner, or reset the status filter.'
            : 'Journeys will appear here as soon as they are added to the workspace.',
          actionLabel: hasFilters ? actionLabel : null,
          onAction: function () {
            query = '';
            statusFilter = 'all';
            Object.keys(chipButtons).forEach(function (key) {
              chipButtons[key].setAttribute('aria-pressed', String(key === 'all'));
            });
            renderRows();
            context.clearSearch();
          }
        }));
      }

      const baseText = journeys.length + (journeys.length === 1 ? ' journey' : ' journeys');
      listCount.textContent = (query || statusFilter !== 'all')
        ? 'Showing ' + baseText + ' of ' + data.journeys.length
        : 'All ' + baseText + ' · sorted by ' + (sortKey === 'progress' ? 'progress' : 'next date');
      updateSortHeaders();
    }

    updateSortHeaders();
    renderRows();

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        renderRows();
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Planning
   * ------------------------------------------------------------------ */

  function renderPlanning(data) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--planning');
    let selectedIndex = 3;

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Quarter plan')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Planning'),
      el('p', 'view__sub', 'Read the quarter at a glance: remaining work against the ideal line, workstream capacity, live phases and milestone status.')
    );

    const quarterSwitch = el('div', 'quarter-switch');
    quarterSwitch.setAttribute('role', 'group');
    quarterSwitch.setAttribute('aria-label', 'Select planning quarter');
    const quarterButtons = [];
    data.quarters.forEach(function (quarter, index) {
      const button = el('button', null, quarter.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === selectedIndex));
      button.setAttribute('aria-label', quarter.label + ', ' + quarter.months);
      button.addEventListener('click', function () { selectQuarter(index); });
      quarterButtons.push(button);
      quarterSwitch.appendChild(button);
    });
    const actions = el('div', 'view__actions');
    actions.appendChild(quarterSwitch);
    append(head, copy, actions);
    view.appendChild(head);

    const grid = el('div', 'planning-grid');

    const burndownPanel = el('section', 'panel');
    const burndownHead = el('div', 'panel__head');
    const burndownCopy = el('div');
    const burndownTitle = el('h2', 'panel__title', 'Burndown');
    const burndownSub = el('p', 'panel__sub', 'Remaining work against the ideal line');
    append(burndownCopy, burndownTitle, burndownSub);
    const burndownNote = el('span', 'quarter-note', '');
    append(burndownHead, burndownCopy, burndownNote);
    const burndownBody = el('div', 'panel__body chart-panel__body');
    const burndownLegend = el('div', 'legend');
    const remainingLegend = el('span', 'legend__item');
    const remainingSwatch = el('span', 'legend__swatch');
    remainingSwatch.style.setProperty('--swatch', 'var(--chart-1)');
    append(remainingLegend, remainingSwatch, el('span', null, 'Remaining'));
    const idealLegend = el('span', 'legend__item');
    const idealSwatch = el('span', 'legend__swatch');
    idealSwatch.style.setProperty('--swatch', 'var(--chart-2)');
    append(idealLegend, idealSwatch, el('span', null, 'Ideal (dashed)'));
    append(burndownLegend, remainingLegend, idealLegend);

    function burndownSpec(quarter) {
      const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
      const max = niceMax(Math.max.apply(null, quarter.burndown.remaining.concat(quarter.burndown.ideal)));
      return {
        height: 232,
        label: 'Burndown for ' + quarter.label + '. Remaining work falls from ' + quarter.burndown.remaining[0] +
          ' to ' + quarter.burndown.remaining[7] + ' hours against an ideal line ending at ' + quarter.burndown.ideal[7] + ' hours.',
        render: function (width, chartContext) {
          return renderLineChart(
            [
              { name: 'Remaining', values: quarter.burndown.remaining, colorIndex: 1 },
              { name: 'Ideal', values: quarter.burndown.ideal, colorIndex: 2, dashed: true }
            ],
            labels,
            width,
            chartContext.height,
            {
              animate: chartContext.animate,
              max: max,
              smooth: true,
              tooltipHeading: quarter.label + ' burndown',
              keyboardLabel: 'Burndown chart. Use arrow keys to inspect weekly remaining and ideal values.'
            }
          );
        },
        table: {
          caption: quarter.label + ' burndown, hours remaining',
          columns: ['Week', 'Remaining', 'Ideal'],
          rows: labels.map(function (label, index) {
            return [label, quarter.burndown.remaining[index], quarter.burndown.ideal[index]];
          })
        }
      };
    }

    const burndownChart = createChart(burndownSpec(data.quarters[selectedIndex]));
    charts.push(burndownChart);
    append(burndownBody, burndownLegend, burndownChart.figure);
    append(burndownPanel, burndownHead, burndownBody);

    const capacityPanel = el('section', 'panel');
    const capacityHead = el('div', 'panel__head');
    const capacityCopy = el('div');
    append(capacityCopy,
      el('h2', 'panel__title', 'Capacity by workstream'),
      el('p', 'panel__sub', 'Committed hours against the planned target')
    );
    const capacityNote = el('span', 'quarter-note', '');
    append(capacityHead, capacityCopy, capacityNote);
    const capacityBody = el('div', 'panel__body chart-panel__body');
    const capacityLegend = el('div', 'legend');
    const committedItem = el('span', 'legend__item');
    const committedSwatch = el('span', 'legend__swatch');
    committedSwatch.style.setProperty('--swatch', 'var(--chart-2)');
    append(committedItem, committedSwatch, el('span', null, 'Committed'));
    const targetItem = el('span', 'legend__item');
    const targetSwatch = el('span', 'legend__swatch');
    targetSwatch.style.setProperty('--swatch', 'var(--bone)');
    targetSwatch.style.borderRadius = '0';
    targetSwatch.style.height = '1px';
    append(targetItem, targetSwatch, el('span', null, 'Target marker'));
    append(capacityLegend, committedItem, targetItem);

    function capacitySpec(quarter) {
      return {
        height: 236,
        label: 'Capacity by workstream for ' + quarter.label + '. ' + quarter.capacity.map(function (row) {
          return row.name + ' is at ' + row.committed + ' hours against a target of ' + row.target;
        }).join('; ') + '.',
        render: function (width, chartContext) {
          return renderCapacityBars(quarter.capacity.map(function (row) {
            return { name: row.name, value: row.committed, target: row.target };
          }), width, chartContext.height, {
            animate: chartContext.animate,
            suffix: 'h',
            colorIndex: 2
          });
        },
        table: {
          caption: quarter.label + ' capacity, hours',
          columns: ['Workstream', 'Committed', 'Target'],
          rows: quarter.capacity.map(function (row) {
            return [row.name, row.committed, row.target];
          })
        }
      };
    }

    const capacityChart = createChart(capacitySpec(data.quarters[selectedIndex]));
    charts.push(capacityChart);
    append(capacityBody, capacityLegend, capacityChart.figure);
    append(capacityPanel, capacityHead, capacityBody);

    const ganttPanel = el('section', 'panel');
    const ganttHead = el('div', 'panel__head');
    const ganttCopy = el('div');
    append(ganttCopy,
      el('h2', 'panel__title', 'Current phases'),
      el('p', 'panel__sub', 'Five live workstreams across the quarter window')
    );
    const ganttNote = el('span', 'quarter-note', '');
    append(ganttHead, ganttCopy, ganttNote);
    const ganttBody = el('div', 'panel__body chart-panel__body');
    const ganttLegend = el('div', 'legend');
    [
      { status: 'on-track', label: 'On track', color: 'var(--chart-2)' },
      { status: 'at-risk', label: 'At risk', color: 'var(--chart-1)' },
      { status: 'blocked', label: 'Blocked', color: 'var(--chart-4)' }
    ].forEach(function (item) {
      const legendItem = el('span', 'legend__item');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', item.color);
      append(legendItem, swatch, el('span', null, item.label));
      ganttLegend.appendChild(legendItem);
    });

    function ganttSpec(quarter) {
      return {
        height: 236,
        label: 'Gantt strip for ' + quarter.label + '. ' + quarter.gantt.map(function (phase) {
          return phase.name + ' runs from week ' + phase.start + ' to week ' + phase.end + ' and is ' + statusMeta(phase.status).label.toLowerCase();
        }).join('; ') + '.',
        render: function (width, chartContext) {
          return renderGantt(quarter.gantt, width, chartContext.height, {
            animate: chartContext.animate,
            range: 8
          });
        },
        table: {
          caption: quarter.label + ' current phases',
          columns: ['Phase', 'Start', 'End', 'Status'],
          rows: quarter.gantt.map(function (phase) {
            return [phase.name, 'Week ' + phase.start, 'Week ' + phase.end, statusMeta(phase.status).label];
          })
        }
      };
    }

    const ganttChart = createChart(ganttSpec(data.quarters[selectedIndex]));
    charts.push(ganttChart);
    append(ganttBody, ganttLegend, ganttChart.figure);
    append(ganttPanel, ganttHead, ganttBody);

    const milestonePanel = el('section', 'panel');
    const milestoneHead = el('div', 'panel__head');
    const milestoneCopy = el('div');
    append(milestoneCopy,
      el('h2', 'panel__title', 'Milestones'),
      el('p', 'panel__sub', 'Status and due dates for the selected quarter')
    );
    const milestoneNote = el('span', 'quarter-note', '');
    append(milestoneHead, milestoneCopy, milestoneNote);
    const milestoneBody = el('div', 'panel__body');
    const milestoneTable = el('table', 'data-table');
    const milestoneThead = el('thead');
    const milestoneHeadRow = el('tr');
    ['Milestone', 'Due', 'Status'].forEach(function (label) {
      const th = el('th', null, label);
      th.scope = 'col';
      milestoneHeadRow.appendChild(th);
    });
    milestoneThead.appendChild(milestoneHeadRow);
    milestoneTable.appendChild(milestoneThead);
    const milestoneTbody = el('tbody');
    milestoneTable.appendChild(milestoneTbody);
    milestoneBody.appendChild(milestoneTable);
    append(milestonePanel, milestoneHead, milestoneBody);

    function renderMilestoneRows(quarter) {
      clear(milestoneTbody);
      quarter.milestones.forEach(function (milestone) {
        const tr = el('tr');
        const nameCell = el('td');
        nameCell.setAttribute('data-col', 'name');
        nameCell.setAttribute('data-label', 'Milestone');
        append(nameCell, el('span', 'cell-title', milestone.name), el('span', 'cell-sub', milestone.journey));
        const dueCell = el('td');
        dueCell.setAttribute('data-col', 'date');
        dueCell.setAttribute('data-label', 'Due');
        const time = el('time', 'table-date', formatDate(milestone.due));
        time.dateTime = milestone.due;
        dueCell.appendChild(time);
        const statusCell = el('td');
        statusCell.setAttribute('data-col', 'status');
        statusCell.setAttribute('data-label', 'Status');
        statusCell.appendChild(statusChip(milestone.status));
        append(tr, nameCell, dueCell, statusCell);
        milestoneTbody.appendChild(tr);
      });
      milestoneNote.textContent = quarter.label + ' · ' + quarter.milestones.filter(function (milestone) {
        return milestone.status !== 'complete';
      }).length + ' open';
    }

    function selectQuarter(index) {
      selectedIndex = clamp(index, 0, data.quarters.length - 1);
      const quarter = data.quarters[selectedIndex];
      quarterButtons.forEach(function (button, buttonIndex) {
        button.setAttribute('aria-pressed', String(buttonIndex === selectedIndex));
      });
      const note = quarter.label + ' ' + quarter.months;
      burndownNote.textContent = note;
      capacityNote.textContent = note;
      ganttNote.textContent = note;
      burndownChart.update(burndownSpec(quarter));
      capacityChart.update(capacitySpec(quarter));
      ganttChart.update(ganttSpec(quarter));
      renderMilestoneRows(quarter);
      announce('Planning updated to ' + quarter.label + ', ' + quarter.months + '.');
    }

    burndownNote.textContent = data.quarters[selectedIndex].label + ' ' + data.quarters[selectedIndex].months;
    capacityNote.textContent = burndownNote.textContent;
    ganttNote.textContent = burndownNote.textContent;
    renderMilestoneRows(data.quarters[selectedIndex]);

    append(grid, burndownPanel, capacityPanel, ganttPanel, milestonePanel);
    view.appendChild(grid);
    mountCharts(scope, charts);

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * View: Reports
   * ------------------------------------------------------------------ */

  function renderReports(data) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--reports');
    const seriesVisibility = data.monthly.series.map(function () { return true; });

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Reporting')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Reports'),
      el('p', 'view__sub', 'Trends across updates, milestones and documents, plus activity density and capability scores for the current portfolio.')
    );
    const reportStatus = el('p', 'report-status');
    reportStatus.setAttribute('role', 'status');
    reportStatus.setAttribute('aria-live', 'polite');
    reportStatus.textContent = 'All three series visible.';
    copy.appendChild(reportStatus);

    const downloadButton = el('button', 'btn btn--primary', 'Download CSV');
    downloadButton.type = 'button';
    downloadButton.appendChild(iconSvg('download'));
    const actions = el('div', 'view__actions');
    actions.appendChild(downloadButton);
    append(head, copy, actions);
    view.appendChild(head);

    const grid = el('div', 'reports-grid');

    const linePanel = el('section', 'panel');
    const lineHead = el('div', 'panel__head');
    const lineCopy = el('div');
    append(lineCopy,
      el('h2', 'panel__title', 'Journey activity — six month trend'),
      el('p', 'panel__sub', 'Updates, milestones and documents shared each month')
    );
    lineHead.appendChild(lineCopy);
    const lineBody = el('div', 'panel__body chart-panel__body');
    const lineLegend = el('div', 'legend');
    lineLegend.setAttribute('role', 'group');
    lineLegend.setAttribute('aria-label', 'Toggle monthly chart series');
    const legendButtons = [];

    data.monthly.series.forEach(function (series, index) {
      const button = el('button', 'legend__item');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'true');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', series.color);
      append(button, swatch, el('span', null, series.name));
      button.addEventListener('click', function () {
        seriesVisibility[index] = !seriesVisibility[index];
        button.setAttribute('aria-pressed', String(seriesVisibility[index]));
        refreshSeries();
      });
      legendButtons.push(button);
      lineLegend.appendChild(button);
    });

    function visibleSeries() {
      return data.monthly.series.filter(function (series, index) {
        return seriesVisibility[index];
      });
    }

    function lineSpec() {
      const series = visibleSeries();
      const visibleCount = series.length;
      return {
        height: 252,
        label: visibleCount
          ? 'Six month trend with ' + visibleCount + ' visible series: ' + series.map(function (item) {
            return item.name;
          }).join(', ') + '.'
          : 'Six month trend. No series selected.',
        render: function (width, chartContext) {
          return renderLineChart(
            series.map(function (item, index) {
              return {
                name: item.name,
                values: item.values,
                colorIndex: data.monthly.series.indexOf(item) + 1
              };
            }),
            data.monthly.labels,
            width,
            chartContext.height,
            {
              animate: chartContext.animate,
              tooltipHeading: 'Month',
              keyboardLabel: 'Monthly trend line chart. Use arrow keys to inspect months.'
            }
          );
        },
        table: {
          caption: 'Monthly activity — visible series',
          columns: ['Month'].concat(series.map(function (item) { return item.name; })),
          rows: data.monthly.labels.map(function (label, monthIndex) {
            return [label].concat(series.map(function (item) { return item.values[monthIndex]; }));
          })
        }
      };
    }

    const lineChart = createChart(lineSpec());
    charts.push(lineChart);
    append(lineBody, lineLegend, lineChart.figure);
    append(linePanel, lineHead, lineBody);

    const barsPanel = el('section', 'panel');
    const barsHead = el('div', 'panel__head');
    const barsCopy = el('div');
    append(barsCopy,
      el('h2', 'panel__title', 'Monthly totals'),
      el('p', 'panel__sub', 'Grouped counts by month and series')
    );
    barsHead.appendChild(barsCopy);
    const barsBody = el('div', 'panel__body chart-panel__body');

    function barsSpec() {
      const series = visibleSeries();
      return {
        height: 252,
        label: series.length
          ? 'Grouped monthly totals for ' + series.map(function (item) { return item.name; }).join(', ') + '.'
          : 'Grouped monthly totals. No series selected.',
        render: function (width, chartContext) {
          return renderGroupedBars(data.monthly.labels, series.map(function (item) {
            return {
              name: item.name,
              values: item.values,
              colorIndex: data.monthly.series.indexOf(item) + 1
            };
          }), width, chartContext.height, {
            animate: chartContext.animate
          });
        },
        table: {
          caption: 'Grouped monthly totals — visible series',
          columns: ['Month'].concat(series.map(function (item) { return item.name; })),
          rows: data.monthly.labels.map(function (label, monthIndex) {
            return [label].concat(series.map(function (item) { return item.values[monthIndex]; }));
          })
        }
      };
    }

    const barsChart = createChart(barsSpec());
    charts.push(barsChart);
    barsBody.appendChild(barsChart.figure);
    append(barsPanel, barsHead, barsBody);

    const heatPanel = el('section', 'panel');
    const heatHead = el('div', 'panel__head');
    const heatCopy = el('div');
    append(heatCopy,
      el('h2', 'panel__title', 'Activity heatmap'),
      el('p', 'panel__sub', 'Daily workspace actions across the last 20 weeks')
    );
    const heatLegend = el('div', 'heat-legend');
    heatLegend.appendChild(el('span', null, 'Less'));
    for (let level = 0; level < 6; level += 1) {
      const cell = el('span', 'heat-legend__cell');
      cell.setAttribute('data-level', String(level));
      heatLegend.appendChild(cell);
    }
    heatLegend.appendChild(el('span', null, 'More'));
    append(heatHead, heatCopy, heatLegend);
    const heatBody = el('div', 'panel__body chart-panel__body');
    const heatRows = [];
    data.heatmap.weeks.forEach(function (week) {
      week.days.forEach(function (day) {
        heatRows.push([formatDate(day.date), day.value === 0 ? 'None' : String(day.value)]);
      });
    });
    const heatChart = createChart({
      height: 220,
      label: 'Activity heatmap for 20 weeks, ' + formatDate(data.heatmap.startDate) + ' to ' + formatDate(data.heatmap.endDate) +
        ', with up to ' + data.heatmap.max + ' recorded actions per day.',
      render: function (width, chartContext) {
        return renderHeatmap(data.heatmap.weeks, width, chartContext.height, {
          animate: chartContext.animate
        });
      },
      table: {
        caption: 'Daily activity, 20 weeks',
        columns: ['Date', 'Actions'],
        rows: heatRows
      }
    });
    charts.push(heatChart);
    heatBody.appendChild(heatChart.figure);
    append(heatPanel, heatHead, heatBody);

    const radarPanel = el('section', 'panel');
    const radarHead = el('div', 'panel__head');
    const radarCopy = el('div');
    append(radarCopy,
      el('h2', 'panel__title', 'Capability scores'),
      el('p', 'panel__sub', 'Five planning capabilities, scored out of 100')
    );
    const radarNote = el('span', 'quarter-note', 'Self-assessed');
    append(radarHead, radarCopy, radarNote);
    const radarBody = el('div', 'panel__body chart-panel__body');
    const radarChart = createChart({
      height: 220,
      label: 'Capability radar. ' + data.capability.axes.map(function (axis, index) {
        return axis + ' scores ' + data.capability.values[index] + ' out of 100';
      }).join('; ') + '.',
      render: function (width, chartContext) {
        return renderRadar(data.capability.axes, data.capability.values, width, chartContext.height, {
          animate: chartContext.animate,
          max: 100
        });
      },
      table: {
        caption: 'Capability scores out of 100',
        columns: ['Capability', 'Score'],
        rows: data.capability.axes.map(function (axis, index) {
          return [axis, data.capability.values[index]];
        })
      }
    });
    charts.push(radarChart);
    radarBody.appendChild(radarChart.figure);
    append(radarPanel, radarHead, radarBody);

    function refreshSeries() {
      const visible = visibleSeries();
      lineChart.update(lineSpec());
      barsChart.update(barsSpec());
      downloadButton.disabled = visible.length === 0;
      reportStatus.classList.remove('is-success');
      reportStatus.textContent = visible.length
        ? visible.length + ' of ' + data.monthly.series.length + ' series visible.'
        : 'No series selected. Choose at least one series to export.';
      announce(reportStatus.textContent);
    }

    function csvCell(value) {
      const text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    downloadButton.addEventListener('click', function () {
      const series = visibleSeries();
      if (!series.length) {
        reportStatus.textContent = 'Select at least one series before downloading.';
        announce(reportStatus.textContent);
        return;
      }
      const header = ['Month'].concat(series.map(function (item) { return item.name; }));
      const lines = [header.map(csvCell).join(',')];
      data.monthly.labels.forEach(function (label, monthIndex) {
        lines.push([label].concat(series.map(function (item) {
          return item.values[monthIndex];
        })).map(csvCell).join(','));
      });
      const csv = lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'stackly-reports-' + localISODate(new Date()) + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      reportStatus.classList.add('is-success');
      reportStatus.textContent = 'CSV downloaded: ' + anchor.download;
      announce('CSV downloaded with ' + series.length + ' visible series.');
    });

    append(grid, linePanel, barsPanel, heatPanel, radarPanel);
    view.appendChild(grid);
    mountCharts(scope, charts);

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * View: Documents
   * ------------------------------------------------------------------ */

  function renderDocuments(data, session, context) {
    const scope = createScope();
    const view = el('div', 'view view--documents');
    const documents = clone(data.documents);
    let usedBytes = data.storage.usedBytes;
    let typeFilter = 'all';
    let query = '';
    const totalBytes = data.storage.totalBytes;

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Files')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Documents'),
      el('p', 'view__sub', 'Route briefs, risk registers and guest files for every journey. Uploads in this concept are simulated locally and never leave the browser.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill', documents.length + ' recent files'),
      el('span', 'status-pill status-pill--accent', '2 in review')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const top = el('div', 'documents-top');

    const storagePanel = el('section', 'panel storage-panel');
    append(storagePanel,
      el('h2', 'panel__title', 'Storage'),
      el('p', 'panel__sub', 'Workspace total, including archived trip media')
    );
    const ringHost = el('div', 'storage-panel__ring');
    storagePanel.appendChild(ringHost);
    const storageFoot = el('p', 'storage-panel__foot');
    storagePanel.appendChild(storageFoot);

    function ringSpec() {
      return {
        height: 190,
        label: 'Workspace storage ring. ' + formatBytes(usedBytes) + ' used of ' + formatBytes(totalBytes) + '.',
        render: function (width, chartContext) {
          return {
            node: renderRing(usedBytes, totalBytes, width, chartContext.height, {
              animate: chartContext.animate,
              centerValue: (usedBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB',
              centerLabel: 'of 5 GB used'
            })
          };
        },
        table: {
          caption: 'Workspace storage',
          columns: ['Measure', 'Value'],
          rows: [
            ['Used', formatBytes(usedBytes)],
            ['Total', formatBytes(totalBytes)],
            ['Free', formatBytes(Math.max(0, totalBytes - usedBytes))]
          ]
        }
      };
    }

    const ringChart = createChart(ringSpec());
    ringHost.appendChild(ringChart.figure);

    function refreshStorage() {
      const percent = Math.round((usedBytes / totalBytes) * 100);
      storageFoot.textContent = formatBytes(usedBytes) + ' of ' + formatBytes(totalBytes) + ' used · ' + percent + '% of workspace storage. ' + data.storage.note;
      ringChart.update(ringSpec());
    }
    refreshStorage();

    const uploadPanel = el('section', 'panel upload-panel');
    uploadPanel.setAttribute('aria-labelledby', 'upload-title');
    const uploadTitle = el('h2', 'upload-panel__title', 'Add a document');
    uploadTitle.id = 'upload-title';
    const uploadSub = el('p', 'upload-panel__sub', 'PDF, Word, Excel, CSV or an image. Maximum file size 10 MB.');
    const uploadZone = el('div', 'upload-zone');
    const fileInput = el('input', 'upload-input');
    fileInput.type = 'file';
    fileInput.id = 'document-upload';
    fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png';
    fileInput.setAttribute('aria-describedby', 'document-upload-help document-upload-error');
    const uploadLabel = el('label', 'btn btn--secondary upload-label', null);
    uploadLabel.htmlFor = 'document-upload';
    uploadLabel.appendChild(iconSvg('upload'));
    uploadLabel.appendChild(el('span', null, 'Choose file'));
    const uploadCopy = el('div', 'upload-zone__copy');
    uploadCopy.id = 'document-upload-help';
    append(uploadCopy,
      el('strong', null, 'Drop into the workspace'),
      el('span', null, 'Uploads are simulated. No file is sent to a server.')
    );
    append(uploadZone, fileInput, uploadLabel, uploadCopy);

    const uploadError = el('p', 'field-error');
    uploadError.id = 'document-upload-error';
    uploadError.setAttribute('role', 'alert');
    uploadError.hidden = true;

    const progressWrap = el('div', 'upload-progress');
    progressWrap.hidden = true;
    const progressHead = el('div', 'upload-progress__head');
    const progressName = el('span', null, 'Preparing file');
    const progressPercent = el('span', null, '0%');
    append(progressHead, progressName, progressPercent);
    const progressTrack = el('div', 'upload-progress__track');
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', '0');
    progressTrack.setAttribute('aria-label', 'Simulated upload progress');
    const progressFill = el('div', 'upload-progress__fill');
    progressTrack.appendChild(progressFill);
    append(progressWrap, progressHead, progressTrack);

    append(uploadPanel, uploadTitle, uploadSub, uploadZone, uploadError, progressWrap);

    append(top, storagePanel, uploadPanel);
    view.appendChild(top);

    const allowedTypes = {
      pdf: { type: 'pdf', category: 'PDF' },
      doc: { type: 'doc', category: 'Brief' },
      docx: { type: 'doc', category: 'Brief' },
      xls: { type: 'sheet', category: 'Spreadsheet' },
      xlsx: { type: 'sheet', category: 'Spreadsheet' },
      csv: { type: 'data', category: 'Data' },
      jpg: { type: 'image', category: 'Image' },
      jpeg: { type: 'image', category: 'Image' },
      png: { type: 'image', category: 'Image' }
    };

    const toolbar = el('div', 'view-toolbar');
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter documents by type');
    const chipCounts = {};
    const chipButtons = {};
    [{ key: 'all', label: 'All' }, { key: 'PDF', label: 'PDF' }, { key: 'Spreadsheet', label: 'Spreadsheet' }, { key: 'Brief', label: 'Brief' }, { key: 'Image', label: 'Image' }, { key: 'Data', label: 'Data' }].forEach(function (option) {
      const button = el('button', 'filter-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(option.key === 'all'));
      const count = el('span', 'filter-chip__count', '0');
      append(button, el('span', null, option.label), count);
      button.addEventListener('click', function () {
        typeFilter = option.key;
        Object.keys(chipButtons).forEach(function (key) {
          chipButtons[key].setAttribute('aria-pressed', String(key === typeFilter));
        });
        renderRows();
      });
      chipButtons[option.key] = button;
      chipCounts[option.key] = count;
      chips.appendChild(button);
    });
    const listCount = el('p', 'toolbar-note');
    listCount.setAttribute('aria-live', 'polite');
    append(toolbar, chips, listCount);
    view.appendChild(toolbar);

    const tablePanel = el('div', 'data-panel');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    ['Name', 'Type', 'Size', 'Updated', 'Status'].forEach(function (label) {
      const th = el('th', null, label);
      th.scope = 'col';
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    table.appendChild(tbody);
    tablePanel.appendChild(table);
    view.appendChild(tablePanel);

    const emptyHost = el('div');
    emptyHost.hidden = true;
    view.appendChild(emptyHost);

    function syncChipCounts() {
      chipCounts.all.textContent = String(documents.length);
      ['PDF', 'Spreadsheet', 'Brief', 'Image', 'Data'].forEach(function (category) {
        chipCounts[category].textContent = String(documents.filter(function (doc) {
          return doc.category === category;
        }).length);
      });
    }

    function visibleDocuments() {
      return documents.filter(function (doc) {
        if (typeFilter !== 'all' && doc.category !== typeFilter) return false;
        if (query && doc.name.toLowerCase().indexOf(query) === -1) return false;
        return true;
      });
    }

    function renderRows() {
      const visible = visibleDocuments();
      clear(tbody);
      visible.forEach(function (doc) {
        const tr = el('tr');
        const nameCell = el('td');
        nameCell.setAttribute('data-col', 'name');
        nameCell.setAttribute('data-label', 'Name');
        const name = el('span', 'file-name');
        const ext = doc.name.split('.').pop().toUpperCase().slice(0, 4);
        append(name, el('span', 'file-type', ext), el('span', null, doc.name));
        append(nameCell, name, el('span', 'cell-sub', doc.owner || 'Workspace file'));
        const typeCell = el('td', null, doc.category);
        typeCell.setAttribute('data-col', 'type');
        typeCell.setAttribute('data-label', 'Type');
        const sizeCell = el('td', null, formatBytes(doc.size));
        sizeCell.setAttribute('data-col', 'size');
        sizeCell.setAttribute('data-label', 'Size');
        const updatedCell = el('td');
        updatedCell.setAttribute('data-col', 'updated');
        updatedCell.setAttribute('data-label', 'Updated');
        const time = el('time', 'table-date', formatDate(doc.updated));
        time.dateTime = doc.updated;
        updatedCell.appendChild(time);
        const statusCell = el('td');
        statusCell.setAttribute('data-col', 'status');
        statusCell.setAttribute('data-label', 'Status');
        statusCell.appendChild(docStatusChip(doc.status));
        append(tr, nameCell, typeCell, sizeCell, updatedCell, statusCell);
        tbody.appendChild(tr);
      });

      const hasRows = visible.length > 0;
      tablePanel.hidden = !hasRows;
      emptyHost.hidden = hasRows;
      if (!hasRows) {
        clear(emptyHost);
        const filtered = Boolean(query) || typeFilter !== 'all';
        emptyHost.appendChild(emptyState({
          icon: 'file',
          title: query ? 'No documents match “' + query + '”' : 'No documents in this type',
          text: filtered
            ? 'Try a different file name or reset the type filter.'
            : 'Uploaded files and shared briefs will appear here.',
          actionLabel: filtered ? (query && typeFilter !== 'all' ? 'Clear search and filter' : (query ? 'Clear search' : 'Show all documents')) : null,
          onAction: function () {
            query = '';
            typeFilter = 'all';
            Object.keys(chipButtons).forEach(function (key) {
              chipButtons[key].setAttribute('aria-pressed', String(key === 'all'));
            });
            renderRows();
            context.clearSearch();
          }
        }));
      }

      listCount.textContent = (query || typeFilter !== 'all')
        ? 'Showing ' + visible.length + ' of ' + documents.length + ' files'
        : documents.length + ' recent files · ' + documents.filter(function (doc) { return doc.status === 'In review'; }).length + ' in review';
    }

    function uploadErrorShow(message) {
      uploadError.textContent = message;
      uploadError.hidden = false;
      fileInput.setAttribute('aria-invalid', 'true');
      announce(message);
    }

    function uploadErrorClear() {
      uploadError.textContent = '';
      uploadError.hidden = true;
      fileInput.removeAttribute('aria-invalid');
    }

    function simulateUpload(file) {
      const extension = file.name.split('.').pop().toLowerCase();
      const mapped = allowedTypes[extension];
      if (!mapped) {
        uploadErrorShow('Unsupported file type. Use PDF, Word, Excel, CSV, JPG or PNG.');
        fileInput.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        uploadErrorShow('File is larger than the 10 MB limit.');
        fileInput.value = '';
        return;
      }
      if (file.size === 0) {
        uploadErrorShow('That file is empty. Choose a document with content.');
        fileInput.value = '';
        return;
      }

      uploadErrorClear();
      fileInput.disabled = true;
      uploadPanel.setAttribute('aria-busy', 'true');
      progressWrap.hidden = false;
      progressFill.style.width = '0%';
      progressTrack.setAttribute('aria-valuenow', '0');
      progressName.textContent = file.name;
      progressPercent.textContent = '0%';
      let elapsed = 0;
      const step = 80;
      const total = 1200;
      const timer = scope.interval(function () {
        elapsed = Math.min(total, elapsed + step);
        const percent = Math.round((elapsed / total) * 100);
        progressFill.style.width = percent + '%';
        progressTrack.setAttribute('aria-valuenow', String(percent));
        progressPercent.textContent = percent + '%';
        if (elapsed >= total) {
          window.clearInterval(timer);
          finalizeUpload(file, mapped);
        }
      }, step);
    }

    function finalizeUpload(file, mapped) {
      // No upload endpoint is called here. A production build would POST to
      // /api/documents with authentication, validation and virus scanning.
      const doc = {
        id: 'doc-upload-' + Date.now(),
        name: file.name,
        type: mapped.type,
        category: mapped.category,
        size: file.size,
        updated: localISODate(new Date()),
        status: 'In review',
        owner: session.name
      };
      documents.unshift(doc);
      usedBytes = Math.min(totalBytes, usedBytes + file.size);
      fileInput.disabled = false;
      uploadPanel.removeAttribute('aria-busy');
      progressWrap.hidden = true;
      fileInput.value = '';
      syncChipCounts();
      refreshStorage();
      renderRows();
      showToast('Upload simulated — “' + file.name + '” was added to this browser session.');
      announce(file.name + ' added to the documents table as a simulated upload.');
    }

    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      if (file) simulateUpload(file);
    });

    syncChipCounts();
    renderRows();
    mountCharts(scope, [ringChart]);

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        renderRows();
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Messages
   * ------------------------------------------------------------------ */

  function renderMessages() {
    const scope = createScope();
    const view = el('div', 'view view--messages');
    let query = '';

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Conversations')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Messages'),
      el('p', 'view__sub', 'One thread per guide, partner or planner. Replies are kept in memory for this session; nothing is sent to a backend.')
    );
    const meta = el('div', 'view__meta');
    const unreadPill = el('span', 'status-pill status-pill--accent');
    meta.appendChild(unreadPill);
    append(head, copy, meta);
    view.appendChild(head);

    const inbox = el('div', 'inbox');
    const listPane = el('div', 'inbox__list');
    const listHead = el('div', 'inbox__list-head');
    const listHeadCopy = el('div');
    append(listHeadCopy, el('h2', 'inbox__list-title', 'Inbox'), el('p', 'cell-sub', 'Planners and partners'));
    const listMeta = el('span', 'inbox__list-meta');
    append(listHead, listHeadCopy, listMeta);
    const threadList = el('div', 'thread-list');
    threadList.setAttribute('role', 'list');
    threadList.setAttribute('aria-label', 'Message threads');
    append(listPane, listHead, threadList);

    const conversation = el('div', 'inbox__conversation');
    append(inbox, listPane, conversation);
    view.appendChild(inbox);

    function threadById(id) {
      return appState.threads.find(function (thread) { return thread.id === id; }) || null;
    }

    function lastMessage(thread) {
      return thread.messages.length ? thread.messages[thread.messages.length - 1] : null;
    }

    function updateUnreadPill() {
      const count = appState.threads.reduce(function (total, thread) {
        return total + (thread.unread ? 1 : 0);
      }, 0);
      unreadPill.textContent = count ? count + ' unread' : 'All caught up';
      listMeta.textContent = appState.threads.length + ' threads · ' + count + ' unread';
      updateNavBadges();
    }

    function filteredThreads() {
      if (!query) return appState.threads;
      return appState.threads.filter(function (thread) {
        const latest = lastMessage(thread);
        const haystack = [thread.name, thread.role, latest ? latest.body : 'no messages yet'].join(' ').toLowerCase();
        return haystack.indexOf(query) !== -1;
      });
    }

    function renderThreadList() {
      clear(threadList);
      const threads = filteredThreads();
      listMeta.textContent = threads.length + ' of ' + appState.threads.length + ' threads';
      threadList.style.flex = threads.length ? '' : '1';

      if (!threads.length) {
        const empty = el('div', 'threads-empty');
        const inner = el('div', 'threads-empty__inner');
        const icon = el('span', 'threads-empty__icon');
        icon.appendChild(iconSvg('search'));
        append(inner, icon, el('h3', null, 'No threads match'), el('p', null, 'Try a different name, role or phrase.'));
        if (query) {
          const clearButton = makeButton('Clear search', 'btn btn--secondary btn--sm', function () {
            query = '';
            if (searchInput) searchInput.value = '';
            appState.searchQuery = '';
            renderThreadList();
            const first = threadList.querySelector('.thread');
            if (first) first.focus();
          });
          inner.appendChild(clearButton);
        }
        empty.appendChild(inner);
        threadList.appendChild(empty);
        return;
      }

      threads.forEach(function (thread) {
        const latest = lastMessage(thread);
        const itemWrap = el('div', 'thread-item');
        itemWrap.setAttribute('role', 'listitem');
        const button = el('button', 'thread');
        button.type = 'button';
        button.setAttribute('data-thread-id', thread.id);
        button.setAttribute('aria-current', String(thread.id === appState.selectedThreadId));
        button.setAttribute('aria-label', thread.name + ', ' + thread.role + (thread.unread ? ', unread' : '') +
          (latest ? ', latest message: ' + latest.body : ', no messages yet') + ', ' + threadTime(thread.updated));
        const avatar = avatarEl(thread.name, thread.name.toLowerCase().replace(/\s+/g, '.') + '@stackly.example', '');
        const body = el('span', 'thread__copy');
        const nameRow = el('span', 'thread__name-row');
        append(nameRow, el('span', 'thread__name', thread.name));
        if (thread.unread) {
          const dot = el('span', 'thread__dot');
          dot.setAttribute('title', 'Unread');
          nameRow.appendChild(dot);
        }
        const snippet = latest ? latest.body : 'No messages yet';
        append(body,
          nameRow,
          el('span', 'thread__snippet', snippet),
          el('span', 'thread__role', thread.role)
        );
        const time = el('span', 'thread__time', threadTime(thread.updated));
        append(button, avatar, body, time);
        button.addEventListener('click', function () { selectThread(thread.id); });
        itemWrap.appendChild(button);
        threadList.appendChild(itemWrap);
      });
    }

    function messageDateLabel(iso) {
      const datePart = iso.slice(0, 10);
      if (datePart === DATA.meta.today) return 'Today';
      const yesterday = new Date(DATA.meta.now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (datePart === localISODate(yesterday)) return 'Yesterday';
      return formatDate(iso);
    }

    function buildConversationEmpty(title, text) {
      const empty = el('div', 'conversation-empty');
      const inner = el('div', 'conversation-empty__inner');
      const icon = el('span', 'conversation-empty__icon');
      icon.appendChild(iconSvg('chat'));
      append(inner, icon, el('h3', null, title), el('p', null, text));
      empty.appendChild(inner);
      return empty;
    }

    function renderConversation() {
      clear(conversation);
      const thread = threadById(appState.selectedThreadId);

      if (!thread) {
        conversation.appendChild(buildConversationEmpty('Choose a conversation', 'Select a thread to read the messages and reply.'));
        return;
      }

      const convoHead = el('div', 'conversation-head');
      const back = el('button', 'icon-button back-button');
      back.type = 'button';
      back.setAttribute('aria-label', 'Back to threads');
      back.appendChild(iconSvg('arrowLeft'));
      back.addEventListener('click', function () {
        inbox.classList.remove('is-reading');
        const target = threadList.querySelector('[data-thread-id="' + thread.id + '"]');
        if (target) target.focus();
      });
      const avatar = avatarEl(thread.name, thread.name.toLowerCase().replace(/\s+/g, '.') + '@stackly.example', '');
      const headCopy = el('div', 'conversation-head__copy');
      const convoTitle = el('h2', 'conversation-head__name', thread.name);
      convoTitle.setAttribute('tabindex', '-1');
      append(headCopy, convoTitle, el('span', 'conversation-head__role', thread.role));
      const spacer = el('span', 'conversation-head__spacer');
      const badge = el('span', 'status-pill', thread.unread ? 'Unread' : 'Read');
      append(convoHead, back, avatar, headCopy, spacer, badge);
      conversation.appendChild(convoHead);

      if (!thread.messages.length) {
        conversation.appendChild(buildConversationEmpty('No messages yet', 'Start the conversation below. Your message stays in this browser session only.'));
      } else {
        const scroll = el('div', 'messages-scroll');
        scroll.setAttribute('role', 'log');
        scroll.setAttribute('aria-label', 'Conversation with ' + thread.name);
        let lastDate = '';
        thread.messages.forEach(function (message) {
          const datePart = message.at.slice(0, 10);
          if (datePart !== lastDate) {
            scroll.appendChild(el('span', 'message-date', messageDateLabel(message.at)));
            lastDate = datePart;
          }
          const group = el('div', 'message-group' + (message.from === 'me' ? ' message-group--me' : ''));
          const bubble = el('div', 'message-bubble', message.body);
          const time = el('time', 'message-time', formatTime(message.at));
          time.dateTime = message.at;
          append(group, bubble, time);
          scroll.appendChild(group);
        });
        conversation.appendChild(scroll);
        scope.defer(function () {
          scroll.scrollTop = scroll.scrollHeight;
        });
      }

      const composer = el('form', 'composer');
      composer.setAttribute('aria-label', 'Write a message to ' + thread.name);
      const textarea = el('textarea');
      textarea.id = 'message-composer';
      textarea.setAttribute('placeholder', 'Write a message…');
      textarea.setAttribute('aria-label', 'Message to ' + thread.name);
      textarea.rows = 2;
      const foot = el('div', 'composer__foot');
      const hint = el('span', 'composer__hint', 'Ctrl + Enter sends · Enter adds a line');
      const send = el('button', 'btn btn--primary btn--sm', 'Send');
      send.type = 'submit';
      send.appendChild(iconSvg('send'));
      append(foot, hint, send);
      append(composer, textarea, foot);
      composer.addEventListener('submit', function (event) {
        event.preventDefault();
        const body = textarea.value.trim();
        if (!body) {
          textarea.focus();
          announce('Type a message before sending.');
          return;
        }
        const at = new Date().toISOString();
        thread.messages.push({ id: 'local-' + Date.now(), from: 'me', body: body, at: at });
        thread.updated = at;
        thread.unread = false;
        updateUnreadPill();
        renderThreadList();
        renderConversation();
        const nextTextarea = conversation.querySelector('textarea');
        if (nextTextarea) nextTextarea.focus();
        announce('Message sent to ' + thread.name + '.');
      });
      textarea.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (send) send.click();
        }
      });
      conversation.appendChild(composer);
    }

    function selectThread(id) {
      const thread = threadById(id);
      if (!thread) return;
      appState.selectedThreadId = id;
      thread.unread = false;
      inbox.classList.add('is-reading');
      updateUnreadPill();
      renderThreadList();
      renderConversation();
      const isMobile = window.matchMedia('(max-width: 900px)').matches;
      window.requestAnimationFrame(function () {
        if (isMobile) {
          const title = conversation.querySelector('.conversation-head__name');
          if (title) title.focus();
        } else {
          const target = threadList.querySelector('[data-thread-id="' + id + '"]');
          if (target) target.focus();
        }
      });
    }

    threadList.addEventListener('keydown', function (event) {
      const buttons = Array.from(threadList.querySelectorAll('.thread'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        buttons[Math.min(index + 1, buttons.length - 1)].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[Math.max(index - 1, 0)].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        buttons[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      }
    });

    updateUnreadPill();
    renderThreadList();
    renderConversation();

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        renderThreadList();
        if (query) announce('Showing ' + filteredThreads().length + ' matching threads.');
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Settings
   * ------------------------------------------------------------------ */

  function renderSettings(data, session) {
    const scope = createScope();
    const view = el('div', 'view view--settings');
    const commonPasswords = ['password', 'qwerty', '12345678', 'letmein', 'welcome', 'admin', 'iloveyou', 'stackly'];

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client workspace'),
      el('span', 'sep', null),
      el('span', null, 'Account')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Settings'),
      el('p', 'view__sub', 'Profile details, workspace preferences and account security. Changes to your name and company update the workspace immediately.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', 'Client account'),
      el('span', 'status-pill', 'Field plan')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const grid = el('div', 'settings-grid');
    const leftColumn = el('div', 'settings-column');
    const rightColumn = el('div', 'settings-column');

    function fieldError(input, errorNode, message) {
      if (message) {
        errorNode.textContent = message;
        errorNode.hidden = false;
        input.setAttribute('aria-invalid', 'true');
      } else {
        errorNode.textContent = '';
        errorNode.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    }

    /* Profile ------------------------------------------------------- */
    const profilePanel = el('section', 'panel settings-panel');
    profilePanel.setAttribute('aria-labelledby', 'profile-title');
    const profileHead = el('div', 'settings-panel__head');
    const profileHeadCopy = el('div');
    const profileTitle = el('h2', 'settings-panel__title', 'Profile');
    profileTitle.id = 'profile-title';
    append(profileHeadCopy, profileTitle, el('p', 'settings-panel__sub', 'How your name and company appear across the workspace.'));
    profileHead.appendChild(profileHeadCopy);
    const profileForm = el('form', 'settings-form');
    profileForm.noValidate = true;
    const profileGrid = el('div', 'form-grid');

    function makeField(labelText, id, type, value, options) {
      const opts = options || {};
      const field = el('div', 'field' + (opts.full ? ' field--full' : ''));
      const label = el('label', null, labelText);
      label.htmlFor = id;
      const input = el('input');
      input.id = id;
      input.name = id;
      input.type = type;
      input.value = value;
      if (opts.readonly) input.readOnly = true;
      if (opts.maxlength) input.maxLength = opts.maxlength;
      if (opts.autocomplete) input.autocomplete = opts.autocomplete;
      if (opts.describedby) input.setAttribute('aria-describedby', opts.describedby);
      append(field, label, input);
      if (opts.note) {
        const note = el('p', 'field__note', opts.note);
        if (opts.noteId) note.id = opts.noteId;
        field.appendChild(note);
      }
      if (opts.errorId) {
        const error = el('p', 'field__error');
        error.id = opts.errorId;
        error.hidden = true;
        input.setAttribute('aria-describedby', [opts.describedby, opts.errorId].filter(Boolean).join(' '));
        field.appendChild(error);
      }
      return { field: field, input: input };
    }

    const nameField = makeField('Full name', 'settings-name', 'text', session.name, {
      maxlength: 60,
      autocomplete: 'name',
      errorId: 'settings-name-error'
    });
    const emailField = makeField('Email', 'settings-email', 'email', session.email, {
      readonly: true,
      note: 'Email is tied to your sign-in and cannot be edited here.',
      noteId: 'settings-email-note',
      describedby: 'settings-email-note'
    });
    const companyField = makeField('Company', 'settings-company', 'text', session.company, {
      maxlength: 80,
      autocomplete: 'organization',
      errorId: 'settings-company-error'
    });
    const roleField = makeField('Role', 'settings-role', 'text', 'Client', {
      readonly: true,
      note: 'Client accounts manage their own journeys. Ask your consultant if this role needs to change.',
      noteId: 'settings-role-note',
      describedby: 'settings-role-note'
    });
    append(profileGrid, nameField.field, emailField.field, companyField.field, roleField.field);
    const profileActions = el('div', 'form-actions');
    const profileStatus = el('p', 'save-status');
    profileStatus.setAttribute('role', 'status');
    profileStatus.setAttribute('aria-live', 'polite');
    const profileSave = el('button', 'btn btn--primary', 'Save profile');
    profileSave.type = 'submit';
    append(profileActions, profileStatus, profileSave);
    append(profileForm, profileGrid, profileActions);
    append(profilePanel, profileHead, profileForm);
    leftColumn.appendChild(profilePanel);

    function nameProblem(value) {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 60) return 'Enter a name between 2 and 60 characters.';
      if (!/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(trimmed)) return 'Use letters, spaces, hyphens or apostrophes only.';
      return '';
    }

    function companyProblem(value) {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 80) return 'Enter a company name between 2 and 80 characters.';
      return '';
    }

    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const nameMessage = nameProblem(nameField.input.value);
      const companyMessage = companyProblem(companyField.input.value);
      fieldError(nameField.input, document.getElementById('settings-name-error'), nameMessage);
      fieldError(companyField.input, document.getElementById('settings-company-error'), companyMessage);
      if (nameMessage || companyMessage) {
        profileStatus.className = 'save-status';
        profileStatus.textContent = 'Check the highlighted fields.';
        if (nameMessage) nameField.input.focus();
        else companyField.input.focus();
        return;
      }

      const updated = Session.setSession({
        name: nameField.input.value.trim(),
        email: currentSession.email,
        company: companyField.input.value.trim(),
        role: currentSession.role,
        createdAt: currentSession.createdAt
      });
      if (!updated) {
        profileStatus.className = 'save-status';
        profileStatus.textContent = 'Profile could not be saved in this browser.';
        return;
      }
      currentSession = updated;
      refreshUserChrome();
      profileStatus.className = 'save-status is-success';
      profileStatus.textContent = 'Profile saved. Sidebar updated.';
      showToast('Profile updated across the workspace.');
      announce('Profile saved. Sidebar name updated to ' + currentSession.name + '.');
    });

    /* Preferences --------------------------------------------------- */
    const prefsPanel = el('section', 'panel settings-panel');
    prefsPanel.setAttribute('aria-labelledby', 'preferences-title');
    const prefsHead = el('div', 'settings-panel__head');
    const prefsCopy = el('div');
    const prefsTitle = el('h2', 'settings-panel__title', 'Preferences');
    prefsTitle.id = 'preferences-title';
    append(prefsCopy, prefsTitle, el('p', 'settings-panel__sub', 'Stored on this device only. You can change these at any time.'));
    prefsHead.appendChild(prefsCopy);
    const prefsForm = el('div', 'settings-form');
    const timezoneField = el('div', 'field');
    const timezoneLabel = el('label', null, 'Timezone');
    timezoneLabel.htmlFor = 'pref-timezone';
    const timezoneSelect = el('select');
    timezoneSelect.id = 'pref-timezone';
    timezoneSelect.name = 'pref-timezone';
    data.timezones.forEach(function (zone) {
      const option = el('option', null, zone.label);
      option.value = zone.value;
      if (zone.value === appState.prefs.timezone) option.selected = true;
      timezoneSelect.appendChild(option);
    });
    append(timezoneField, timezoneLabel, timezoneSelect);
    prefsForm.appendChild(timezoneField);

    const prefsList = el('div', 'prefs-list');
    const prefsStatus = el('p', 'settings-note');
    prefsStatus.setAttribute('role', 'status');
    prefsStatus.setAttribute('aria-live', 'polite');

    function applyPreferenceChange(message) {
      savePrefs();
      prefsStatus.textContent = message + ' Preferences saved on this device.';
      announce(message);
    }

    function switchRow(id, label, note, checked, onChange) {
      const row = el('label', 'switch-row');
      row.htmlFor = id;
      const copyWrap = el('span', 'switch-row__copy');
      append(copyWrap, el('span', 'switch-row__label', label), el('span', 'switch-row__note', note));
      const input = el('input', 'switch-input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = checked;
      const control = el('span', 'switch-control');
      control.setAttribute('aria-hidden', 'true');
      input.addEventListener('change', function () { onChange(input.checked); });
      append(row, copyWrap, input, control);
      return row;
    }

    prefsList.appendChild(switchRow('pref-digest', 'Weekly digest', 'A Monday summary of milestones, actions and unread messages.', appState.prefs.weeklyDigest, function (checked) {
      appState.prefs.weeklyDigest = checked;
      applyPreferenceChange('Weekly digest ' + (checked ? 'on' : 'off') + '.');
    }));
    prefsList.appendChild(switchRow('pref-email', 'Email notifications', 'Send milestone and document updates to ' + currentSession.email + '.', appState.prefs.emailNotifications, function (checked) {
      appState.prefs.emailNotifications = checked;
      applyPreferenceChange('Email notifications ' + (checked ? 'on' : 'off') + '.');
    }));
    prefsList.appendChild(switchRow('pref-compact', 'Compact density', 'Tighten padding and row heights across the workspace.', appState.prefs.compact, function (checked) {
      appState.prefs.compact = checked;
      applyDensity();
      applyPreferenceChange('Compact density ' + (checked ? 'on' : 'off') + '.');
    }));
    timezoneSelect.addEventListener('change', function () {
      appState.prefs.timezone = timezoneSelect.value;
      applyPreferenceChange('Timezone set to ' + timezoneSelect.options[timezoneSelect.selectedIndex].text + '.');
    });

    append(prefsForm, prefsList, prefsStatus);
    append(prefsPanel, prefsHead, prefsForm);
    leftColumn.appendChild(prefsPanel);

    /* Security ------------------------------------------------------ */
    const securityPanel = el('section', 'panel settings-panel');
    securityPanel.setAttribute('aria-labelledby', 'security-title');
    const securityHead = el('div', 'settings-panel__head');
    const securityCopy = el('div');
    const securityTitle = el('h2', 'settings-panel__title', 'Security');
    securityTitle.id = 'security-title';
    append(securityCopy, securityTitle, el('p', 'settings-panel__sub', 'Passwords are validated for this demo but never stored.'));
    securityHead.appendChild(securityCopy);
    const securityForm = el('form', 'settings-form');
    securityForm.noValidate = true;
    const securityFields = el('div', 'form-grid');
    const currentPassword = makeField('Current password', 'security-current', 'password', '', {
      autocomplete: 'current-password',
      full: true,
      errorId: 'security-current-error'
    });
    const newPassword = makeField('New password', 'security-new', 'password', '', {
      autocomplete: 'new-password',
      full: true,
      note: 'Use 10–72 characters with upper and lower case, a number and a symbol. No spaces.',
      noteId: 'security-new-help',
      describedby: 'security-new-help',
      errorId: 'security-new-error'
    });
    const confirmPassword = makeField('Confirm new password', 'security-confirm', 'password', '', {
      autocomplete: 'new-password',
      full: true,
      errorId: 'security-confirm-error'
    });
    append(securityFields, currentPassword.field, newPassword.field, confirmPassword.field);
    const securityMessage = el('p', 'security-message');
    securityMessage.setAttribute('role', 'status');
    securityMessage.setAttribute('aria-live', 'polite');
    const securityActions = el('div', 'form-actions');
    const securitySave = el('button', 'btn btn--secondary', 'Update password');
    securitySave.type = 'submit';
    append(securityActions, securityMessage, securitySave);
    append(securityForm, securityFields, securityActions);
    append(securityPanel, securityHead, securityForm);
    rightColumn.appendChild(securityPanel);

    function passwordRules(value) {
      return {
        length: value.length >= 10 && value.length <= 72,
        case: /[a-z]/.test(value) && /[A-Z]/.test(value),
        number: /\d/.test(value),
        symbol: /[^A-Za-z0-9\s]/.test(value),
        space: !/\s/.test(value)
      };
    }

    function isPersonal(value) {
      const lower = value.toLowerCase();
      const nameTokens = currentSession.name.toLowerCase().split(/\s+/).filter(function (token) { return token.length >= 2; });
      const emailLocal = currentSession.email.split('@')[0].toLowerCase();
      if (emailLocal.length >= 2 && lower.indexOf(emailLocal) !== -1) return true;
      return nameTokens.some(function (token) { return lower.indexOf(token) !== -1; });
    }

    function newPasswordProblem(value) {
      if (!value) return 'Choose a new password.';
      if (value.length < 10 || value.length > 72) return 'Use 10 to 72 characters.';
      if (/\s/.test(value)) return 'Remove spaces from the password.';
      if (commonPasswords.some(function (word) { return value.toLowerCase().indexOf(word) !== -1; })) return 'This password is too common. Choose something less predictable.';
      if (isPersonal(value)) return 'Don’t use your name or email address in the password.';
      const rules = passwordRules(value);
      if (!rules.case) return 'Include both lowercase and uppercase letters.';
      if (!rules.number) return 'Include at least one number.';
      if (!rules.symbol) return 'Include at least one symbol.';
      return '';
    }

    securityForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const currentMessage = currentPassword.input.value ? '' : 'Enter your current password.';
      const nextMessage = newPasswordProblem(newPassword.input.value);
      let confirmMessage = '';
      if (!confirmPassword.input.value) confirmMessage = 'Confirm your new password.';
      else if (confirmPassword.input.value !== newPassword.input.value) confirmMessage = 'Passwords do not match.';

      fieldError(currentPassword.input, document.getElementById('security-current-error'), currentMessage);
      fieldError(newPassword.input, document.getElementById('security-new-error'), nextMessage);
      fieldError(confirmPassword.input, document.getElementById('security-confirm-error'), confirmMessage);
      securityMessage.className = 'security-message';
      if (currentMessage || nextMessage || confirmMessage) {
        securityMessage.textContent = 'Check the highlighted fields.';
        securityMessage.classList.add('is-error');
        const firstInvalid = currentMessage ? currentPassword.input : (nextMessage ? newPassword.input : confirmPassword.input);
        firstInvalid.focus();
        announce('Password update failed. Check the highlighted fields.');
        return;
      }

      securitySave.disabled = true;
      securitySave.textContent = 'Updating…';
      securityMessage.textContent = 'Simulating password update…';
      scope.timeout(function () {
        securitySave.disabled = false;
        securitySave.textContent = 'Update password';
        currentPassword.input.value = '';
        newPassword.input.value = '';
        confirmPassword.input.value = '';
        fieldError(currentPassword.input, document.getElementById('security-current-error'), '');
        fieldError(newPassword.input, document.getElementById('security-new-error'), '');
        fieldError(confirmPassword.input, document.getElementById('security-confirm-error'), '');
        securityMessage.className = 'security-message is-success';
        securityMessage.textContent = 'Password updated (simulated). No credentials were stored.';
        announce('Password update simulated successfully. No credentials were stored.');
      }, 650);
    });

    /* Danger zone --------------------------------------------------- */
    const dangerPanel = el('section', 'panel settings-panel danger-zone');
    dangerPanel.setAttribute('aria-labelledby', 'danger-title');
    const dangerHead = el('div', 'settings-panel__head');
    const dangerCopy = el('div');
    const dangerTitle = el('h2', 'settings-panel__title', 'Danger zone');
    dangerTitle.id = 'danger-title';
    append(dangerCopy, dangerTitle, el('p', 'settings-panel__sub', 'Deletion is simulated in this concept workspace.'));
    dangerHead.appendChild(dangerCopy);
    const dangerText = el('p', 'danger-zone__copy', 'Deleting an account is normally permanent. This workspace only simulates the flow: no session, journey or document is ever removed here.');
    const dangerForm = el('form', 'danger-form');
    dangerForm.noValidate = true;
    const dangerField = el('div', 'field');
    const dangerLabel = el('label', null, 'Type ' + currentSession.email + ' to confirm');
    dangerLabel.htmlFor = 'danger-email';
    const dangerInput = el('input');
    dangerInput.id = 'danger-email';
    dangerInput.type = 'email';
    dangerInput.autocomplete = 'off';
    dangerInput.setAttribute('aria-describedby', 'danger-note');
    const dangerNote = el('p', 'field__note', 'The delete button stays disabled until the email matches exactly.');
    dangerNote.id = 'danger-note';
    append(dangerField, dangerLabel, dangerInput, dangerNote);
    const dangerDelete = el('button', 'btn btn--danger', 'Delete account');
    dangerDelete.type = 'button';
    dangerDelete.disabled = true;
    dangerForm.appendChild(dangerField);
    dangerForm.appendChild(dangerDelete);

    const confirmPanel = el('div', 'confirm-panel');
    confirmPanel.hidden = true;
    const confirmTitle = el('p', 'confirm-panel__title', 'Simulated deletion — confirm below');
    const confirmCopy = el('p', null, 'This is a simulation. No account, journey, document or session data will be deleted. Confirm below only to see the simulated completion state.');
    const confirmActions = el('div', 'confirm-panel__actions');
    const confirmCancel = el('button', 'btn btn--secondary btn--sm', 'Cancel');
    confirmCancel.type = 'button';
    const confirmDelete = el('button', 'btn btn--danger btn--sm', 'Confirm simulated deletion');
    confirmDelete.type = 'button';
    append(confirmActions, confirmCancel, confirmDelete);
    const confirmResult = el('p', 'confirm-panel__title');
    confirmResult.hidden = true;
    confirmResult.textContent = 'Simulation complete. Your account and session are unchanged.';
    append(confirmPanel, confirmTitle, confirmCopy, confirmActions, confirmResult);
    confirmPanel.insertBefore(confirmResult, confirmActions);
    dangerForm.appendChild(confirmPanel);
    append(dangerPanel, dangerHead, dangerText, dangerForm);
    rightColumn.appendChild(dangerPanel);

    dangerInput.addEventListener('input', function () {
      const matches = dangerInput.value.trim() === currentSession.email;
      dangerDelete.disabled = !matches;
      if (!matches) {
        confirmPanel.hidden = true;
        confirmResult.hidden = true;
        confirmActions.hidden = false;
      }
    });

    dangerDelete.addEventListener('click', function () {
      if (dangerDelete.disabled) return;
      confirmPanel.hidden = false;
      confirmResult.hidden = true;
      confirmActions.hidden = false;
      confirmDelete.focus();
      announce('Simulated deletion confirmation opened. No data has been deleted.');
    });

    confirmCancel.addEventListener('click', function () {
      confirmPanel.hidden = true;
      dangerDelete.focus();
    });

    confirmDelete.addEventListener('click', function () {
      confirmResult.hidden = false;
      confirmActions.hidden = true;
      confirmPanel.classList.add('is-confirmed');
      announce('Simulated deletion confirmed. No account or session data was removed.');
      showToast('Simulation only — your account and session are unchanged.');
    });

    append(grid, leftColumn, rightColumn);
    view.appendChild(grid);

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  renderRoute(false);
})();
