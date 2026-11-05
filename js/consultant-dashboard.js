/* Stackly Tourism consultant dashboard — SPA shell, client scope, hash router and eight views. */
(function () {
  'use strict';

  const Session = window.StacklySession;
  const Charts = window.Charts;
  const DATA = window.ConsultantData;

  if (!Session || !Charts || !DATA) {
    console.error('[Stackly] Consultant dashboard dependencies missing (session.js / charts.js / consultant-data.js).');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1' && !Session.getSession()) {
    console.warn('[Stackly] Demo consultant session seeded because ?demo=1 was present. Data is illustrative only.');
    Session.setSession({
      name: 'Demo Consultant',
      email: 'demo.consultant@stackly.example',
      company: 'Demo Consultancy',
      role: 'consultant',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    });
  }

  let currentSession = Session.requireRole('consultant');
  if (!currentSession) return;

  const app = document.getElementById('app');
  const viewRoot = document.getElementById('view-root');
  const main = document.getElementById('main');
  const announcer = document.getElementById('route-announcer');
  const toastNode = document.getElementById('toast');
  const searchInput = document.getElementById('workspace-search');
  const scopeSelect = document.querySelector('[data-client-scope]');
  const scopeStrip = document.querySelector('[data-scope-strip]');
  const scopeName = document.querySelector('[data-scope-name]');
  const scopeClear = document.querySelector('[data-scope-clear]');
  const utilizationValue = document.querySelector('[data-utilization-value]');
  const utilizationBar = document.querySelector('[data-utilization-bar]');
  const utilizationNote = document.querySelector('[data-utilization-note]');
  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches);
  const PREFS_KEY = 'zstackly.consultant.prefs.v1';
  let toastTimer = 0;
  let activeView = null;
  let activeRoute = 'overview';
  let drawerOpen = false;
  let detailCloseHandler = null;
  let openPopoverName = '';
  let drawerTrigger = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
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
      if (Array.isArray(child)) child.forEach(function (item) { if (item !== null && item !== undefined) parent.appendChild(item); });
      else parent.appendChild(child);
    }
    return parent;
  }
  function clear(node) { if (node) while (node.firstChild) node.removeChild(node.firstChild); }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  function localISODate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }

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
    if (iso.slice(0, 10) === DATA.meta.today) return formatTime(iso);
    const yesterday = new Date(DATA.meta.now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (iso.slice(0, 10) === localISODate(yesterday)) return 'Yesterday';
    return formatDayMonth(iso);
  }
  function firstName(name) {
    const trimmed = String(name || '').trim();
    return trimmed ? trimmed.split(/\s+/)[0] : 'there';
  }
  function avatarEl(name, email, className) {
    const node = el('span', 'avatar' + (className ? ' ' + className : ''), Session.initials(name, email));
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('--avatar-bg', Session.avatarColor(name, email));
    return node;
  }
  function setAvatar(node, name, email) {
    if (!node) return;
    node.textContent = Session.initials(name, email);
    node.style.setProperty('--avatar-bg', Session.avatarColor(name, email));
  }
  function statusChip(status, label) {
    const map = {
      'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked', complete: 'Complete', draft: 'Draft'
    };
    const chip = el('span', 'status-chip', null);
    chip.setAttribute('data-status', status);
    append(chip, el('span', 'status-chip__dot'), el('span', null, label || map[status] || 'Unknown'));
    return chip;
  }
  function deliverableStatus(status) {
    const map = {
      Complete: 'complete', 'In progress': 'on-track', Review: 'at-risk', Blocked: 'blocked'
    };
    return statusChip(map[status] || 'draft', status);
  }
  function healthInfo(health) {
    if (health >= 80) return { key: 'healthy', label: 'Healthy', status: 'on-track', color: '--chart-2' };
    if (health >= 60) return { key: 'watch', label: 'Watch', status: 'at-risk', color: '--chart-1' };
    if (health >= 40) return { key: 'at-risk', label: 'At risk', status: 'blocked', color: '--chart-4' };
    return { key: 'churned', label: 'Churned', status: 'draft', color: '--chart-5' };
  }
  function healthChip(health) {
    const info = healthInfo(health);
    return statusChip(info.status, info.label);
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
    append(wrapper, track, el('span', 'progress__value', value + '%'));
    return wrapper;
  }
  function emptyState(options) {
    const wrapper = el('div', 'empty-state consultant-empty');
    const icon = el('span', 'empty-state__icon');
    icon.appendChild(iconSvg(options.icon || 'search'));
    append(wrapper, icon, el('h3', null, options.title || 'Nothing here yet'), el('p', null, options.text || ''));
    if (options.actionLabel) {
      const button = el('button', 'btn btn--secondary btn--sm', options.actionLabel);
      button.type = 'button';
      if (options.onAction) button.addEventListener('click', options.onAction);
      wrapper.appendChild(button);
    }
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
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 20 20');
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = paths;
    return node;
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
        id = window.setTimeout(function () { if (!destroyed) fn(); }, delay);
        cleanups.push(function () { window.clearTimeout(id); });
        return id;
      },
      defer: function (fn) {
        let inner = 0;
        const outer = window.requestAnimationFrame(function () {
          inner = window.requestAnimationFrame(function () { if (!destroyed) fn(); });
          cleanups.push(function () { window.cancelAnimationFrame(inner); });
        });
        cleanups.push(function () { window.cancelAnimationFrame(outer); });
      },
      add: function (fn) { if (typeof fn === 'function') cleanups.push(fn); },
      isDestroyed: function () { return destroyed; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        cleanups.splice(0).forEach(function (cleanup) {
          try { cleanup(); } catch (error) { /* navigation must continue */ }
        });
        Charts.tooltip.hide();
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
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (error) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* storage can be unavailable */ }
  }
  function loadPrefs() {
    const defaults = clone(DATA.preferences);
    defaults.rateCard = clone(DATA.rateCard);
    const saved = readJSON(PREFS_KEY);
    if (!saved || typeof saved !== 'object') return defaults;
    const merged = Object.assign({}, defaults, saved);
    merged.rateCard = Array.isArray(saved.rateCard) && saved.rateCard.length ? saved.rateCard : defaults.rateCard;
    return merged;
  }
  function savePrefs() { writeJSON(PREFS_KEY, appState.prefs); }
  function applyDensity() {
    if (app) app.setAttribute('data-density', appState.prefs.compact ? 'compact' : 'comfortable');
  }
  function currencyMeta() {
    return DATA.currencies.find(function (item) { return item.value === appState.prefs.currency; }) || DATA.currencies[0];
  }
  function formatMoney(value, decimals) {
    const meta = currencyMeta();
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: meta.value,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: decimals === undefined ? 0 : decimals
    }).format(value);
  }
  function formatMoneyShort(value) {
    const meta = currencyMeta();
    const abs = Math.abs(value);
    if (abs >= 1000000) return meta.symbol + (value / 1000000).toFixed(1) + 'm';
    if (abs >= 1000) return meta.symbol + (value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + 'k';
    return meta.symbol + Math.round(value);
  }
  function trendEnding(value, seed, length) {
    const count = length || 12;
    const points = [];
    for (let index = 0; index < count; index += 1) {
      if (index === count - 1) {
        points.push(value);
      } else {
        const ratio = 0.76 + (index / (count - 1)) * 0.24;
        points.push(Math.max(0, Math.round(value * ratio + Math.sin(index * 0.9 + seed) * value * 0.015)));
      }
    }
    return points;
  }
  function buildHash(route, clientId) {
    return '#/' + route + (clientId ? '?client=' + encodeURIComponent(clientId) : '');
  }
  function findClient(id) {
    return DATA.clients.find(function (client) { return client.id === id; }) || null;
  }
  function scopedClient() {
    return appState.scopeId ? findClient(appState.scopeId) : null;
  }
  function scopedClients() {
    return appState.scopeId ? DATA.clients.filter(function (client) { return client.id === appState.scopeId; }) : DATA.clients.slice();
  }
  function scopedMembers() {
    if (!appState.scopeId) return DATA.members.slice();
    return DATA.members.filter(function (member) { return member.clientIds.indexOf(appState.scopeId) !== -1; });
  }
  function scopeUtilization() {
    if (!appState.scopeId) return DATA.utilizationAverage;
    const members = scopedMembers();
    if (!members.length) return 0;
    return Math.round(members.reduce(function (total, member) { return total + member.average; }, 0) / members.length);
  }
  function consultantUtilization() {
    return DATA.utilizationAverage;
  }
  function setPrefs(patch) {
    appState.prefs = Object.assign({}, appState.prefs, patch);
    savePrefs();
    applyDensity();
    refreshUserChrome();
  }

  const appState = {
    searchQuery: '',
    scopeId: null,
    notifications: clone(DATA.notifications),
    threads: clone(DATA.threads),
    selectedThreadId: DATA.threads.length ? DATA.threads[0].id : null,
    timesheets: clone(DATA.timesheets),
    prefs: loadPrefs()
  };

  const ICONS = {
    dot: '<circle cx="10" cy="10" r="2"/>',
    search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
    calendar: '<rect x="2.5" y="4.5" width="15" height="12"/><path d="M2.5 8.5h15M6 2.5v4M14 2.5v4M6 12h3M11 12h3"/>',
    alert: '<path d="M10 3 18 17H2z"/><path d="M10 8v4M10 14.5v.1"/>',
    flag: '<path d="M5 17V3.5c3-1.5 6 1.5 10 0V12c-4 1.5-7-1.5-10 0"/>',
    chat: '<path d="M3 4.5h14v9H9l-4 3v-3H3z"/><path d="M6 8h8M6 10.5h5"/>',
    check: '<path d="m4 10.5 4 4 8-9"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>',
    arrowLeft: '<path d="M17 10H3M8 5l-5 5 5 5"/>',
    send: '<path d="M3 10 17.5 3l-4 14.5-2.8-5.7z"/><path d="m10.7 11.8 6.8-8.8"/>',
    download: '<path d="M10 2.5v10M6 9l4 4 4-4M3.5 16.5h13"/>',
    upload: '<path d="M10 13.5v-10M6 7l4-4 4 4M3.5 16.5h13"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>'
  };

  /* ------------------------------------------------------------------ *
   * Shell
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
  const mobileQuery = window.matchMedia('(max-width: 900px)');

  function refreshUserChrome() {
    const name = currentSession.name;
    const email = currentSession.email;
    const company = currentSession.company;
    document.querySelectorAll('[data-user-name]').forEach(function (node) { node.textContent = name; });
    document.querySelectorAll('[data-user-company]').forEach(function (node) { node.textContent = company; });
    document.querySelectorAll('[data-user-avatar], [data-topbar-avatar]').forEach(function (node) { setAvatar(node, name, email); });
    if (userMenuAvatar) setAvatar(userMenuAvatar, name, email);
    if (userMenuName) userMenuName.textContent = name;
    if (userMenuEmail) userMenuEmail.textContent = email;
    document.querySelectorAll('[data-user-link]').forEach(function (node) {
      node.setAttribute('aria-label', 'Open account settings for ' + name);
    });
    if (userMenuToggle) userMenuToggle.setAttribute('aria-label', 'Open account menu for ' + name);
    if (demoFlag) demoFlag.hidden = !/^demo[._-]/i.test(email);
    const utilization = consultantUtilization();
    if (utilizationValue) utilizationValue.textContent = utilization + '%';
    if (utilizationBar) utilizationBar.style.width = utilization + '%';
    if (utilizationNote) {
      utilizationNote.textContent = 'Target ' + appState.prefs.capacityTarget + '% · ' + appState.prefs.weeklyAvailability + 'h availability';
    }
    const utilizationChip = document.querySelector('.utilization-chip');
    if (utilizationChip) {
      utilizationChip.setAttribute('aria-label', utilization + ' percent utilized, capacity target ' + appState.prefs.capacityTarget + ' percent');
      utilizationChip.setAttribute('data-target', String(appState.prefs.capacityTarget));
    }
  }

  function unreadThreads() {
    return appState.threads.reduce(function (total, thread) { return total + (thread.unread ? 1 : 0); }, 0);
  }

  function updateNavBadges() {
    const clientsBadge = document.querySelector('[data-nav-badge="clients"]');
    if (clientsBadge) clientsBadge.textContent = String(DATA.clients.length);
    const inboxBadge = document.querySelector('[data-nav-badge="inbox"]');
    if (inboxBadge) {
      const count = unreadThreads();
      inboxBadge.hidden = count === 0;
      inboxBadge.textContent = count ? String(count) : '';
    }
    document.querySelectorAll('.side-link[data-route]').forEach(function (link) {
      const route = link.getAttribute('data-route');
      if (route === 'inbox') {
        const count = unreadThreads();
        link.setAttribute('aria-label', count ? 'Inbox, ' + count + ' unread' : 'Inbox');
      } else if (route === 'clients') {
        link.setAttribute('aria-label', 'Clients, ' + DATA.clients.length + ' total');
      }
    });
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
    if (notifCount) notifCount.textContent = notes.length ? notes.length + ' new' : 'Clear';
    if (notifToggle) {
      notifToggle.setAttribute('aria-label', notes.length ? 'Notifications, ' + notes.length + ' open alerts' : 'Notifications, no open alerts');
    }
    notes.forEach(function (note) {
      const item = el('div', 'notification');
      const link = el('a', 'notification__main');
      link.href = note.route;
      const dot = el('span', 'notification__dot');
      dot.setAttribute('aria-hidden', 'true');
      if (note.type === 'schedule') dot.style.background = 'var(--chart-5)';
      const copy = el('span', 'notification__copy');
      append(copy,
        el('span', 'notification__title', note.title),
        el('span', 'notification__body', note.body),
        el('span', 'notification__time', relativeTime(note.at) + ' · ' + note.type)
      );
      append(link, dot, copy);
      link.addEventListener('click', function () { closePopovers(false); });
      const dismiss = el('button', 'notification__dismiss', '×');
      dismiss.type = 'button';
      dismiss.setAttribute('aria-label', 'Dismiss alert: ' + note.title);
      dismiss.addEventListener('click', function () {
        appState.notifications = appState.notifications.filter(function (candidate) { return candidate.id !== note.id; });
        renderNotifications();
        announce('Alert dismissed.');
        if (notifToggle) notifToggle.focus();
      });
      append(item, link, dismiss);
      notifList.appendChild(item);
    });
  }

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

  if (notifToggle) notifToggle.addEventListener('click', function () { togglePopover('notifications'); });
  if (userMenuToggle) userMenuToggle.addEventListener('click', function () { togglePopover('account'); });
  if (userMenu) {
    userMenu.addEventListener('click', function (event) {
      if (event.target.closest('a, button')) closePopovers(false);
    });
  }
  if (signOutButton) {
    signOutButton.addEventListener('click', function () {
      Session.clearSession();
      window.location.href = 'login.html';
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

  if (drawerOpenButton) drawerOpenButton.addEventListener('click', function () { setDrawer(drawerOpenButton.getAttribute('aria-expanded') !== 'true', true); });
  if (drawerCloseButton) drawerCloseButton.addEventListener('click', function () { setDrawer(false, true); });
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', function () { setDrawer(false, true); });
  document.querySelectorAll('.side-link').forEach(function (link) {
    link.addEventListener('click', function () { if (drawerOpen) setDrawer(false, false); });
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

  function handleMobileChange(event) {
    if (!event.matches && drawerOpen) setDrawer(false, false);
  }
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleMobileChange);
  else if (mobileQuery.addListener) mobileQuery.addListener(handleMobileChange);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (detailCloseHandler) { detailCloseHandler(true); return; }
      if (openPopoverName) { closePopovers(true); return; }
      if (drawerOpen) { setDrawer(false, true); return; }
    }
    trapDrawerFocus(event);
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
    searchInput.addEventListener('input', function () { setSearchValue(searchInput.value); });
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && searchInput.value) {
        event.stopPropagation();
        setSearchValue('');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Scope control
   * ------------------------------------------------------------------ */

  function buildScopeOptions() {
    if (!scopeSelect) return;
    clear(scopeSelect);
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All clients';
    scopeSelect.appendChild(all);
    DATA.clients.forEach(function (client) {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = client.name;
      scopeSelect.appendChild(option);
    });
  }

  function syncScopeUI() {
    if (scopeSelect) scopeSelect.value = appState.scopeId || '';
    const client = scopedClient();
    if (scopeStrip) scopeStrip.hidden = !client;
    if (scopeName) scopeName.textContent = client ? client.name : '';
    document.querySelectorAll('.side-link[data-route]').forEach(function (link) {
      link.href = buildHash(link.getAttribute('data-route'), appState.scopeId);
    });
    document.querySelectorAll('.brand').forEach(function (link) {
      link.href = buildHash('overview', appState.scopeId);
    });
    document.querySelectorAll('[data-user-link]').forEach(function (link) {
      link.href = buildHash('settings', appState.scopeId);
    });
    if (userMenu) {
      const profile = userMenu.querySelector('a[href^="#/settings"]');
      if (profile) profile.href = buildHash('settings', appState.scopeId);
    }
  }

  function changeScope(id) {
    const next = id && findClient(id) ? id : null;
    if (next === appState.scopeId) {
      syncScopeUI();
      return;
    }
    const route = ROUTES[activeRoute] ? activeRoute : 'overview';
    window.location.hash = buildHash(route, next);
  }

  if (scopeSelect) {
    scopeSelect.addEventListener('change', function () { changeScope(scopeSelect.value || null); });
  }
  if (scopeClear) {
    scopeClear.addEventListener('click', function () { changeScope(null); });
  }

  /* ------------------------------------------------------------------ *
   * Router
   * ------------------------------------------------------------------ */

  const ROUTES = {
    overview: { title: 'Overview', search: 'Search this workspace', render: renderOverview },
    clients: { title: 'Clients', search: 'Search clients…', render: renderClients },
    engagements: { title: 'Engagements', search: 'Search engagements…', render: renderEngagements },
    capacity: { title: 'Capacity', search: 'Search this workspace', render: renderCapacity },
    revenue: { title: 'Revenue', search: 'Search this workspace', render: renderRevenue },
    deliverables: { title: 'Deliverables', search: 'Search deliverables…', render: renderDeliverables },
    inbox: { title: 'Inbox', search: 'Search conversations…', render: renderInbox },
    settings: { title: 'Settings', search: 'Search this workspace', render: renderSettings }
  };

  function parseRouteHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const queryIndex = raw.indexOf('?');
    const route = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).trim().toLowerCase() || 'overview';
    const query = new URLSearchParams(queryIndex === -1 ? '' : raw.slice(queryIndex + 1));
    return { route: route, clientId: query.get('client') || null };
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
      el('p', 'view__eyebrow', 'Consultant / Not found'),
      attrs(el('h1', 'view__title', 'This view doesn’t exist.'), { tabindex: '-1' }),
      el('p', 'view__sub', 'The address may be out of date. Return to the overview to keep working.')
    );
    append(head, copy);
    wrapper.appendChild(head);
    wrapper.appendChild(emptyState({
      icon: 'search',
      title: 'Nothing at this address',
      text: 'Check the link, or use the workspace navigation to choose a view.',
      actionLabel: 'Go to overview',
      onAction: function () { window.location.hash = buildHash('overview', appState.scopeId); }
    }));
    return wrapper;
  }

  function destroyActiveView() {
    if (activeView && activeView.destroy) activeView.destroy();
    activeView = null;
    if (detailCloseHandler) {
      try { detailCloseHandler(false); } catch (error) { /* ignore */ }
      detailCloseHandler = null;
    }
  }

  function renderRoute(announceRoute) {
    const parsed = parseRouteHash();
    let invalidScope = false;
    if (parsed.clientId && !findClient(parsed.clientId)) {
      invalidScope = true;
      parsed.clientId = null;
      try {
        window.history.replaceState(null, '', buildHash(ROUTES[parsed.route] ? parsed.route : 'overview', null));
      } catch (error) {
        window.location.hash = buildHash(ROUTES[parsed.route] ? parsed.route : 'overview', null);
      }
    }
    appState.scopeId = parsed.clientId;
    syncScopeUI();

    const route = ROUTES[parsed.route];
    const isKnown = Boolean(route);
    closePopovers(false);
    if (drawerOpen) setDrawer(false, false);
    destroyActiveView();
    clear(viewRoot);

    setSearchValue('');
    if (searchInput) searchInput.placeholder = isKnown ? route.search : 'Search this workspace';

    if (isKnown) {
      activeRoute = parsed.route;
      const context = {
        scopeId: appState.scopeId,
        scopeClient: scopedClient(),
        scoped: Boolean(appState.scopeId),
        setScope: changeScope,
        clearScope: function () { changeScope(null); },
        clearSearch: clearSearch
      };
      let result;
      try {
        result = route.render(DATA, currentSession, context);
      } catch (error) {
        console.error('[Stackly] Consultant view failed to render.', error);
        result = { node: renderNotFound() };
      }
      activeView = result;
      viewRoot.appendChild(result.node);
      setNavState(parsed.route);
      document.title = route.title + ' — Stackly Tourism Consultant';
      const title = document.querySelector('[data-view-title]');
      if (title) title.textContent = route.title;
    } else {
      activeRoute = 'overview';
      const node = renderNotFound();
      viewRoot.appendChild(node);
      activeView = { node: node, destroy: null };
      setNavState('');
      document.title = 'View not found — Stackly Tourism Consultant';
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

    if (announceRoute || announceRoute === undefined) {
      const client = scopedClient();
      const titleText = document.title.replace(' — Stackly Tourism Consultant', '');
      let message = titleText + ' view loaded.';
      message += client ? ' Scoped to ' + client.name + '.' : ' Showing all clients.';
      if (invalidScope) message = 'Unknown client scope. Showing all clients. ' + message;
      announce(message);
    }
  }

  window.addEventListener('hashchange', function () { renderRoute(true); });

  /* ------------------------------------------------------------------ *
   * View: Overview
   * ------------------------------------------------------------------ */

  function makeKpiCard(options) {
    const card = el('article', 'panel kpi');
    const top = el('div', 'kpi__top');
    const label = el('span', 'kpi__label', options.label);
    const delta = el('span', 'kpi__delta', options.delta);
    delta.setAttribute('data-tone', options.deltaTone || 'neutral');
    append(top, label, delta);
    const value = el('div', 'kpi__value', options.display);
    if (options.unit) value.appendChild(el('span', 'kpi__unit', options.unit));
    const host = el('div', 'kpi__spark');
    const chart = Charts.createChart({
      className: 'chart--micro',
      height: 42,
      label: options.chartLabel,
      render: function (width, context) {
        return {
          node: Charts.sparkline(options.series, width, context.height, {
            series: options.seriesIndex,
            color: 'chart-' + options.seriesIndex,
            lastDot: true,
            animate: context.animate
          })
        };
      },
      table: {
        caption: options.tableCaption,
        columns: options.tableColumns || ['Point', 'Value'],
        rows: options.tableRows
      }
    });
    host.appendChild(chart.figure);
    append(card, top, value, host);
    return { card: card, chart: chart };
  }

  function renderOverview(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--overview');
    const client = context.scopeClient;
    const clients = scopedClients();
    const scopeLabel = client ? client.name : 'Portfolio';

    const kpiValues = client ? {
      active: client.healthBand === 'churned' ? 0 : 1,
      health: client.health,
      utilization: scopeUtilization(),
      risk: (client.health < 60 || client.invoices.late) ? client.mrr : 0
    } : {
      active: data.summary.activeClients,
      health: data.summary.healthAverage,
      utilization: data.summary.utilizationAverage,
      risk: data.revenue.revenueAtRisk
    };

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, client ? 'Client command center' : 'Portfolio command center'),
      el('span', 'sep', null),
      el('span', null, scopeLabel)
    );
    const today = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Good morning, ' + firstName(session.name) + '.'),
      el('p', 'view__sub', client
        ? 'A focused read on ' + client.name + ': health, utilization, revenue exposure and the next decisions that need a consultant.'
        : 'A portfolio read across every client: health, utilization, revenue exposure and the accounts that need a consultant next.')
    );
    const dateRow = el('div', 'greeting-date');
    dateRow.appendChild(iconSvg('calendar'));
    append(dateRow, el('span', null, today), el('span', null, '·'), el('span', null, client ? 'Scoped client view' : 'All clients'));
    copy.appendChild(dateRow);
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', 'Consultant'),
      el('span', 'status-pill', data.summary.activeClients + ' active'),
      el('span', 'status-pill', DATA.utilizationAverage + '% utilized')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const kpiGrid = el('section', 'kpi-grid consultant-kpi-grid');
    kpiGrid.setAttribute('aria-label', client ? client.name + ' summary' : 'Portfolio summary');
    const activeSeries = client ? trendEnding(kpiValues.active, 3, 8) : data.portfolioKpis[0].series;
    const healthSeries = client ? client.healthTrend : data.portfolioKpis[1].series;
    const utilSeries = client ? trendEnding(kpiValues.utilization, 4, 12) : data.portfolioKpis[2].series;
    const riskSeries = client ? trendEnding(kpiValues.risk, 5, 12) : data.portfolioKpis[3].series;
    const scopedDelta = function (series, suffix) {
      const diff = series[series.length - 1] - series[series.length - 2];
      return (diff >= 0 ? '+' : '') + diff + (suffix || '');
    };
    const cardSet = [
      {
        id: 'active',
        label: client ? 'Active clients' : 'Active clients',
        display: String(kpiValues.active),
        value: kpiValues.active,
        delta: client ? '0 vs last week' : '+1 vs last month',
        deltaTone: client ? 'neutral' : 'positive',
        series: activeSeries,
        seriesIndex: 1,
        chartLabel: (client ? client.name : 'Portfolio') + ' active clients trend, latest value ' + kpiValues.active + '.',
        tableCaption: (client ? client.name : 'Portfolio') + ' active clients trend',
        tableRows: activeSeries.map(function (value, index) { return ['Point ' + (index + 1), value]; })
      },
      {
        id: 'health',
        label: client ? client.name + ' health' : 'Portfolio health score',
        display: String(kpiValues.health),
        value: kpiValues.health,
        delta: client ? scopedDelta(client.healthTrend) + ' pts vs last check' : '+3 pts vs last month',
        deltaTone: 'positive',
        series: healthSeries,
        seriesIndex: 2,
        chartLabel: (client ? client.name : 'Portfolio') + ' health trend, latest score ' + kpiValues.health + ' out of 100.',
        tableCaption: (client ? client.name : 'Portfolio') + ' health trend',
        tableRows: healthSeries.map(function (value, index) { return ['Check ' + (index + 1), value]; })
      },
      {
        id: 'utilization',
        label: client ? client.name + ' utilization' : 'Utilization this month',
        display: String(kpiValues.utilization),
        unit: '%',
        value: kpiValues.utilization,
        delta: client ? 'assigned team' : '+2 pts vs last month',
        deltaTone: 'positive',
        series: utilSeries,
        seriesIndex: 3,
        chartLabel: (client ? 'Assigned team utilization for ' + client.name : 'Portfolio utilization') + ', latest value ' + kpiValues.utilization + ' percent.',
        tableCaption: (client ? client.name : 'Portfolio') + ' utilization trend',
        tableRows: utilSeries.map(function (value, index) { return ['Point ' + (index + 1), value + '%']; })
      },
      {
        id: 'risk',
        label: client ? client.name + ' revenue at risk' : 'Revenue at risk',
        display: formatMoneyShort(kpiValues.risk),
        value: kpiValues.risk,
        delta: client ? (kpiValues.risk ? 'open exposure' : 'no exposure') : '-1.2k vs last month',
        deltaTone: kpiValues.risk ? 'negative' : 'neutral',
        series: riskSeries,
        seriesIndex: 4,
        chartLabel: (client ? client.name : 'Portfolio') + ' revenue at risk, latest value ' + formatMoney(kpiValues.risk) + '.',
        tableCaption: (client ? client.name : 'Portfolio') + ' revenue at risk trend',
        tableRows: riskSeries.map(function (value, index) { return ['Point ' + (index + 1), formatMoney(value)]; })
      }
    ];
    cardSet.forEach(function (cardOptions) {
      const result = makeKpiCard(cardOptions);
      charts.push(result.chart);
      kpiGrid.appendChild(result.card);
    });
    view.appendChild(kpiGrid);

    const overviewGrid = el('div', 'overview-grid');

    const revenuePanel = el('section', 'panel revenue-area-panel');
    const revenueHead = el('div', 'panel__head');
    const revenueCopy = el('div');
    const revenueTitle = el('h2', 'panel__title', (client ? client.name : 'Portfolio') + ' revenue');
    const revenueSub = el('p', 'panel__sub', 'Actual revenue over the selected window');
    append(revenueCopy, revenueTitle, revenueSub);
    const rangeSwitch = el('div', 'range-switch');
    rangeSwitch.setAttribute('role', 'group');
    rangeSwitch.setAttribute('aria-label', 'Revenue chart range');
    ['3m', '6m', '12m'].forEach(function (range) {
      const button = el('button', null, range);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(range === '6m'));
      button.setAttribute('data-range', range);
      button.addEventListener('click', function () { setRange(range); });
      rangeSwitch.appendChild(button);
    });
    append(revenueHead, revenueCopy, rangeSwitch);
    const revenueBody = el('div', 'panel__body chart-panel__body');
    const allRevenue = client ? client.monthlyActual : data.revenue.actual;
    const allLabels = data.revenue.months;

    function revenueSpec(range) {
      const count = range === '3m' ? 3 : (range === '6m' ? 6 : 12);
      const values = allRevenue.slice(-count);
      const labels = allLabels.slice(-count);
      const max = Charts.niceMax(Math.max.apply(null, values));
      return {
        height: 246,
        label: (client ? client.name : 'Portfolio') + ' actual revenue over the last ' + count + ' months, ending at ' + formatMoney(values[values.length - 1]) + '.',
        render: function (width, chartContext) {
          return Charts.areaLine(values, labels, width, chartContext.height, {
            animate: chartContext.animate,
            max: max,
            formatY: formatMoneyShort,
            formatValue: formatMoney,
            tooltipHeading: 'Actual revenue',
            keyboardLabel: 'Revenue area chart. Use arrow keys to inspect months.'
          });
        },
        table: {
          caption: (client ? client.name : 'Portfolio') + ' revenue, last ' + count + ' months',
          columns: ['Month', 'Revenue'],
          rows: values.map(function (value, index) { return [labels[index], formatMoney(value)]; })
        }
      };
    }
    const revenueChart = Charts.createChart(revenueSpec('6m'));
    charts.push(revenueChart);
    revenueBody.appendChild(revenueChart.figure);
    append(revenuePanel, revenueHead, revenueBody);

    function setRange(range) {
      rangeSwitch.querySelectorAll('button').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-range') === range));
      });
      revenueChart.update(revenueSpec(range));
      announce('Revenue range changed to ' + range + '.');
    }

    const healthPanel = el('section', 'panel');
    const healthHead = el('div', 'panel__head');
    const healthCopy = el('div');
    append(healthCopy,
      el('h2', 'panel__title', 'Client health distribution'),
      el('p', 'panel__sub', client ? client.name + ' status in the health model' : 'All client accounts, by health band')
    );
    healthHead.appendChild(healthCopy);
    const healthBody = el('div', 'panel__body');
    const segments = ['healthy', 'watch', 'at-risk', 'churned'].map(function (key) {
      const info = key === 'healthy'
        ? { label: 'Healthy', color: '--chart-2' }
        : key === 'watch'
          ? { label: 'Watch', color: '--chart-1' }
          : key === 'at-risk'
            ? { label: 'At risk', color: '--chart-4' }
            : { label: 'Churned', color: '--chart-5' };
      return {
        key: key,
        label: info.label,
        colorVar: info.color,
        value: clients.filter(function (item) { return item.healthBand === key; }).length
      };
    });
    const donutLayout = el('div', 'donut-layout');
    const donutChart = Charts.createChart({
      height: 176,
      label: 'Client health distribution. ' + segments.map(function (segment) { return segment.value + ' ' + segment.label.toLowerCase(); }).join(', ') + '. Total ' + clients.length + ' clients.',
      render: function (width, chartContext) {
        return {
          node: Charts.donut(segments, width, chartContext.height, {
            animate: chartContext.animate,
            centerValue: clients.length,
            centerLabel: 'clients'
          })
        };
      },
      table: {
        caption: 'Client health distribution',
        columns: ['Band', 'Clients', 'Share'],
        rows: segments.map(function (segment) {
          return [segment.label, segment.value, clients.length ? Math.round(segment.value / clients.length * 100) + '%' : '0%'];
        }).concat([['Total', clients.length, '100%']])
      }
    });
    charts.push(donutChart);
    donutLayout.appendChild(donutChart.figure);
    const donutLegend = el('div', 'donut-legend');
    function highlightHealth(key) {
      donutChart.figure.querySelectorAll('.donut__seg').forEach(function (segment) {
        segment.classList.toggle('is-muted', key ? segment.getAttribute('data-segment') !== key : false);
      });
      donutLegend.querySelectorAll('.legend__item').forEach(function (item) {
        item.classList.toggle('is-active', key ? item.getAttribute('data-key') === key : false);
      });
    }
    segments.forEach(function (segment) {
      const item = el('button', 'legend__item');
      item.type = 'button';
      item.setAttribute('data-key', segment.key);
      item.setAttribute('aria-label', 'Highlight ' + segment.label + ': ' + segment.value + ' clients.');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', 'var(' + segment.colorVar + ')');
      append(item, swatch, el('span', null, segment.label), el('span', 'legend__value', segment.value));
      item.addEventListener('mouseenter', function () { highlightHealth(segment.key); });
      item.addEventListener('mouseleave', function () { highlightHealth(''); });
      item.addEventListener('focus', function () { highlightHealth(segment.key); });
      item.addEventListener('blur', function () { highlightHealth(''); });
      donutLegend.appendChild(item);
    });
    donutLayout.appendChild(donutLegend);
    healthBody.appendChild(donutLayout);
    append(healthPanel, healthHead, healthBody);
    append(overviewGrid, revenuePanel, healthPanel);
    view.appendChild(overviewGrid);

    const lower = el('div', 'overview-lower');
    const attentionPanel = el('section', 'panel');
    const attentionHead = el('div', 'panel__head');
    const attentionCopy = el('div');
    append(attentionCopy,
      el('h2', 'panel__title', 'Accounts needing attention'),
      el('p', 'panel__sub', 'Rule-driven: health below 60, a milestone overdue, or an invoice late')
    );
    attentionHead.appendChild(attentionCopy);
    const attentionBody = el('div', 'panel__body');
    const attentionItems = data.attention.filter(function (item) {
      return !client || item.clientId === client.id;
    });
    if (!attentionItems.length) {
      attentionBody.appendChild(emptyState({
        icon: 'check',
        title: client ? client.name + ' is clear' : 'No accounts need attention',
        text: 'No health, milestone or invoice rule is currently triggered.',
        actionLabel: client ? 'View all clients' : null,
        onAction: context.clearScope
      }));
    } else {
      const list = el('div', 'attention-list');
      attentionItems.forEach(function (entry) {
        const attentionClient = findClient(entry.clientId);
        const row = el('div', 'attention-row');
        const link = el('a', 'attention-link');
        link.href = buildHash('clients', entry.clientId);
        append(link,
          el('span', 'attention-row__name', attentionClient.name),
          el('span', 'attention-row__reasons', entry.reasons.join(' · '))
        );
        const score = el('span', 'attention-row__score', attentionClient.health);
        append(row, link, score);
        list.appendChild(row);
      });
      attentionBody.appendChild(list);
    }
    append(attentionPanel, attentionHead, attentionBody);

    const schedulePanel = el('section', 'panel');
    const scheduleHead = el('div', 'panel__head');
    const scheduleCopy = el('div');
    append(scheduleCopy,
      el('h2', 'panel__title', 'This week'),
      el('p', 'panel__sub', 'Client reviews, workshops and check-ins')
    );
    scheduleHead.appendChild(scheduleCopy);
    const scheduleBody = el('div', 'panel__body');
    const scheduleItems = data.schedule.filter(function (item) { return !client || item.clientId === client.id; });
    if (!scheduleItems.length) {
      scheduleBody.appendChild(emptyState({
        icon: 'calendar',
        title: 'No sessions this week',
        text: 'The selected client has no reviews or workshops on the schedule.'
      }));
    } else {
      const strip = el('div', 'consultant-schedule');
      scheduleItems.forEach(function (item) {
        const card = el('article', 'schedule-card');
        append(card,
          el('span', 'schedule-card__time', item.day + ' · ' + item.time),
          el('span', 'schedule-card__title', item.title),
          el('span', 'schedule-card__meta', item.clientName + ' · ' + item.type)
        );
        strip.appendChild(card);
      });
      scheduleBody.appendChild(strip);
    }
    append(schedulePanel, scheduleHead, scheduleBody);
    append(lower, attentionPanel, schedulePanel);
    view.appendChild(lower);
    Charts.mountAll(scope, charts);

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * View: Engagements
   * ------------------------------------------------------------------ */

  function renderEngagements(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--engagements');
    const scopedEngagements = data.engagements.filter(function (engagement) {
      return !context.scopeId || engagement.clientId === context.scopeId;
    });
    let stageFilter = 'all';
    let clientFilter = 'all';
    let query = '';

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Delivery portfolio'),
      el('span', 'sep', null),
      el('span', null, context.scopeClient ? context.scopeClient.name : 'All clients')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Engagements'),
      el('p', 'view__sub', 'Six-row delivery strip with dependencies and a today marker, followed by the full engagement table. Filters respect the global client scope.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', scopedEngagements.length + ' active'),
      el('span', 'status-pill', scopedEngagements.filter(function (item) { return item.status === 'at-risk'; }).length + ' at risk'),
      el('span', 'status-pill', scopedEngagements.filter(function (item) { return item.status === 'blocked'; }).length + ' blocked')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const filterBar = el('div', 'consultant-filterbar');
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter engagements by stage');
    const chipButtons = {};
    [{ key: 'all', label: 'All stages' }].concat(DATA.meta.stages.map(function (stage) { return { key: stage, label: stage }; })).forEach(function (option) {
      const button = el('button', 'filter-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(option.key === 'all'));
      const count = option.key === 'all' ? scopedEngagements.length : scopedEngagements.filter(function (item) { return item.phase === option.key; }).length;
      append(button, el('span', null, option.label), el('span', 'filter-chip__count', count));
      button.addEventListener('click', function () {
        stageFilter = option.key;
        Object.keys(chipButtons).forEach(function (key) { chipButtons[key].setAttribute('aria-pressed', String(key === stageFilter)); });
        updateView();
      });
      chipButtons[option.key] = button;
      chips.appendChild(button);
    });
    const clientGroup = el('div', 'filter-group');
    const clientLabel = el('label', 'filter-group__label', 'Client');
    clientLabel.htmlFor = 'engagement-client-filter';
    const clientSelect = el('select', 'compact-select');
    clientSelect.id = 'engagement-client-filter';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All clients';
    clientSelect.appendChild(allOption);
    scopedClients().forEach(function (client) {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = client.name;
      clientSelect.appendChild(option);
    });
    clientSelect.addEventListener('change', function () {
      clientFilter = clientSelect.value;
      updateView();
    });
    append(clientGroup, clientLabel, clientSelect);
    append(filterBar, chips, clientGroup);
    view.appendChild(filterBar);

    const ganttPanel = el('section', 'panel engagement-panel');
    const ganttHead = el('div', 'panel__head');
    const ganttCopy = el('div');
    append(ganttCopy,
      el('h2', 'panel__title', 'Delivery strip'),
      el('p', 'panel__sub', 'Up to six current engagements, with dashed dependencies and today')
    );
    const ganttLegend = el('div', 'legend');
    [
      { label: 'On track', color: 'var(--chart-2)' },
      { label: 'At risk', color: 'var(--chart-1)' },
      { label: 'Blocked', color: 'var(--chart-4)' }
    ].forEach(function (item) {
      const legendItem = el('span', 'legend__item');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', item.color);
      append(legendItem, swatch, el('span', null, item.label));
      ganttLegend.appendChild(legendItem);
    });
    const todayLegend = el('span', 'legend__item');
    const todaySwatch = el('span', 'legend__swatch');
    todaySwatch.style.setProperty('--swatch', 'var(--accent)');
    todaySwatch.style.height = '1px';
    append(todayLegend, todaySwatch, el('span', null, 'Today / dependency'));
    ganttLegend.appendChild(todayLegend);
    append(ganttHead, ganttCopy, ganttLegend);
    const ganttBody = el('div', 'panel__body chart-panel__body');
    view.appendChild(ganttPanel);
    append(ganttPanel, ganttHead, ganttBody);

    const tablePanel = el('div', 'data-panel engagement-panel');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    ['Engagement', 'Client', 'Phase', 'Progress', 'Due date', 'Consultant', 'Status'].forEach(function (label) {
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

    function filteredEngagements() {
      return scopedEngagements.filter(function (engagement) {
        if (stageFilter !== 'all' && engagement.phase !== stageFilter) return false;
        if (clientFilter !== 'all' && engagement.clientId !== clientFilter) return false;
        if (!query) return true;
        return [engagement.name, engagement.clientName, engagement.phase, engagement.consultant]
          .join(' ').toLowerCase().indexOf(query) !== -1;
      });
    }

    function ganttSpec(items) {
      const phases = items.map(function (item) {
        return { id: item.id, name: item.name, start: item.start, end: item.end, status: item.status };
      });
      const ids = phases.map(function (phase) { return phase.id; });
      const dependencies = data.engagementWindow.dependencies.filter(function (dependency) {
        return ids.indexOf(dependency.from) !== -1 && ids.indexOf(dependency.to) !== -1;
      });
      return {
        height: 246,
        label: 'Delivery Gantt for ' + items.length + ' engagements. ' +
          items.map(function (item) {
            return item.name + ' runs week ' + item.start + ' to ' + item.end + ' for ' + item.clientName + ' and is ' + item.status;
          }).join('; ') + '. Today is marked at week ' + data.engagementWindow.today + '.',
        render: function (width, chartContext) {
          return Charts.gantt(phases, width, chartContext.height, {
            animate: chartContext.animate,
            range: 8,
            today: data.engagementWindow.today,
            dependencies: dependencies
          });
        },
        table: {
          caption: 'Current engagement delivery strip',
          columns: ['Engagement', 'Client', 'Start', 'End', 'Status'],
          rows: items.map(function (item) {
            return [item.name, item.clientName, 'W' + item.start, 'W' + item.end, statusMetaLabel(item.status)];
          })
        }
      };
    }

    function statusMetaLabel(status) {
      const map = { 'on-track': 'On track', 'at-risk': 'At risk', blocked: 'Blocked', complete: 'Complete' };
      return map[status] || status;
    }

    const ganttChart = Charts.createChart(ganttSpec(scopedEngagements.slice(0, 6)));
    charts.push(ganttChart);
    ganttBody.appendChild(ganttChart.figure);

    function renderTable(items) {
      clear(tbody);
      items.forEach(function (item) {
        const tr = el('tr');
        const nameCell = el('td');
        nameCell.setAttribute('data-col', 'name');
        nameCell.setAttribute('data-label', 'Engagement');
        append(nameCell, el('span', 'cell-title', item.name), el('span', 'cell-sub', 'W' + item.start + '–W' + item.end));
        const clientCell = el('td', null, item.clientName);
        clientCell.setAttribute('data-col', 'client');
        clientCell.setAttribute('data-label', 'Client');
        const phaseCell = el('td', null, item.phase);
        phaseCell.setAttribute('data-col', 'phase');
        phaseCell.setAttribute('data-label', 'Phase');
        const progressCell = el('td');
        progressCell.setAttribute('data-col', 'progress');
        progressCell.setAttribute('data-label', 'Progress');
        progressCell.appendChild(progressBar(item.progress, item.status));
        const dueCell = el('td');
        dueCell.setAttribute('data-col', 'due');
        dueCell.setAttribute('data-label', 'Due date');
        const time = el('time', 'table-date', formatDate(item.due));
        time.dateTime = item.due;
        dueCell.appendChild(time);
        const consultantCell = el('td', null, item.consultant);
        consultantCell.setAttribute('data-col', 'consultant');
        consultantCell.setAttribute('data-label', 'Consultant');
        const statusCell = el('td');
        statusCell.setAttribute('data-col', 'status');
        statusCell.setAttribute('data-label', 'Status');
        statusCell.appendChild(statusChip(item.status));
        append(tr, nameCell, clientCell, phaseCell, progressCell, dueCell, consultantCell, statusCell);
        tbody.appendChild(tr);
      });
    }

    function updateView() {
      const items = filteredEngagements();
      const hasItems = items.length > 0;
      ganttPanel.hidden = !hasItems;
      tablePanel.hidden = !hasItems;
      emptyHost.hidden = hasItems;
      if (hasItems) {
        ganttChart.update(ganttSpec(items.slice(0, 6)));
        renderTable(items);
        clear(emptyHost);
      } else {
        clear(emptyHost);
        const filtered = Boolean(query) || stageFilter !== 'all' || clientFilter !== 'all';
        emptyHost.appendChild(emptyState({
          icon: 'calendar',
          title: query ? 'No engagements match “' + query + '”' : 'No engagements in this filter',
          text: filtered ? 'Try a different stage, client or search term.' : 'Engagements will appear here when they are added.',
          actionLabel: filtered ? 'Clear filters' : null,
          onAction: function () {
            query = '';
            stageFilter = 'all';
            clientFilter = 'all';
            clientSelect.value = 'all';
            Object.keys(chipButtons).forEach(function (key) { chipButtons[key].setAttribute('aria-pressed', String(key === 'all')); });
            updateView();
            context.clearSearch();
          }
        }));
      }
    }

    updateView();
    Charts.mountAll(scope, charts);

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        updateView();
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Capacity
   * ------------------------------------------------------------------ */

  function renderCapacity(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--capacity');
    const members = scopedMembers();
    const scopeNameText = context.scopeClient ? context.scopeClient.name : 'All clients';
    let reviewMode = false;

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Team capacity'),
      el('span', 'sep', null),
      el('span', null, scopeNameText)
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Capacity'),
      el('p', 'view__sub', 'Twenty weeks of utilization, allocated versus available time, a twelve-week forecast and the current bench.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', members.length + ' team members'),
      el('span', 'status-pill', scopeUtilization() + '% utilized'),
      el('span', 'status-pill', data.bench.filter(function (member) { return members.some(function (item) { return item.id === member.id; }); }).length + ' on bench')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const grid = el('div', 'capacity-grid');

    const heatPanel = el('section', 'panel');
    const heatHead = el('div', 'panel__head');
    const heatCopy = el('div');
    append(heatCopy,
      el('h2', 'panel__title', 'Utilization heatmap'),
      el('p', 'panel__sub', 'Rows are team members; columns are the last 20 weeks')
    );
    const heatLegend = el('div', 'capacity-heatmap-legend');
    heatLegend.appendChild(el('span', null, 'Lower'));
    const heatScale = el('span', 'heat-scale');
    [1, 2, 3, 4, 5].forEach(function (level) {
      const cell = el('span');
      cell.setAttribute('data-level', String(level));
      heatScale.appendChild(cell);
    });
    heatLegend.appendChild(heatScale);
    heatLegend.appendChild(el('span', null, 'Higher'));
    append(heatHead, heatCopy, heatLegend);
    const heatBody = el('div', 'panel__body chart-panel__body');
    const heatRows = [];
    members.forEach(function (member) {
      member.weeks.forEach(function (value, weekIndex) {
        heatRows.push([member.name, data.weekLabels[weekIndex], value + '%']);
      });
    });
    const heatChart = Charts.createChart({
      height: 330,
      label: 'Utilization heatmap for ' + members.length + ' team members across 20 weeks. ' +
        members.map(function (member) { return member.name + ' averages ' + member.average + ' percent'; }).join('; ') + '.',
      render: function (width, chartContext) {
        return Charts.heatmap({
          rows: members.map(function (member) {
            return { label: member.name, values: member.weeks, detail: member.role };
          }),
          columns: data.weekLabels
        }, width, chartContext.height, {
          animate: chartContext.animate,
          labelWidth: 76,
          columnLabelEvery: 2,
          levelFor: function (value) {
            if (value < 55) return 1;
            if (value < 65) return 2;
            if (value < 75) return 3;
            if (value < 85) return 4;
            return 5;
          },
          formatValue: function (value) { return value + '%'; },
          keyboardLabel: 'Utilization heatmap. Use arrow keys to inspect team members and weeks.'
        });
      },
      table: {
        caption: 'Utilization by member and week',
        columns: ['Team member', 'Week', 'Utilization'],
        rows: heatRows
      }
    });
    charts.push(heatChart);
    heatBody.appendChild(heatChart.figure);
    append(heatPanel, heatHead, heatBody);
    grid.appendChild(heatPanel);

    const allocationPanel = el('section', 'panel');
    const allocationHead = el('div', 'panel__head');
    const allocationCopy = el('div');
    append(allocationCopy,
      el('h2', 'panel__title', 'Allocated vs available'),
      el('p', 'panel__sub', 'Recent four-week average against a 100% target')
    );
    const allocationLegend = el('div', 'legend');
    const allocatedLegend = el('span', 'legend__item');
    const allocatedSwatch = el('span', 'legend__swatch');
    allocatedSwatch.style.setProperty('--swatch', 'var(--chart-2)');
    append(allocatedLegend, allocatedSwatch, el('span', null, 'Allocated'));
    const availableLegend = el('span', 'legend__item');
    const availableSwatch = el('span', 'legend__swatch');
    availableSwatch.style.setProperty('--swatch', 'var(--dash-panel-3)');
    append(availableLegend, availableSwatch, el('span', null, 'Available'));
    const targetLegend = el('span', 'legend__item');
    const targetSwatch = el('span', 'legend__swatch');
    targetSwatch.style.setProperty('--swatch', 'var(--bone)');
    targetSwatch.style.height = '1px';
    append(targetLegend, targetSwatch, el('span', null, '100%'));
    append(allocationLegend, allocatedLegend, availableLegend, targetLegend);
    append(allocationHead, allocationCopy, allocationLegend);
    const allocationBody = el('div', 'panel__body chart-panel__body');
    const allocationRows = members.map(function (member) {
      return { name: member.name, allocated: member.allocated, available: member.available, target: 100 };
    });
    const allocationChart = Charts.createChart({
      height: 330,
      label: 'Allocated and available time for ' + members.length + ' team members. ' +
        members.map(function (member) { return member.name + ' is ' + member.allocated + ' percent allocated'; }).join('; ') + '.',
      render: function (width, chartContext) {
        return Charts.allocationBars(allocationRows, width, chartContext.height, {
          animate: chartContext.animate,
          target: 100,
          max: 100
        });
      },
      table: {
        caption: 'Allocated and available time',
        columns: ['Team member', 'Allocated', 'Available', 'Target'],
        rows: allocationRows.map(function (row) { return [row.name, row.allocated + '%', row.available + '%', '100%']; })
      }
    });
    charts.push(allocationChart);
    allocationBody.appendChild(allocationChart.figure);
    append(allocationPanel, allocationHead, allocationBody);
    grid.appendChild(allocationPanel);

    const forecastPanel = el('section', 'panel');
    const forecastHead = el('div', 'panel__head');
    const forecastCopy = el('div');
    append(forecastCopy,
      el('h2', 'panel__title', 'Twelve-week forecast'),
      el('p', 'panel__sub', 'Projected utilization with the 80% healthy band')
    );
    append(forecastHead, forecastCopy);
    const forecastBody = el('div', 'panel__body chart-panel__body');
    const forecastOffset = members.length
      ? Math.round(members.reduce(function (total, member) { return total + member.average; }, 0) / members.length) - DATA.utilizationAverage
      : 0;
    const forecastValues = data.forecastUtilization.map(function (value) { return clamp(value + forecastOffset, 0, 100); });
    const forecastLabels = forecastValues.map(function (_, index) { return 'W' + (index + 1); });
    const forecastChart = Charts.createChart({
      height: 230,
      label: 'Projected utilization for the next 12 weeks, from ' + forecastValues[0] + ' percent to ' + forecastValues[forecastValues.length - 1] + ' percent, with a healthy band around 80 percent.',
      render: function (width, chartContext) {
        return Charts.line(
          [{ name: 'Projected utilization', values: forecastValues, colorIndex: 1 }],
          forecastLabels,
          width,
          chartContext.height,
          {
            animate: chartContext.animate,
            max: 100,
            suffix: '%',
            band: { min: 78, max: 82, label: 'Healthy 80% band' },
            tooltipHeading: 'Projected utilization',
            keyboardLabel: 'Utilization forecast. Use arrow keys to inspect weeks.'
          }
        );
      },
      table: {
        caption: 'Projected utilization, next 12 weeks',
        columns: ['Week', 'Projected utilization'],
        rows: forecastValues.map(function (value, index) { return ['Week ' + (index + 1), value + '%']; })
      }
    });
    charts.push(forecastChart);
    forecastBody.appendChild(forecastChart.figure);
    append(forecastPanel, forecastHead, forecastBody);
    grid.appendChild(forecastPanel);

    const benchPanel = el('section', 'panel');
    const benchHead = el('div', 'panel__head');
    const benchCopy = el('div');
    append(benchCopy,
      el('h2', 'panel__title', 'Bench'),
      el('p', 'panel__sub', 'Members below 60% utilization')
    );
    append(benchHead, benchCopy);
    const benchBody = el('div', 'panel__body');
    const scopedBench = data.bench.filter(function (member) {
      return members.some(function (item) { return item.id === member.id; });
    });
    if (!scopedBench.length) {
      benchBody.appendChild(emptyState({
        icon: 'check',
        title: 'No one on the bench',
        text: 'Every scoped team member is above the 60% utilization threshold.'
      }));
    } else {
      const benchList = el('div', 'bench-list');
      scopedBench.forEach(function (member) {
        const row = el('div', 'bench-item');
        const copyBlock = el('div');
        append(copyBlock,
          el('span', 'bench-item__name', member.name),
          el('span', 'bench-item__meta', member.role + ' · ' + member.average + '% average utilization')
        );
        append(row, copyBlock, el('span', 'bench-item__days', member.benchDays + ' days available'));
        benchList.appendChild(row);
      });
      benchBody.appendChild(benchList);
    }
    append(benchPanel, benchHead, benchBody);
    grid.appendChild(benchPanel);

    const timesheetPanel = el('section', 'panel panel--full');
    const timesheetHead = el('div', 'panel__head');
    const timesheetCopy = el('div');
    append(timesheetCopy,
      el('h2', 'panel__title', 'Timesheets'),
      el('p', 'panel__sub', 'This week’s logged hours by client and the pending review queue')
    );
    const timesheetActions = el('div', 'view__actions');
    const timesheetToggle = el('button', 'btn btn--secondary btn--sm', 'Review entries');
    timesheetToggle.type = 'button';
    timesheetToggle.setAttribute('aria-pressed', 'false');
    timesheetActions.appendChild(timesheetToggle);
    append(timesheetHead, timesheetCopy, timesheetActions);
    const timesheetBody = el('div', 'panel__body');
    const timesheetLayout = el('div', 'timesheet-layout');
    const hoursHost = el('div');
    const reviewHost = el('div');
    reviewHost.hidden = true;
    append(timesheetLayout, hoursHost, reviewHost);
    timesheetBody.appendChild(timesheetLayout);
    append(timesheetPanel, timesheetHead, timesheetBody);
    grid.appendChild(timesheetPanel);

    function scopedTimesheets() {
      return appState.timesheets.filter(function (entry) {
        return !context.scopeId || entry.clientId === context.scopeId;
      });
    }

    function hoursByClient() {
      const map = {};
      scopedTimesheets().forEach(function (entry) {
        if (entry.status === 'rejected') return;
        map[entry.clientName] = (map[entry.clientName] || 0) + entry.hours;
      });
      return Object.keys(map).map(function (name) { return { name: name, value: Math.round(map[name] * 10) / 10 }; });
    }

    function hoursSpec() {
      const rows = hoursByClient();
      return {
        height: 232,
        label: 'Logged hours this week by client. ' + (rows.length ? rows.map(function (row) { return row.name + ' ' + row.value + ' hours'; }).join('; ') + '.' : 'No hours logged.'),
        render: function (width, chartContext) {
          return Charts.barsHorizontal(rows, width, chartContext.height, {
            animate: chartContext.animate,
            suffix: 'h',
            colorIndex: 2,
            formatValue: function (value) { return value + 'h'; }
          });
        },
        table: {
          caption: 'Logged hours by client this week',
          columns: ['Client', 'Logged hours'],
          rows: rows.map(function (row) { return [row.name, row.value + 'h']; })
        }
      };
    }

    const hoursChart = Charts.createChart(hoursSpec());
    charts.push(hoursChart);
    const hoursEmpty = el('div');
    hoursEmpty.hidden = true;
    append(hoursHost, hoursChart.figure, hoursEmpty);

    function renderHours() {
      const rows = hoursByClient();
      const hasRows = rows.length > 0;
      hoursChart.figure.hidden = !hasRows;
      hoursEmpty.hidden = hasRows;
      if (!hasRows) {
        clear(hoursEmpty);
        hoursEmpty.appendChild(emptyState({
          icon: 'clock',
          title: 'No hours logged yet',
          text: 'Approved and pending entries for this scope will appear here.'
        }));
      } else {
        clear(hoursEmpty);
        hoursChart.update(hoursSpec());
      }
    }

    function renderReview() {
      clear(reviewHost);
      const pending = scopedTimesheets().filter(function (entry) { return entry.status === 'pending'; });
      if (!pending.length) {
        reviewHost.appendChild(emptyState({
          icon: 'check',
          title: 'Review queue is clear',
          text: 'There are no pending timesheet entries for this scope.'
        }));
        return;
      }
      const table = el('table', 'data-table');
      const thead = el('thead');
      const row = el('tr');
      ['Member', 'Client', 'Date', 'Hours', 'Action'].forEach(function (label) {
        const th = el('th', null, label);
        th.scope = 'col';
        row.appendChild(th);
      });
      thead.appendChild(row);
      table.appendChild(thead);
      const tbody = el('tbody');
      pending.forEach(function (entry) {
        const tr = el('tr');
        const memberCell = el('td', null, entry.memberName);
        memberCell.setAttribute('data-col', 'name');
        memberCell.setAttribute('data-label', 'Member');
        const clientCell = el('td', null, entry.clientName);
        clientCell.setAttribute('data-col', 'client');
        clientCell.setAttribute('data-label', 'Client');
        const dateCell = el('td');
        dateCell.setAttribute('data-col', 'date');
        dateCell.setAttribute('data-label', 'Date');
        const time = el('time', 'table-date', formatDate(entry.date));
        time.dateTime = entry.date;
        dateCell.appendChild(time);
        const hoursCell = el('td', null, entry.hours + 'h');
        hoursCell.setAttribute('data-col', 'hours');
        hoursCell.setAttribute('data-label', 'Hours');
        const actionCell = el('td');
        actionCell.setAttribute('data-col', 'actions');
        const actionWrap = el('div', 'timesheet-row__actions');
        const approve = el('button', 'btn btn--primary btn--sm', 'Approve');
        approve.type = 'button';
        approve.setAttribute('aria-label', 'Approve ' + entry.hours + ' hours for ' + entry.memberName + ' at ' + entry.clientName);
        const reject = el('button', 'btn btn--ghost btn--sm', 'Reject');
        reject.type = 'button';
        reject.setAttribute('aria-label', 'Reject ' + entry.hours + ' hours for ' + entry.memberName + ' at ' + entry.clientName);
        approve.addEventListener('click', function () {
          entry.status = 'approved';
          announce('Approved ' + entry.hours + ' hours for ' + entry.memberName + ' at ' + entry.clientName + '.');
          showToast('Timesheet approved for ' + entry.memberName + '.');
          renderReview();
          renderHours();
          if (timesheetToggle) timesheetToggle.focus();
        });
        reject.addEventListener('click', function () {
          entry.status = 'rejected';
          announce('Rejected ' + entry.hours + ' hours for ' + entry.memberName + ' at ' + entry.clientName + '.');
          showToast('Timesheet rejected for ' + entry.memberName + '.');
          renderReview();
          renderHours();
          if (timesheetToggle) timesheetToggle.focus();
        });
        append(actionWrap, approve, reject);
        actionCell.appendChild(actionWrap);
        append(tr, memberCell, clientCell, dateCell, hoursCell, actionCell);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      reviewHost.appendChild(table);
    }

    function updateTimesheetMode() {
      timesheetToggle.setAttribute('aria-pressed', String(reviewMode));
      timesheetToggle.textContent = reviewMode ? 'View hours' : 'Review entries';
      hoursHost.hidden = reviewMode;
      reviewHost.hidden = !reviewMode;
      if (reviewMode) renderReview();
      else renderHours();
      announce(reviewMode ? 'Showing pending timesheet entries.' : 'Showing logged hours by client.');
    }

    timesheetToggle.addEventListener('click', function () {
      reviewMode = !reviewMode;
      updateTimesheetMode();
    });

    view.appendChild(grid);
    renderHours();
    Charts.mountAll(scope, charts);

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * View: Clients
   * ------------------------------------------------------------------ */

  function healthRing(health) {
    const info = healthInfo(health);
    const wrapper = el('div', 'health-cell');
    const ring = el('span', 'health-ring');
    ring.setAttribute('data-band', info.key);
    ring.style.setProperty('--pct', String(health));
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', 'Health score ' + health + ' out of 100, ' + info.label);
    ring.appendChild(el('span', null, String(health)));
    const copy = el('span', 'health-cell__copy');
    append(copy, el('span', 'health-cell__label', info.label));
    append(wrapper, ring, copy);
    return wrapper;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function renderClients(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--clients');
    const scoped = context.scopeClient;
    const clients = scopedClients();
    let statusFilter = 'all';
    let sortKey = 'health';
    let sortDir = -1;
    let query = '';

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client portfolio'),
      el('span', 'sep', null),
      el('span', null, scoped ? scoped.name : 'All clients')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Clients'),
      el('p', 'view__sub', scoped
        ? 'The scoped client record, health trend, commercial position and next review.'
        : 'Compare health, revenue and engagement stage across the portfolio. Health is scored out of 100 and revenue is monthly recurring.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', clients.length + (clients.length === 1 ? ' client' : ' clients')),
      el('span', 'status-pill', data.summary.healthAverage + ' avg health'),
      el('span', 'status-pill', formatMoney(data.summary.mrr) + ' MRR')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const scatterPanel = el('section', 'panel scatter-panel');
    const scatterHead = el('div', 'panel__head');
    const scatterCopy = el('div');
    append(scatterCopy,
      el('h2', 'panel__title', 'Health vs revenue'),
      el('p', 'panel__sub', 'Quadrant view — health score against monthly recurring revenue')
    );
    const scatterLegend = el('div', 'quadrant-legend');
    [
      { band: 'healthy', label: 'Healthy', color: '--chart-2' },
      { band: 'watch', label: 'Watch', color: '--chart-1' },
      { band: 'at-risk', label: 'At risk', color: '--chart-4' },
      { band: 'churned', label: 'Churned', color: '--chart-5' }
    ].forEach(function (entry) {
      const item = el('span', 'legend__item');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', 'var(' + entry.color + ')');
      append(item, swatch, el('span', null, entry.label), el('span', 'legend__value', clients.filter(function (client) { return client.healthBand === entry.band; }).length));
      scatterLegend.appendChild(item);
    });
    append(scatterHead, scatterCopy, scatterLegend);
    const scatterBody = el('div', 'panel__body chart-panel__body');
    const points = clients.map(function (client) {
      const info = healthInfo(client.health);
      return {
        id: client.id,
        label: client.name,
        x: client.health,
        y: client.mrr,
        colorIndex: info.key === 'healthy' ? 2 : info.key === 'watch' ? 1 : info.key === 'at-risk' ? 4 : 5
      };
    });
    const medianMrr = median(clients.map(function (client) { return client.mrr; }));
    const scatterChart = Charts.createChart({
      height: 300,
      label: 'Quadrant scatter of ' + points.length + ' clients by health score and monthly recurring revenue. ' +
        points.map(function (point) { return point.label + ': health ' + point.x + ', ' + formatMoney(point.y); }).join('; ') + '.',
      render: function (width, chartContext) {
        return Charts.quadrantScatter(points, width, chartContext.height, {
          animate: chartContext.animate,
          xLabel: 'Health score',
          yLabel: 'MRR',
          xMax: 100,
          yMax: Charts.niceMax(Math.max.apply(null, points.map(function (point) { return point.y; }))),
          xMid: 60,
          yMid: medianMrr,
          quadrants: { topLeft: 'Protect', topRight: 'Strategic', bottomLeft: 'Review', bottomRight: 'Nurture' },
          formatX: function (value) { return String(Math.round(value)); },
          formatY: formatMoneyShort,
          keyboardLabel: 'Client health and revenue scatter. Use the arrow keys to inspect clients.'
        });
      },
      table: {
        caption: 'Clients by health and MRR',
        columns: ['Client', 'Health', 'MRR', 'Band'],
        rows: clients.map(function (client) {
          return [client.name, client.health, formatMoney(client.mrr), healthInfo(client.health).label];
        })
      }
    });
    charts.push(scatterChart);
    scatterBody.appendChild(scatterChart.figure);
    append(scatterPanel, scatterHead, scatterBody);
    view.appendChild(scatterPanel);

    const toolbar = el('div', 'view-toolbar');
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter clients by health band');
    const chipButtons = {};
    [{ key: 'all', label: 'All' }, { key: 'healthy', label: 'Healthy' }, { key: 'watch', label: 'Watch' }, { key: 'at-risk', label: 'At risk' }, { key: 'churned', label: 'Churned' }].forEach(function (option) {
      const button = el('button', 'filter-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(option.key === 'all'));
      const count = option.key === 'all' ? clients.length : clients.filter(function (client) { return client.healthBand === option.key; }).length;
      append(button, el('span', null, option.label), el('span', 'filter-chip__count', count));
      button.addEventListener('click', function () {
        statusFilter = option.key;
        Object.keys(chipButtons).forEach(function (key) { chipButtons[key].setAttribute('aria-pressed', String(key === statusFilter)); });
        renderRows();
      });
      chipButtons[option.key] = button;
      chips.appendChild(button);
    });
    const tableCount = el('p', 'toolbar-note');
    tableCount.setAttribute('aria-live', 'polite');
    append(toolbar, chips, tableCount);
    view.appendChild(toolbar);

    const tablePanel = el('div', 'data-panel');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    const nameTh = el('th', null, 'Client');
    nameTh.scope = 'col';
    const industryTh = el('th', null, 'Industry');
    industryTh.scope = 'col';
    const stageTh = el('th', null, 'Stage');
    stageTh.scope = 'col';
    const healthTh = el('th');
    healthTh.scope = 'col';
    const mrrTh = el('th');
    mrrTh.scope = 'col';
    const reviewTh = el('th');
    reviewTh.scope = 'col';
    const ownerTh = el('th', null, 'Owner');
    ownerTh.scope = 'col';

    function sortButton(key, label) {
      const button = el('button', 'sort-button');
      button.type = 'button';
      append(button, el('span', null, label), el('span', 'sort-arrow', '→'));
      button.setAttribute('aria-label', 'Sort clients by ' + label);
      button.addEventListener('click', function () {
        if (sortKey === key) sortDir *= -1;
        else {
          sortKey = key;
          sortDir = key === 'health' || key === 'mrr' ? -1 : 1;
        }
        updateSortHeaders();
        renderRows();
      });
      return button;
    }
    healthTh.appendChild(sortButton('health', 'Health'));
    mrrTh.appendChild(sortButton('mrr', 'MRR'));
    reviewTh.appendChild(sortButton('review', 'Next review'));
    append(headRow, nameTh, industryTh, stageTh, healthTh, mrrTh, reviewTh, ownerTh);
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
      [healthTh, mrrTh, reviewTh].forEach(function (th) {
        th.setAttribute('aria-sort', 'none');
      });
      if (sortKey === 'health') healthTh.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      if (sortKey === 'mrr') mrrTh.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      if (sortKey === 'review') reviewTh.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      [healthTh, mrrTh, reviewTh].forEach(function (th) {
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        const sorted = th === (sortKey === 'health' ? healthTh : sortKey === 'mrr' ? mrrTh : reviewTh);
        arrow.textContent = sorted ? (sortDir === 1 ? '→' : '→') : '→';
      });
    }

    function visibleClients() {
      return clients.filter(function (client) {
        if (statusFilter !== 'all' && client.healthBand !== statusFilter) return false;
        if (!query) return true;
        return [client.name, client.industry, client.stage, client.owner].join(' ').toLowerCase().indexOf(query) !== -1;
      }).sort(function (a, b) {
        if (sortKey === 'health') return (a.health - b.health) * sortDir;
        if (sortKey === 'mrr') return (a.mrr - b.mrr) * sortDir;
        return (Date.parse(a.nextReview) - Date.parse(b.nextReview)) * sortDir;
      });
    }

    function openClientDrawer(client, trigger) {
      if (detailCloseHandler) detailCloseHandler(false);
      const drawerScope = createScope();
      const drawerCharts = [];
      const backdrop = el('button', 'detail-backdrop');
      backdrop.type = 'button';
      backdrop.setAttribute('aria-label', 'Close client detail');
      const drawer = el('aside', 'detail-drawer');
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-labelledby', 'client-detail-title');
      const drawerHead = el('div', 'detail-drawer__head');
      const titleWrap = el('div');
      append(titleWrap,
        el('p', 'detail-drawer__eyebrow', client.industry + ' · ' + client.stage),
        el('h2', 'detail-drawer__title', client.name)
      );
      titleWrap.querySelector('.detail-drawer__title').id = 'client-detail-title';
      const closeButton = el('button', 'icon-button');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close client detail');
      closeButton.appendChild(iconSvg('close'));
      append(drawerHead, titleWrap, closeButton);
      const drawerBody = el('div', 'detail-drawer__body');

      const avatarRow = el('div', 'consultant-avatar-row');
      avatarRow.appendChild(avatarEl(client.name, client.name.toLowerCase().replace(/\s+/g, '.') + '@consultant.example'));
      const avatarCopy = el('div', 'consultant-avatar-row__copy');
      append(avatarCopy, el('strong', null, client.owner), el('span', null, 'Account owner · next review ' + formatDate(client.nextReview)));
      avatarRow.appendChild(avatarCopy);
      avatarRow.appendChild(healthRing(client.health));
      drawerBody.appendChild(avatarRow);

      const trendBlock = el('div', 'drawer-block');
      const trendHead = el('div', 'drawer-block__head');
      append(trendHead, el('h3', 'drawer-block__title', 'Health trend'), el('span', 'quarter-note', 'Last 8 checks'));
      trendBlock.appendChild(trendHead);
      const trendChart = Charts.createChart({
        height: 140,
        label: 'Health trend for ' + client.name + ', ending at ' + client.health + ' out of 100.',
        render: function (width, chartContext) {
          return Charts.line(
            [{ name: 'Health', values: client.healthTrend, colorIndex: 2 }],
            ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
            width,
            chartContext.height,
            {
              animate: chartContext.animate,
              max: 100,
              suffix: '/100',
              tooltipHeading: 'Health score',
              xTickCount: 8,
              keyboardLabel: 'Health trend chart. Use arrow keys to inspect checks.'
            }
          );
        },
        table: {
          caption: client.name + ' health trend',
          columns: ['Check', 'Score'],
          rows: client.healthTrend.map(function (value, index) { return ['Check ' + (index + 1), value + '/100']; })
        }
      });
      drawerCharts.push(trendChart);
      trendBlock.appendChild(trendChart.figure);
      drawerBody.appendChild(trendBlock);

      const stageBlock = el('div', 'drawer-block');
      const stageHead = el('div', 'drawer-block__head');
      append(stageHead, el('h3', 'drawer-block__title', 'Engagement stage split'), el('span', 'quarter-note', 'share of effort'));
      const stageBar = el('div', 'stack-bar');
      stageBar.setAttribute('role', 'img');
      stageBar.setAttribute('aria-label', 'Stage split for ' + client.name + ': ' + DATA.meta.stages.map(function (stage, index) {
        return stage + ' ' + client.stageSplit[index] + ' percent';
      }).join(', ') + '.');
      const stageColors = ['--chart-1', '--chart-2', '--chart-4', '--chart-3', '--chart-5'];
      client.stageSplit.forEach(function (value, index) {
        const segment = el('span', 'stack-bar__seg');
        segment.style.width = value + '%';
        segment.style.background = 'var(' + stageColors[index % stageColors.length] + ')';
        stageBar.appendChild(segment);
      });
      const stageLegend = el('div', 'stage-legend');
      DATA.meta.stages.forEach(function (stage, index) {
        const row = el('div', 'stage-legend__item');
        const dot = el('span', 'stage-legend__dot');
        dot.style.background = 'var(' + stageColors[index % stageColors.length] + ')';
        append(row, dot, el('span', null, stage), el('span', 'stage-legend__value', client.stageSplit[index] + '%'));
        stageLegend.appendChild(row);
      });
      const stageTable = el('table', 'mini-table');
      stageTable.appendChild(el('caption', 'sr-only', 'Engagement stage split'));
      const stageThead = el('thead');
      const stageHeadRow = el('tr');
      append(stageHeadRow, el('th', null, 'Stage'), el('th', null, 'Share'));
      stageThead.appendChild(stageHeadRow);
      stageTable.appendChild(stageThead);
      const stageTbody = el('tbody');
      DATA.meta.stages.forEach(function (stage, index) {
        const row = el('tr');
        append(row, el('td', null, stage), el('td', null, client.stageSplit[index] + '%'));
        stageTbody.appendChild(row);
      });
      stageTable.appendChild(stageTbody);
      const stageToggle = el('button', 'chart__toggle', 'View as table');
      stageToggle.type = 'button';
      const stageTableWrap = el('div', 'chart__table');
      stageTableWrap.hidden = true;
      stageTableWrap.appendChild(stageTable);
      stageToggle.addEventListener('click', function () {
        const opening = stageTableWrap.hidden;
        stageTableWrap.hidden = !opening;
        stageToggle.setAttribute('aria-expanded', String(opening));
        stageToggle.textContent = opening ? 'Hide table' : 'View as table';
      });
      stageToggle.setAttribute('aria-expanded', 'false');
      append(stageBlock, stageHead, stageBar, stageLegend, stageToggle, stageTableWrap);
      drawerBody.appendChild(stageBlock);

      const deliverableBlock = el('div', 'drawer-block');
      const deliverableHead = el('div', 'drawer-block__head');
      const openDeliverables = data.deliverables.filter(function (item) {
        return item.clientId === client.id && item.status !== 'Complete';
      });
      append(deliverableHead, el('h3', 'drawer-block__title', 'Open deliverables'), el('span', 'quarter-note', openDeliverables.length + ' open'));
      const deliverableList = el('div', 'drawer-list');
      if (!openDeliverables.length) {
        deliverableList.appendChild(el('p', 'drawer-list__meta', 'No open deliverables for this client.'));
      } else {
        openDeliverables.forEach(function (item) {
          const row = el('div', 'drawer-list__item');
          const titleRow = el('div', 'drawer-block__head');
          append(titleRow, el('span', 'drawer-list__title', item.name), deliverableStatus(item.status));
          append(row, titleRow, el('span', 'drawer-list__meta', item.owner + ' · due ' + formatDate(item.due)));
          deliverableList.appendChild(row);
        });
      }
      append(deliverableBlock, deliverableHead, deliverableList);
      drawerBody.appendChild(deliverableBlock);

      const touchBlock = el('div', 'drawer-block');
      const touchHead = el('div', 'drawer-block__head');
      append(touchHead, el('h3', 'drawer-block__title', 'Recent touchpoints'), el('span', 'quarter-note', 'Last 3'));
      const touchList = el('div', 'drawer-list');
      client.touchpoints.slice(0, 3).forEach(function (touchpoint) {
        const row = el('div', 'drawer-list__item');
        append(row,
          el('span', 'drawer-list__channel', touchpoint.channel + ' · ' + relativeTime(touchpoint.at)),
          el('span', 'drawer-list__meta', touchpoint.summary)
        );
        touchList.appendChild(row);
      });
      append(touchBlock, touchHead, touchList);
      drawerBody.appendChild(touchBlock);

      const scopeAction = el('button', 'btn btn--primary', context.scopeId === client.id ? 'Scoped to this client' : 'Set scope to this client');
      scopeAction.type = 'button';
      scopeAction.disabled = context.scopeId === client.id;
      scopeAction.addEventListener('click', function () {
        close(true);
        context.setScope(client.id);
      });
      const actionBlock = el('div', 'drawer-block');
      actionBlock.appendChild(scopeAction);
      drawerBody.appendChild(actionBlock);

      drawer.appendChild(drawerHead);
      drawer.appendChild(drawerBody);
      app.appendChild(backdrop);
      app.appendChild(drawer);
      Charts.mountAll(drawerScope, drawerCharts);

      let closed = false;
      function close(returnFocus) {
        if (closed) return;
        closed = true;
        if (detailCloseHandler === closeHandler) detailCloseHandler = null;
        drawerScope.destroy();
        backdrop.classList.remove('is-open');
        drawer.classList.remove('is-open');
        const restore = returnFocus && trigger && document.contains(trigger);
        window.setTimeout(function () {
          if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          if (!document.querySelector('.detail-drawer') && !drawerOpen) document.body.classList.remove('drawer-open');
          if (restore) trigger.focus();
        }, reducedMotion ? 0 : 280);
      }
      function closeHandler(returnFocus) { close(returnFocus); }
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
      const rows = visibleClients();
      clear(tbody);
      rows.forEach(function (client) {
        const tr = el('tr', 'is-clickable');
        const nameCell = el('td');
        nameCell.setAttribute('data-col', 'name');
        nameCell.setAttribute('data-label', 'Client');
        const openButton = el('button', 'cell-title', client.name);
        openButton.type = 'button';
        append(nameCell, openButton, el('span', 'cell-sub', client.owner));
        openButton.addEventListener('click', function () { openClientDrawer(client, openButton); });
        tr.addEventListener('click', function (event) {
          if (event.target.closest('button, a')) return;
          openClientDrawer(client, openButton);
        });
        const industryCell = el('td', null, client.industry);
        industryCell.setAttribute('data-col', 'industry');
        industryCell.setAttribute('data-label', 'Industry');
        const stageCell = el('td', null, client.stage);
        stageCell.setAttribute('data-col', 'stage');
        stageCell.setAttribute('data-label', 'Stage');
        const healthCell = el('td');
        healthCell.setAttribute('data-col', 'health');
        healthCell.setAttribute('data-label', 'Health');
        healthCell.appendChild(healthRing(client.health));
        const mrrCell = el('td', null, formatMoney(client.mrr));
        mrrCell.setAttribute('data-col', 'mrr');
        mrrCell.setAttribute('data-label', 'MRR');
        const reviewCell = el('td');
        reviewCell.setAttribute('data-col', 'review');
        reviewCell.setAttribute('data-label', 'Next review');
        const time = el('time', 'table-date', formatDate(client.nextReview));
        time.dateTime = client.nextReview;
        reviewCell.appendChild(time);
        const ownerCell = el('td', null, client.owner);
        ownerCell.setAttribute('data-col', 'owner');
        ownerCell.setAttribute('data-label', 'Owner');
        append(tr, nameCell, industryCell, stageCell, healthCell, mrrCell, reviewCell, ownerCell);
        tbody.appendChild(tr);
      });

      tablePanel.hidden = rows.length === 0;
      emptyHost.hidden = rows.length !== 0;
      if (!rows.length) {
        clear(emptyHost);
        const filtered = Boolean(query) || statusFilter !== 'all';
        emptyHost.appendChild(emptyState({
          icon: 'search',
          title: query ? 'No clients match “' + query + '”' : 'No clients in this health band',
          text: filtered ? 'Try a different name, industry or reset the health filter.' : 'Client records will appear here.',
          actionLabel: filtered ? 'Clear filters' : null,
          onAction: function () {
            query = '';
            statusFilter = 'all';
            Object.keys(chipButtons).forEach(function (key) { chipButtons[key].setAttribute('aria-pressed', String(key === 'all')); });
            renderRows();
            context.clearSearch();
          }
        }));
      }
      tableCount.textContent = (query || statusFilter !== 'all')
        ? 'Showing ' + rows.length + ' of ' + clients.length + ' clients'
        : clients.length + ' clients · sorted by ' + (sortKey === 'health' ? 'health' : sortKey === 'mrr' ? 'MRR' : 'next review');
      updateSortHeaders();
    }

    updateSortHeaders();
    renderRows();
    Charts.mountAll(scope, charts);

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
   * View: Revenue
   * ------------------------------------------------------------------ */

  function renderRevenue(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--revenue');
    const client = context.scopeClient;
    const scopedClientList = scopedClients();
    const actual = client ? client.monthlyActual : data.revenue.actual;
    const forecast = client ? client.monthlyForecast : data.revenue.forecast;
    const mrr = client ? client.mrr : data.revenue.mrr;
    const arr = mrr * 12;
    const forecastCurrent = forecast[forecast.length - 1];
    const invoiceTotals = client ? client.invoices : data.revenue.invoiceTotals;
    const overdue = invoiceTotals.overdue;
    const overdueTrend = client ? client.overdueTrend : data.revenue.overdueTrend;
    const months = data.revenue.months;
    const scopeLabel = client ? client.name : 'Portfolio';

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Commercial view'),
      el('span', 'sep', null),
      el('span', null, scopeLabel)
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Revenue'),
      el('p', 'view__sub', 'Recurring revenue, the forecast gap, client concentration and invoice exposure for the selected scope.')
    );
    const reportStatus = el('p', 'report-status');
    reportStatus.setAttribute('role', 'status');
    reportStatus.setAttribute('aria-live', 'polite');
    reportStatus.textContent = 'Revenue table ready for export.';
    copy.appendChild(reportStatus);

    const csvButton = el('button', 'btn btn--primary', 'Download CSV');
    csvButton.type = 'button';
    csvButton.appendChild(iconSvg('download'));
    const actions = el('div', 'view__actions');
    actions.appendChild(csvButton);
    append(head, copy, actions);
    view.appendChild(head);

    function deltaFor(series) {
      if (series.length < 2) return '0%';
      const previous = series[series.length - 2] || 1;
      const current = series[series.length - 1];
      const diff = previous ? ((current - previous) / previous) * 100 : 0;
      return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '% vs last month';
    }

    const kpiGrid = el('section', 'kpi-grid consultant-kpi-grid');
    kpiGrid.setAttribute('aria-label', scopeLabel + ' revenue summary');
    const arrSeries = actual.map(function (value) { return value * 12; });
    [
      {
        label: client ? client.name + ' MRR' : 'Portfolio MRR',
        display: formatMoney(mrr),
        series: actual,
        seriesIndex: 2,
        delta: deltaFor(actual),
        chartLabel: scopeLabel + ' monthly recurring revenue over 12 months. Latest value ' + formatMoney(mrr) + '.',
        caption: scopeLabel + ' MRR trend',
        values: actual
      },
      {
        label: client ? client.name + ' ARR' : 'Portfolio ARR',
        display: formatMoney(arr),
        series: arrSeries,
        seriesIndex: 1,
        delta: deltaFor(actual),
        chartLabel: scopeLabel + ' annual recurring revenue based on the latest month. Latest value ' + formatMoney(arr) + '.',
        caption: scopeLabel + ' ARR trend',
        values: arrSeries
      },
      {
        label: client ? client.name + ' forecast' : 'Portfolio forecast',
        display: formatMoney(forecastCurrent),
        series: forecast,
        seriesIndex: 3,
        delta: deltaFor(forecast),
        chartLabel: scopeLabel + ' forecast revenue over 12 months. Latest forecast ' + formatMoney(forecastCurrent) + '.',
        caption: scopeLabel + ' forecast trend',
        values: forecast
      },
      {
        label: client ? client.name + ' overdue' : 'Overdue invoices',
        display: formatMoney(overdue),
        series: overdueTrend,
        seriesIndex: 4,
        delta: overdue ? 'open invoice exposure' : 'none overdue',
        deltaTone: overdue ? 'negative' : 'neutral',
        chartLabel: scopeLabel + ' overdue invoice trend. Latest value ' + formatMoney(overdue) + '.',
        caption: scopeLabel + ' overdue trend',
        values: overdueTrend
      }
    ].forEach(function (options) {
      const card = makeKpiCard({
        label: options.label,
        display: options.display,
        delta: options.delta,
        deltaTone: options.deltaTone,
        series: options.series,
        seriesIndex: options.seriesIndex,
        chartLabel: options.chartLabel,
        tableCaption: options.caption,
        tableRows: options.values.map(function (value, index) {
          return [months[index] || 'Point ' + (index + 1), formatMoney(value)];
        })
      });
      charts.push(card.chart);
      kpiGrid.appendChild(card.card);
    });
    view.appendChild(kpiGrid);

    const revenueGrid = el('div', 'revenue-grid');

    const comparePanel = el('section', 'panel');
    const compareHead = el('div', 'panel__head');
    const compareCopy = el('div');
    append(compareCopy,
      el('h2', 'panel__title', 'Revenue vs forecast'),
      el('p', 'panel__sub', 'Twelve months, with the forecast series de-emphasised')
    );
    const compareLegend = el('div', 'legend');
    [{ label: 'Actual', color: 'var(--chart-1)' }, { label: 'Forecast', color: 'var(--chart-2)' }].forEach(function (entry) {
      const item = el('span', 'legend__item');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', entry.color);
      if (entry.label === 'Forecast') swatch.style.opacity = '.45';
      append(item, swatch, el('span', null, entry.label));
      compareLegend.appendChild(item);
    });
    append(compareHead, compareCopy, compareLegend);
    const compareBody = el('div', 'panel__body chart-panel__body');
    const compareChart = Charts.createChart({
      height: 300,
      label: 'Actual versus forecast revenue over 12 months. Actual total ' + formatMoney(actual.reduce(function (total, value) { return total + value; }, 0)) + '; forecast total ' + formatMoney(forecast.reduce(function (total, value) { return total + value; }, 0)) + '.',
      render: function (width, chartContext) {
        return Charts.barsGrouped(months, [
          { name: 'Actual', values: actual, colorIndex: 1 },
          { name: 'Forecast', values: forecast, colorIndex: 2, opacity: 0.45 }
        ], width, chartContext.height, {
          animate: chartContext.animate,
          formatY: formatMoneyShort,
          formatValue: formatMoney
        });
      },
      table: {
        caption: scopeLabel + ' revenue vs forecast',
        columns: ['Month', 'Actual', 'Forecast'],
        rows: months.map(function (month, index) {
          return [month, formatMoney(actual[index]), formatMoney(forecast[index])];
        })
      }
    });
    charts.push(compareChart);
    compareBody.appendChild(compareChart.figure);
    append(comparePanel, compareHead, compareBody);

    const treemapPanel = el('section', 'panel');
    const treemapHead = el('div', 'panel__head');
    const treemapCopy = el('div');
    append(treemapCopy,
      el('h2', 'panel__title', 'Revenue by client'),
      el('p', 'panel__sub', 'Area is proportional to MRR; labels simplify on narrow screens')
    );
    append(treemapHead, treemapCopy);
    const treemapBody = el('div', 'panel__body chart-panel__body');
    const treemapNodes = scopedClientList.map(function (item) {
      return { id: item.id, label: item.name, value: item.mrr };
    });
    const treemapTotal = treemapNodes.reduce(function (total, node) { return total + node.value; }, 0);
    const treemapChart = Charts.createChart({
      height: 300,
      label: 'Revenue treemap for ' + treemapNodes.length + ' clients. ' +
        treemapNodes.map(function (node) { return node.label + ' ' + formatMoney(node.value); }).join('; ') + '.',
      render: function (width, chartContext) {
        return Charts.treemap(treemapNodes, width, chartContext.height, {
          animate: chartContext.animate,
          formatValue: formatMoney,
          keyboardLabel: 'Revenue treemap. Use arrow keys to inspect clients.'
        });
      },
      table: {
        caption: 'Revenue by client',
        columns: ['Client', 'MRR', 'Share'],
        rows: treemapNodes.map(function (node) {
          return [node.label, formatMoney(node.value), treemapTotal ? Math.round(node.value / treemapTotal * 100) + '%' : '0%'];
        }).concat([['Total', formatMoney(treemapTotal), '100%']])
      }
    });
    charts.push(treemapChart);
    treemapBody.appendChild(treemapChart.figure);
    append(treemapPanel, treemapHead, treemapBody);
    append(revenueGrid, comparePanel, treemapPanel);
    view.appendChild(revenueGrid);

    const secondary = el('div', 'revenue-secondary');

    const invoicePanel = el('section', 'panel');
    const invoiceHead = el('div', 'panel__head');
    const invoiceCopy = el('div');
    append(invoiceCopy,
      el('h2', 'panel__title', 'Invoice status'),
      el('p', 'panel__sub', 'Paid, pending and overdue amounts; centre shows overdue')
    );
    invoiceHead.appendChild(invoiceCopy);
    const invoiceBody = el('div', 'panel__body');
    const invoiceSegments = [
      { key: 'paid', label: 'Paid', value: invoiceTotals.paid, colorVar: '--chart-2' },
      { key: 'pending', label: 'Pending', value: invoiceTotals.pending, colorVar: '--chart-1' },
      { key: 'overdue', label: 'Overdue', value: invoiceTotals.overdue, colorVar: '--chart-4' }
    ];
    const invoiceLayout = el('div', 'donut-layout');
    const invoiceChart = Charts.createChart({
      height: 188,
      label: 'Invoice status for ' + scopeLabel + '. Paid ' + formatMoney(invoiceTotals.paid) + ', pending ' + formatMoney(invoiceTotals.pending) + ', overdue ' + formatMoney(overdue) + '. Overdue is the centred total.',
      render: function (width, chartContext) {
        return {
          node: Charts.donut(invoiceSegments, width, chartContext.height, {
            animate: chartContext.animate,
            centerValue: formatMoneyShort(overdue),
            centerLabel: 'overdue'
          })
        };
      },
      table: {
        caption: scopeLabel + ' invoice status',
        columns: ['Status', 'Amount', 'Share'],
        rows: invoiceSegments.map(function (segment) {
          return [segment.label, formatMoney(segment.value), invoiceTotals.total ? Math.round(segment.value / invoiceTotals.total * 100) + '%' : '0%'];
        }).concat([['Total', formatMoney(invoiceTotals.total), '100%']])
      }
    });
    charts.push(invoiceChart);
    invoiceLayout.appendChild(invoiceChart.figure);
    const invoiceLegend = el('div', 'donut-legend');
    invoiceSegments.forEach(function (segment) {
      const item = el('span', 'legend__item');
      const swatch = el('span', 'legend__swatch');
      swatch.style.setProperty('--swatch', 'var(' + segment.colorVar + ')');
      append(item, swatch, el('span', null, segment.label), el('span', 'legend__value', formatMoneyShort(segment.value)));
      invoiceLegend.appendChild(item);
    });
    invoiceLayout.appendChild(invoiceLegend);
    invoiceBody.appendChild(invoiceLayout);
    append(invoicePanel, invoiceHead, invoiceBody);

    const topPanel = el('section', 'panel');
    const topHead = el('div', 'panel__head');
    const topCopy = el('div');
    append(topCopy,
      el('h2', 'panel__title', client ? 'Client revenue' : 'Top five clients'),
      el('p', 'panel__sub', 'Monthly recurring revenue, ranked')
    );
    topHead.appendChild(topCopy);
    const topBody = el('div', 'panel__body chart-panel__body');
    const topClients = scopedClientList.slice().sort(function (a, b) { return b.mrr - a.mrr; }).slice(0, 5);
    const topRows = topClients.map(function (item) { return { name: item.name, value: item.mrr }; });
    const topChart = Charts.createChart({
      height: 268,
      label: 'Top clients by MRR. ' + topRows.map(function (row) { return row.name + ' ' + formatMoney(row.value); }).join('; ') + '.',
      render: function (width, chartContext) {
        return Charts.barsHorizontal(topRows, width, chartContext.height, {
          animate: chartContext.animate,
          colorIndex: 2,
          formatValue: formatMoneyShort
        });
      },
      table: {
        caption: 'Top clients by MRR',
        columns: ['Client', 'MRR'],
        rows: topRows.map(function (row) { return [row.name, formatMoney(row.value)]; })
      }
    });
    charts.push(topChart);
    topBody.appendChild(topChart.figure);
    append(topPanel, topHead, topBody);
    append(secondary, invoicePanel, topPanel);
    view.appendChild(secondary);

    const tablePanel = el('section', 'panel revenue-table-panel');
    const tableHead = el('div', 'panel__head');
    const tableCopy = el('div');
    append(tableCopy,
      el('h2', 'panel__title', 'Revenue table'),
      el('p', 'panel__sub', 'The visible rows used by the CSV export')
    );
    tableHead.appendChild(tableCopy);
    const tableBody = el('div', 'panel__body');
    const revenueTable = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    ['Month', 'Actual', 'Forecast', 'Variance'].forEach(function (label) {
      const th = el('th', null, label);
      th.scope = 'col';
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    revenueTable.appendChild(thead);
    const tbody = el('tbody');
    months.forEach(function (month, index) {
      const tr = el('tr');
      const variance = actual[index] - forecast[index];
      [month, formatMoney(actual[index]), formatMoney(forecast[index]), (variance >= 0 ? '+' : '') + formatMoney(variance)].forEach(function (value, cellIndex) {
        const td = el('td', null, value);
        td.setAttribute('data-col', cellIndex === 0 ? 'name' : ['actual', 'forecast', 'variance'][cellIndex - 1]);
        td.setAttribute('data-label', ['Month', 'Actual', 'Forecast', 'Variance'][cellIndex]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    revenueTable.appendChild(tbody);
    tableBody.appendChild(revenueTable);
    append(tablePanel, tableHead, tableBody);
    view.appendChild(tablePanel);

    function csvCell(value) {
      const text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    csvButton.addEventListener('click', function () {
      const rows = [['Month', 'Actual (' + appState.prefs.currency + ')', 'Forecast (' + appState.prefs.currency + ')', 'Variance']];
      months.forEach(function (month, index) {
        rows.push([month, actual[index], forecast[index], actual[index] - forecast[index]]);
      });
      const csv = rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'stackly-revenue-' + localISODate(new Date()) + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      reportStatus.textContent = 'CSV downloaded: ' + anchor.download;
      reportStatus.classList.add('is-success');
      announce('Revenue CSV downloaded for ' + scopeLabel + '.');
    });

    Charts.mountAll(scope, charts);
    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * View: Deliverables
   * ------------------------------------------------------------------ */

  function renderDeliverables(data, session, context) {
    const scope = createScope();
    const charts = [];
    const view = el('div', 'view view--deliverables');
    const scopedDeliverables = data.deliverables.filter(function (item) {
      return !context.scopeId || item.clientId === context.scopeId;
    });
    let statusFilter = 'all';
    let query = '';
    let expanderSequence = 0;

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Delivery tracking'),
      el('span', 'sep', null),
      el('span', null, context.scopeClient ? context.scopeClient.name : 'All clients')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Deliverables'),
      el('p', 'view__sub', 'Cross-client delivery grouped by due window. Open a row for notes and the dependency that controls it.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', scopedDeliverables.length + ' deliverables'),
      el('span', 'status-pill', scopedDeliverables.filter(function (item) { return item.status === 'Blocked'; }).length + ' blocked'),
      el('span', 'status-pill', (data.deliverableStatus.Complete || 0) + ' complete portfolio-wide')
    );
    append(head, copy, meta);
    view.appendChild(head);

    const throughputPanel = el('section', 'panel');
    const throughputHead = el('div', 'panel__head');
    const throughputCopy = el('div');
    append(throughputCopy,
      el('h2', 'panel__title', 'Throughput'),
      el('p', 'panel__sub', 'Completed deliverables per week, last 8 weeks')
    );
    throughputHead.appendChild(throughputCopy);
    const throughputBody = el('div', 'panel__body chart-panel__body');
    const throughputValues = context.scopeId ? data.throughputByClient[context.scopeId] : data.throughput;
    const throughputChart = Charts.createChart({
      height: 200,
      label: 'Completed deliverables per week for the last eight weeks. Values: ' + throughputValues.join(', ') + '.',
      render: function (width, chartContext) {
        return Charts.line(
          [{ name: 'Completed', values: throughputValues, colorIndex: 1 }],
          data.throughputLabels,
          width,
          chartContext.height,
          {
            animate: chartContext.animate,
            tooltipHeading: 'Completed deliverables',
            keyboardLabel: 'Throughput chart. Use arrow keys to inspect weeks.'
          }
        );
      },
      table: {
        caption: 'Completed deliverables per week',
        columns: ['Week starting', 'Completed'],
        rows: throughputValues.map(function (value, index) { return [data.throughputLabels[index], value]; })
      }
    });
    charts.push(throughputChart);
    throughputBody.appendChild(throughputChart.figure);
    append(throughputPanel, throughputHead, throughputBody);
    view.appendChild(throughputPanel);

    const toolbar = el('div', 'view-toolbar');
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter deliverables by status');
    const chipButtons = {};
    ['All', 'In progress', 'Review', 'Blocked', 'Complete'].forEach(function (label) {
      const key = label === 'All' ? 'all' : label;
      const button = el('button', 'filter-chip');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(key === 'all'));
      const count = key === 'all' ? scopedDeliverables.length : scopedDeliverables.filter(function (item) { return item.status === key; }).length;
      append(button, el('span', null, label), el('span', 'filter-chip__count', count));
      button.addEventListener('click', function () {
        statusFilter = key;
        Object.keys(chipButtons).forEach(function (chipKey) { chipButtons[chipKey].setAttribute('aria-pressed', String(chipKey === statusFilter)); });
        renderGroups();
      });
      chipButtons[key] = button;
      chips.appendChild(button);
    });
    const listCount = el('p', 'toolbar-note');
    listCount.setAttribute('aria-live', 'polite');
    append(toolbar, chips, listCount);
    view.appendChild(toolbar);

    const groupHost = el('div', 'deliverable-groups');
    view.appendChild(groupHost);
    const emptyHost = el('div');
    emptyHost.hidden = true;
    view.appendChild(emptyHost);

    function dueWindow(due) {
      const date = parseDate(due);
      const today = parseDate(DATA.meta.today);
      const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
      if (diff < 0) return 'overdue';
      if (diff <= 7) return 'this-week';
      if (diff <= 14) return 'next-week';
      return 'later';
    }

    function filteredItems() {
      return scopedDeliverables.filter(function (item) {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (!query) return true;
        return [item.name, item.clientName, item.owner, item.status].join(' ').toLowerCase().indexOf(query) !== -1;
      });
    }

    const windowOrder = [
      { key: 'overdue', label: 'Overdue' },
      { key: 'this-week', label: 'This week' },
      { key: 'next-week', label: 'Next week' },
      { key: 'later', label: 'Later' }
    ];

    function renderGroups() {
      const items = filteredItems();
      clear(groupHost);
      clear(emptyHost);
      if (!items.length) {
        groupHost.hidden = true;
        emptyHost.hidden = false;
        const filtered = Boolean(query) || statusFilter !== 'all';
        emptyHost.appendChild(emptyState({
          icon: 'check',
          title: query ? 'No deliverables match “' + query + '”' : 'No deliverables in this status',
          text: filtered ? 'Try another search term or reset the status filter.' : 'Deliverables will appear here when they are added.',
          actionLabel: filtered ? 'Clear filters' : null,
          onAction: function () {
            query = '';
            statusFilter = 'all';
            Object.keys(chipButtons).forEach(function (key) { chipButtons[key].setAttribute('aria-pressed', String(key === 'all')); });
            renderGroups();
            context.clearSearch();
          }
        }));
        listCount.textContent = '0 of ' + scopedDeliverables.length + ' deliverables';
        return;
      }
      emptyHost.hidden = true;
      groupHost.hidden = false;
      listCount.textContent = (query || statusFilter !== 'all')
        ? 'Showing ' + items.length + ' of ' + scopedDeliverables.length + ' deliverables'
        : scopedDeliverables.length + ' deliverables across four due windows';

      windowOrder.forEach(function (windowMeta) {
        const windowItems = items.filter(function (item) { return dueWindow(item.due) === windowMeta.key; });
        if (!windowItems.length) return;
        const group = el('section', 'deliverable-group');
        const groupHead = el('div', 'deliverable-group__head');
        const groupTitle = el('h2', 'deliverable-group__title', windowMeta.label);
        const count = el('span', 'deliverable-group__count', windowItems.length);
        count.setAttribute('aria-label', windowItems.length + ' deliverables');
        append(groupHead, groupTitle, count);
        group.appendChild(groupHead);
        windowItems.forEach(function (item) {
          const row = el('div', 'deliverable-row');
          const expanderId = 'deliverable-note-' + (++expanderSequence);
          const button = el('button', 'deliverable-row__button');
          button.type = 'button';
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-controls', expanderId);
          append(button,
            el('span', 'deliverable-row__chevron', '›'),
            (function () {
              const name = el('span', 'deliverable-row__name');
              append(name, el('span', 'deliverable-row__title', item.name), el('span', 'deliverable-row__client', item.clientName + ' · due ' + formatDate(item.due)));
              return name;
            })(),
            el('span', 'deliverable-row__owner', item.owner),
            (function () {
              const status = el('span', 'deliverable-row__status');
              status.appendChild(deliverableStatus(item.status));
              return status;
            })(),
            (function () {
              const progress = el('span', 'deliverable-row__progress');
              progress.appendChild(progressBar(item.progress, item.status === 'Blocked' ? 'blocked' : item.status === 'Complete' ? 'complete' : 'on-track'));
              return progress;
            })()
          );
          const expander = el('div', 'deliverable-expander');
          expander.id = expanderId;
          expander.hidden = true;
          const expanderBox = el('div', 'deliverable-expander__box');
          append(expanderBox,
            (function () { const p = el('p'); const strong = el('strong', null, 'Notes: '); append(p, strong, document.createTextNode(item.notes)); return p; })(),
            (function () { const p = el('p'); const strong = el('strong', null, 'Dependency: '); append(p, strong, document.createTextNode(item.dependencyNote)); return p; })()
          );
          expander.appendChild(expanderBox);
          button.addEventListener('click', function () {
            const opening = expander.hidden;
            expander.hidden = !opening;
            button.setAttribute('aria-expanded', String(opening));
            if (opening) announce(item.name + ' notes opened. ' + item.dependencyNote);
          });
          append(row, button, expander);
          group.appendChild(row);
        });
        groupHost.appendChild(group);
      });
    }

    renderGroups();
    Charts.mountAll(scope, charts);

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        renderGroups();
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Inbox
   * ------------------------------------------------------------------ */

  function renderInbox(data, session, context) {
    const scope = createScope();
    const view = el('div', 'view view--inbox');
    const scopedThreads = appState.threads.filter(function (thread) {
      return !context.scopeId || thread.clientId === context.scopeId;
    });
    let query = '';
    let composerMode = 'client';
    if (!scopedThreads.some(function (thread) { return thread.id === appState.selectedThreadId; })) {
      appState.selectedThreadId = scopedThreads.length ? scopedThreads[0].id : null;
    }

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Client communication'),
      el('span', 'sep', null),
      el('span', null, context.scopeClient ? context.scopeClient.name : 'All clients')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Inbox'),
      el('p', 'view__sub', 'Threads are grouped by client. Use internal notes for the delivery team and client messages for the shared thread.')
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
    append(listHeadCopy, el('h2', 'inbox__list-title', 'Threads'), el('p', 'cell-sub', 'Grouped by client'));
    const listMeta = el('span', 'inbox__list-meta');
    append(listHead, listHeadCopy, listMeta);
    const threadList = el('div', 'thread-list');
    threadList.setAttribute('aria-label', 'Message threads grouped by client');
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
    function updateUnread() {
      const unread = scopedThreads.reduce(function (total, thread) { return total + (thread.unread ? 1 : 0); }, 0);
      unreadPill.textContent = unread ? unread + ' unread' : 'All caught up';
      listMeta.textContent = scopedThreads.length + ' threads · ' + unread + ' unread';
      updateNavBadges();
    }
    function filteredThreads() {
      if (!query) return scopedThreads;
      return scopedThreads.filter(function (thread) {
        const latest = lastMessage(thread);
        return [thread.participant, thread.clientName, thread.role, latest ? latest.body : 'no messages yet']
          .join(' ').toLowerCase().indexOf(query) !== -1;
      });
    }

    function renderList() {
      clear(threadList);
      const threads = filteredThreads();
      if (!threads.length) {
        threadList.style.flex = '1';
        const empty = el('div', 'threads-empty');
        const inner = el('div', 'threads-empty__inner');
        const icon = el('span', 'threads-empty__icon');
        icon.appendChild(iconSvg('search'));
        append(inner, icon, el('h3', null, 'No threads match'), el('p', null, context.scoped ? 'There are no conversations for this client scope yet.' : 'Try another client, participant or phrase.'));
        if (query) {
          const button = makeButton('Clear search', 'btn btn--secondary btn--sm', function () {
            query = '';
            if (searchInput) searchInput.value = '';
            appState.searchQuery = '';
            renderList();
          });
          inner.appendChild(button);
        }
        empty.appendChild(inner);
        threadList.appendChild(empty);
        return;
      }
      threadList.style.flex = '';
      const groups = [];
      threads.forEach(function (thread) {
        let group = groups.find(function (entry) { return entry.clientId === thread.clientId; });
        if (!group) {
          group = { clientId: thread.clientId, clientName: thread.clientName, threads: [] };
          groups.push(group);
        }
        group.threads.push(thread);
      });
      groups.forEach(function (group) {
        threadList.appendChild(el('div', 'thread-group-label', group.clientName));
        group.threads.forEach(function (thread) {
          const latest = lastMessage(thread);
          const button = el('button', 'thread');
          button.type = 'button';
          button.setAttribute('data-thread-id', thread.id);
          button.setAttribute('aria-current', String(thread.id === appState.selectedThreadId));
          button.setAttribute('aria-label', 'Open thread with ' + thread.participant + ' at ' + thread.clientName +
            (thread.unread ? ', unread' : '') + (latest ? ', latest: ' + latest.body : ', no messages yet'));
          const avatar = avatarEl(thread.participant, thread.participant.toLowerCase().replace(/\s+/g, '.') + '@client.example');
          const body = el('span', 'thread__copy');
          const nameRow = el('span', 'thread__name-row');
          append(nameRow, el('span', 'thread__name', thread.participant));
          if (thread.unread) nameRow.appendChild(el('span', 'thread__dot'));
          const snippet = latest ? (latest.mode === 'internal' ? 'Internal: ' + latest.body : latest.body) : 'No messages yet';
          append(body,
            nameRow,
            el('span', 'thread__snippet', snippet),
            el('span', 'thread__role', thread.clientName + ' · ' + thread.role)
          );
          append(button, avatar, body, el('span', 'thread__time', threadTime(thread.updated)));
          button.addEventListener('click', function () { selectThread(thread.id); });
          threadList.appendChild(button);
        });
      });
    }

    function messageDate(iso) {
      const day = iso.slice(0, 10);
      if (day === DATA.meta.today) return 'Today';
      const yesterday = new Date(DATA.meta.now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (day === localISODate(yesterday)) return 'Yesterday';
      return formatDate(iso);
    }

    function composerEmpty(title, text) {
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
        conversation.appendChild(composerEmpty('Choose a conversation', 'Select a thread to read messages and reply.'));
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
      const avatar = avatarEl(thread.participant, thread.participant.toLowerCase().replace(/\s+/g, '.') + '@client.example');
      const headCopy = el('div', 'conversation-head__copy');
      const title = el('h2', 'conversation-head__name', thread.participant);
      title.setAttribute('tabindex', '-1');
      append(headCopy, title, el('span', 'conversation-head__role', thread.clientName + ' · ' + thread.role));
      const spacer = el('span', 'conversation-head__spacer');
      append(convoHead, back, avatar, headCopy, spacer, el('span', 'status-pill', thread.clientName));
      conversation.appendChild(convoHead);

      if (!thread.messages.length) {
        conversation.appendChild(composerEmpty('No messages yet', 'Start the conversation below. Internal notes stay visible only in this workspace.'));
      } else {
        const scroll = el('div', 'messages-scroll');
        scroll.setAttribute('role', 'log');
        scroll.setAttribute('aria-label', 'Conversation with ' + thread.participant + ' at ' + thread.clientName);
        let lastDate = '';
        thread.messages.forEach(function (message) {
          const day = message.at.slice(0, 10);
          if (day !== lastDate) {
            scroll.appendChild(el('span', 'message-date', messageDate(message.at)));
            lastDate = day;
          }
          const internal = message.mode === 'internal';
          const group = el('div', 'message-group' + (message.from === 'me' ? ' message-group--me' : '') + (internal ? ' message-group--internal' : ''));
          const bubble = el('div', 'message-bubble' + (internal ? ' message-bubble--internal' : ''));
          if (internal) bubble.appendChild(el('span', 'message-internal-label', 'Internal note'));
          bubble.appendChild(document.createTextNode(message.body));
          const time = el('time', 'message-time', formatTime(message.at));
          time.dateTime = message.at;
          append(group, bubble, time);
          scroll.appendChild(group);
        });
        conversation.appendChild(scroll);
        scope.defer(function () { scroll.scrollTop = scroll.scrollHeight; });
      }

      const composer = el('form', 'composer');
      composer.setAttribute('aria-label', 'Write a message to ' + thread.participant);
      const modeRow = el('div', 'composer__foot');
      const modeSwitch = el('div', 'mode-switch');
      modeSwitch.setAttribute('role', 'radiogroup');
      modeSwitch.setAttribute('aria-label', 'Message mode');
      [{ key: 'client', label: 'Client message' }, { key: 'internal', label: 'Internal note' }].forEach(function (mode) {
        const label = el('label');
        const input = el('input');
        input.type = 'radio';
        input.name = 'composer-mode-' + thread.id;
        input.value = mode.key;
        input.checked = composerMode === mode.key;
        input.addEventListener('change', function () { if (input.checked) composerMode = mode.key; });
        label.appendChild(input);
        label.appendChild(el('span', null, mode.label));
        modeSwitch.appendChild(label);
      });
      const modeHint = el('span', 'composer__hint', composerMode === 'internal' ? 'Internal notes are not sent to the client.' : 'Visible to the client thread.');
      append(modeRow, modeSwitch, modeHint);
      const textarea = el('textarea');
      textarea.id = 'consultant-message-composer';
      textarea.setAttribute('aria-label', 'Message to ' + thread.participant + ' at ' + thread.clientName);
      textarea.setAttribute('placeholder', 'Write a message…');
      textarea.rows = 2;
      const actions = el('div', 'composer__foot');
      const send = el('button', 'btn btn--primary btn--sm', 'Send');
      send.type = 'submit';
      send.appendChild(iconSvg('send'));
      append(actions, el('span', 'composer__hint', 'Ctrl + Enter sends · Enter adds a line'), send);
      append(composer, textarea, modeRow, actions);
      composer.addEventListener('submit', function (event) {
        event.preventDefault();
        const body = textarea.value.trim();
        if (!body) {
          textarea.focus();
          announce('Type a message before sending.');
          return;
        }
        const at = new Date().toISOString();
        thread.messages.push({ id: 'local-' + Date.now(), from: 'me', body: body, at: at, mode: composerMode });
        thread.updated = at;
        thread.unread = false;
        updateUnread();
        renderList();
        renderConversation();
        const next = conversation.querySelector('textarea');
        if (next) next.focus();
        announce((composerMode === 'internal' ? 'Internal note' : 'Client message') + ' sent to ' + thread.participant + '.');
      });
      textarea.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          send.click();
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
      updateUnread();
      renderList();
      renderConversation();
      const mobile = window.matchMedia('(max-width: 900px)').matches;
      window.requestAnimationFrame(function () {
        if (mobile) {
          const title = conversation.querySelector('.conversation-head__name');
          if (title) title.focus();
        } else {
          const next = threadList.querySelector('[data-thread-id="' + id + '"]');
          if (next) next.focus();
        }
      });
    }

    threadList.addEventListener('keydown', function (event) {
      const buttons = Array.from(threadList.querySelectorAll('.thread'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); buttons[Math.max(index - 1, 0)].focus(); }
      else if (event.key === 'Home') { event.preventDefault(); buttons[0].focus(); }
      else if (event.key === 'End') { event.preventDefault(); buttons[buttons.length - 1].focus(); }
    });

    updateUnread();
    renderList();
    renderConversation();

    return {
      node: view,
      setQuery: function (value) {
        query = String(value || '').trim().toLowerCase();
        renderList();
        if (query) announce('Showing ' + filteredThreads().length + ' matching threads.');
      },
      destroy: scope.destroy
    };
  }

  /* ------------------------------------------------------------------ *
   * View: Settings
   * ------------------------------------------------------------------ */

  function renderSettings(data, session, context) {
    const scope = createScope();
    const view = el('div', 'view view--settings');

    const head = el('div', 'view__head');
    const copy = el('div');
    const eyebrow = el('p', 'view__eyebrow');
    append(eyebrow,
      el('span', null, 'Consultant profile'),
      el('span', 'sep', null),
      el('span', null, 'Account')
    );
    append(copy,
      eyebrow,
      el('h1', 'view__title', 'Settings'),
      el('p', 'view__sub', 'Profile, rate card, availability and workspace preferences. Email, company and role are managed by the account record.')
    );
    const meta = el('div', 'view__meta');
    append(meta,
      el('span', 'status-pill status-pill--accent', 'Consultant'),
      el('span', 'status-pill', 'Last sign-in ' + formatDate(session.lastLogin, 'long'))
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

    function makeField(labelText, id, type, value, options) {
      const opts = options || {};
      const field = el('div', 'field' + (opts.full ? ' field--full' : ''));
      const label = el('label', null, labelText);
      label.htmlFor = id;
      const input = el('input');
      input.id = id;
      input.type = type;
      input.value = value;
      if (opts.readonly) input.readOnly = true;
      if (opts.min !== undefined) input.min = String(opts.min);
      if (opts.max !== undefined) input.max = String(opts.max);
      if (opts.step !== undefined) input.step = String(opts.step);
      if (opts.autocomplete) input.autocomplete = opts.autocomplete;
      if (opts.note) {
        const note = el('p', 'field__note', opts.note);
        if (opts.noteId) note.id = opts.noteId;
        input.setAttribute('aria-describedby', opts.noteId || '');
      }
      if (opts.errorId) {
        const error = el('p', 'field__error');
        error.id = opts.errorId;
        error.hidden = true;
        input.setAttribute('aria-describedby', [opts.noteId, opts.errorId].filter(Boolean).join(' '));
        append(field, label, input, error);
      } else {
        append(field, label, input);
      }
      if (opts.note) field.appendChild(el('p', 'field__note', opts.note)).id = opts.noteId || '';
      return { field: field, input: input };
    }

    const profilePanel = el('section', 'panel settings-panel');
    profilePanel.setAttribute('aria-labelledby', 'consultant-profile-title');
    const profileHead = el('div', 'settings-panel__head');
    const profileHeadCopy = el('div');
    const profileTitle = el('h2', 'settings-panel__title', 'Profile');
    profileTitle.id = 'consultant-profile-title';
    append(profileHeadCopy, profileTitle, el('p', 'settings-panel__sub', 'Displayed in the workspace chrome and account menu.'));
    profileHead.appendChild(profileHeadCopy);
    const avatarRow = el('div', 'consultant-avatar-row');
    const profileAvatar = avatarEl(session.name, session.email);
    const avatarCopy = el('div', 'consultant-avatar-row__copy');
    const avatarName = el('strong', null, session.name);
    const avatarMeta = el('span', null, appState.prefs.title + ' · ' + session.email);
    append(avatarCopy, avatarName, avatarMeta);
    append(avatarRow, profileAvatar, avatarCopy);
    const profileForm = el('form', 'settings-form');
    profileForm.noValidate = true;
    const formGrid = el('div', 'form-grid');
    const nameField = makeField('Full name', 'consultant-name', 'text', session.name, {
      maxlength: 60,
      autocomplete: 'name',
      errorId: 'consultant-name-error'
    });
    const emailField = makeField('Email', 'consultant-email', 'email', session.email, {
      readonly: true,
      note: 'Email is tied to your sign-in and cannot be edited here.',
      noteId: 'consultant-email-note'
    });
    const companyField = makeField('Company', 'consultant-company', 'text', session.company, {
      readonly: true,
      note: 'Company is managed by the Stackly account record.',
      noteId: 'consultant-company-note'
    });
    const roleField = makeField('Role', 'consultant-role', 'text', 'Consultant', {
      readonly: true,
      note: 'Consultant accounts manage multiple clients. Role changes are handled by an administrator.',
      noteId: 'consultant-role-note'
    });
    const titleField = makeField('Role label', 'consultant-title', 'text', appState.prefs.title, {
      maxlength: 60,
      errorId: 'consultant-title-error'
    });
    const timezoneField = el('div', 'field');
    const timezoneLabel = el('label', null, 'Timezone');
    timezoneLabel.htmlFor = 'consultant-timezone';
    const timezoneSelect = el('select');
    timezoneSelect.id = 'consultant-timezone';
    data.timezones.forEach(function (zone) {
      const option = document.createElement('option');
      option.value = zone.value;
      option.textContent = zone.label;
      if (zone.value === appState.prefs.timezone) option.selected = true;
      timezoneSelect.appendChild(option);
    });
    append(timezoneField, timezoneLabel, timezoneSelect);
    const availabilityField = makeField('Weekly availability hours', 'consultant-availability', 'number', appState.prefs.weeklyAvailability, {
      min: 1,
      max: 80,
      errorId: 'consultant-availability-error'
    });
    const capacityField = makeField('Capacity target %', 'consultant-capacity', 'number', appState.prefs.capacityTarget, {
      min: 1,
      max: 120,
      errorId: 'consultant-capacity-error'
    });
    const currencyField = el('div', 'field');
    const currencyLabel = el('label', null, 'Default engagement currency');
    currencyLabel.htmlFor = 'consultant-currency';
    const currencySelect = el('select');
    currencySelect.id = 'consultant-currency';
    data.currencies.forEach(function (currency) {
      const option = document.createElement('option');
      option.value = currency.value;
      option.textContent = currency.label;
      if (currency.value === appState.prefs.currency) option.selected = true;
      currencySelect.appendChild(option);
    });
    append(currencyField, currencyLabel, currencySelect);
    append(formGrid, nameField.field, emailField.field, companyField.field, roleField.field, titleField.field, timezoneField, availabilityField.field, capacityField.field, currencyField);
    const profileActions = el('div', 'form-actions');
    const profileStatus = el('p', 'save-status');
    profileStatus.setAttribute('role', 'status');
    profileStatus.setAttribute('aria-live', 'polite');
    const profileSave = el('button', 'btn btn--primary', 'Save profile');
    profileSave.type = 'submit';
    append(profileActions, profileStatus, profileSave);
    append(profileForm, avatarRow, formGrid, profileActions);
    append(profilePanel, profileHead, profileForm);
    leftColumn.appendChild(profilePanel);

    function nameProblem(value) {
      const trimmed = String(value || '').trim();
      if (trimmed.length < 2 || trimmed.length > 60) return 'Enter a name between 2 and 60 characters.';
      if (!/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(trimmed)) return 'Use letters, spaces, hyphens or apostrophes only.';
      return '';
    }
    function numberProblem(value, min, max, label) {
      if (String(value).trim() === '') return 'Enter ' + label + '.';
      const number = Number(value);
      if (!Number.isFinite(number)) return label + ' must be a number.';
      if (number < min || number > max) return label + ' must be between ' + min + ' and ' + max + '.';
      return '';
    }

    profileForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const nameMessage = nameProblem(nameField.input.value);
      const titleMessage = titleField.input.value.trim().length < 2 || titleField.input.value.trim().length > 60
        ? 'Enter a role label between 2 and 60 characters.' : '';
      const availabilityMessage = numberProblem(availabilityField.input.value, 1, 80, 'weekly availability');
      const capacityMessage = numberProblem(capacityField.input.value, 1, 120, 'a capacity target');
      fieldError(nameField.input, document.getElementById('consultant-name-error'), nameMessage);
      fieldError(titleField.input, document.getElementById('consultant-title-error'), titleMessage);
      fieldError(availabilityField.input, document.getElementById('consultant-availability-error'), availabilityMessage);
      fieldError(capacityField.input, document.getElementById('consultant-capacity-error'), capacityMessage);
      profileStatus.className = 'save-status';
      if (nameMessage || titleMessage || availabilityMessage || capacityMessage) {
        profileStatus.textContent = 'Check the highlighted fields.';
        const first = nameMessage ? nameField.input : titleMessage ? titleField.input : availabilityMessage ? availabilityField.input : capacityField.input;
        first.focus();
        return;
      }
      const updated = Session.setSession({
        name: nameField.input.value.trim(),
        email: currentSession.email,
        company: currentSession.company,
        role: currentSession.role,
        createdAt: currentSession.createdAt,
        lastLogin: currentSession.lastLogin
      });
      if (!updated) {
        profileStatus.textContent = 'Profile could not be saved in this browser.';
        return;
      }
      currentSession = updated;
      setPrefs({
        title: titleField.input.value.trim(),
        timezone: timezoneSelect.value,
        weeklyAvailability: Number(availabilityField.input.value),
        capacityTarget: Number(capacityField.input.value),
        currency: currencySelect.value
      });
      setAvatar(profileAvatar, currentSession.name, currentSession.email);
      avatarName.textContent = currentSession.name;
      avatarMeta.textContent = appState.prefs.title + ' · ' + currentSession.email;
      refreshUserChrome();
      updateRateDisplay();
      profileStatus.className = 'save-status is-success';
      profileStatus.textContent = 'Profile saved. Sidebar updated.';
      showToast('Profile and availability updated.');
      announce('Profile saved. Sidebar name and utilization target updated.');
    });

    /* Rate card */
    const ratePanel = el('section', 'panel settings-panel');
    ratePanel.setAttribute('aria-labelledby', 'rate-card-title');
    const rateHead = el('div', 'settings-panel__head');
    const rateHeadCopy = el('div');
    const rateTitle = el('h2', 'settings-panel__title', 'Rate card');
    rateTitle.id = 'rate-card-title';
    append(rateHeadCopy, rateTitle, el('p', 'settings-panel__sub', 'Hourly rates. Blended rate is the average of valid rows.'));
    rateHead.appendChild(rateHeadCopy);
    const rateCard = el('div', 'rate-card');
    const rateRows = [];
    appState.prefs.rateCard.forEach(function (row, index) {
      const rateRow = el('div', 'rate-row');
      const label = el('label', 'rate-row__label', row.role);
      label.htmlFor = 'rate-' + index;
      const input = el('input');
      input.id = 'rate-' + index;
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = row.rate;
      input.setAttribute('aria-label', row.role + ' hourly rate');
      input.addEventListener('input', updateRateDisplay);
      const error = el('p', 'rate-error');
      error.hidden = true;
      error.id = 'rate-error-' + index;
      input.setAttribute('aria-describedby', error.id);
      const wrapper = el('div');
      append(wrapper, input, error);
      append(rateRow, label, wrapper);
      rateCard.appendChild(rateRow);
      rateRows.push({ row: row, input: input, error: error });
    });
    const rateFoot = el('div', 'rate-card__foot');
    const blended = el('p', 'rate-card__blended');
    blended.appendChild(document.createTextNode('Blended rate: '));
    const blendedValue = el('strong', null, formatMoney(data.blendedRate, 2));
    blended.appendChild(blendedValue);
    const rateStatus = el('p', 'save-status');
    rateStatus.setAttribute('role', 'status');
    rateStatus.setAttribute('aria-live', 'polite');
    const rateSave = el('button', 'btn btn--secondary btn--sm', 'Save rate card');
    rateSave.type = 'button';
    append(rateFoot, blended, rateStatus, rateSave);
    append(ratePanel, rateHead, rateCard, rateFoot);
    leftColumn.appendChild(ratePanel);

    function validRates() {
      return rateRows.map(function (entry) {
        const value = Number(entry.input.value);
        if (String(entry.input.value).trim() === '' || !Number.isFinite(value) || value <= 0 || value > 5000) return null;
        return value;
      });
    }

    function updateRateDisplay() {
      const values = validRates();
      const invalidIndex = values.indexOf(null);
      rateRows.forEach(function (entry, index) {
        const error = values[index] === null ? (String(entry.input.value).trim() === '' ? 'Enter a numeric rate.' : 'Use a number between 1 and 5000.') : '';
        fieldError(entry.input, entry.error, error);
        if (error) entry.error.hidden = false;
      });
      if (invalidIndex !== -1) {
        blendedValue.textContent = '—';
      } else {
        const average = values.reduce(function (total, value) { return total + value; }, 0) / values.length;
        blendedValue.textContent = formatMoney(average, 2);
      }
      return invalidIndex === -1;
    }

    currencySelect.addEventListener('change', function () {
      appState.prefs.currency = currencySelect.value;
      savePrefs();
      updateRateDisplay();
      announce('Default currency set to ' + currencySelect.options[currencySelect.selectedIndex].text + '.');
    });

    rateSave.addEventListener('click', function () {
      const valid = updateRateDisplay();
      rateStatus.className = 'save-status';
      if (!valid) {
        rateStatus.textContent = 'Check the rate rows before saving.';
        const firstInvalid = rateRows.find(function (entry) { return entry.input.getAttribute('aria-invalid') === 'true'; });
        if (firstInvalid) firstInvalid.input.focus();
        return;
      }
      appState.prefs.rateCard = rateRows.map(function (entry) {
        return { id: entry.row.id, role: entry.row.role, rate: Number(entry.input.value) };
      });
      savePrefs();
      rateStatus.className = 'save-status is-success';
      rateStatus.textContent = 'Rate card saved on this device.';
      announce('Rate card saved. Blended rate ' + blendedValue.textContent + ' per hour.');
    });

    /* Preferences */
    const prefsPanel = el('section', 'panel settings-panel');
    prefsPanel.setAttribute('aria-labelledby', 'consultant-prefs-title');
    const prefsHead = el('div', 'settings-panel__head');
    const prefsHeadCopy = el('div');
    const prefsTitle = el('h2', 'settings-panel__title', 'Preferences');
    prefsTitle.id = 'consultant-prefs-title';
    append(prefsHeadCopy, prefsTitle, el('p', 'settings-panel__sub', 'Stored on this device only.'));
    prefsHead.appendChild(prefsHeadCopy);
    const prefsList = el('div', 'prefs-list');
    const prefsStatus = el('p', 'settings-note');
    prefsStatus.setAttribute('role', 'status');
    prefsStatus.setAttribute('aria-live', 'polite');

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

    function preferenceChanged(message) {
      savePrefs();
      prefsStatus.textContent = message + ' Preference saved on this device.';
      announce(message);
    }

    prefsList.appendChild(switchRow('pref-digest', 'Weekly digest', 'A Monday summary of portfolio changes and open alerts.', appState.prefs.digest, function (checked) {
      appState.prefs.digest = checked;
      preferenceChanged('Weekly digest ' + (checked ? 'on' : 'off') + '.');
    }));
    prefsList.appendChild(switchRow('pref-risk', 'Risk alerts', 'Notify on health drops, overdue milestones and late invoices.', appState.prefs.riskAlerts, function (checked) {
      appState.prefs.riskAlerts = checked;
      preferenceChanged('Risk alerts ' + (checked ? 'on' : 'off') + '.');
    }));
    prefsList.appendChild(switchRow('pref-schedule', 'Schedule alerts', 'Notify on review dates and deliverable due windows.', appState.prefs.scheduleAlerts, function (checked) {
      appState.prefs.scheduleAlerts = checked;
      preferenceChanged('Schedule alerts ' + (checked ? 'on' : 'off') + '.');
    }));
    prefsList.appendChild(switchRow('pref-compact', 'Compact density', 'Tighten padding and row heights across the workspace.', appState.prefs.compact, function (checked) {
      appState.prefs.compact = checked;
      applyDensity();
      preferenceChanged('Compact density ' + (checked ? 'on' : 'off') + '.');
    }));
    append(prefsPanel, prefsHead, prefsList, prefsStatus);
    rightColumn.appendChild(prefsPanel);

    /* Deactivate */
    const deactivatePanel = el('section', 'panel settings-panel deactivate-zone');
    deactivatePanel.setAttribute('aria-labelledby', 'deactivate-title');
    const deactivateHead = el('div', 'settings-panel__head');
    const deactivateCopy = el('div');
    const deactivateTitle = el('h2', 'settings-panel__title', 'Deactivate profile');
    deactivateTitle.id = 'deactivate-title';
    append(deactivateCopy, deactivateTitle, el('p', 'settings-panel__sub', 'Simulated action. No account or session data is removed.'));
    deactivateHead.appendChild(deactivateCopy);
    const deactivateText = el('p', 'danger-zone__copy', 'Profile deactivation normally removes workspace access. This concept only simulates the confirmation flow.');
    const deactivateForm = el('div', 'danger-form');
    const deactivateField = el('div', 'field');
    const deactivateLabel = el('label', null, 'Type ' + currentSession.email + ' to confirm');
    deactivateLabel.htmlFor = 'deactivate-email';
    const deactivateInput = el('input');
    deactivateInput.id = 'deactivate-email';
    deactivateInput.type = 'email';
    deactivateInput.autocomplete = 'off';
    deactivateInput.setAttribute('aria-describedby', 'deactivate-note');
    const deactivateNote = el('p', 'field__note', 'The action stays disabled until the email matches exactly.');
    deactivateNote.id = 'deactivate-note';
    append(deactivateField, deactivateLabel, deactivateInput, deactivateNote);
    const deactivateButton = el('button', 'btn btn--danger', 'Deactivate profile');
    deactivateButton.type = 'button';
    deactivateButton.disabled = true;
    deactivateForm.appendChild(deactivateField);
    deactivateForm.appendChild(deactivateButton);
    const deactivateConfirm = el('div', 'confirm-panel');
    deactivateConfirm.hidden = true;
    const deactivateConfirmTitle = el('p', 'confirm-panel__title', 'Simulated deactivation — confirm below');
    const deactivateConfirmCopy = el('p', null, 'This is a simulation. Your profile and session remain active. Confirm only to see the simulated result.');
    const deactivateConfirmActions = el('div', 'confirm-panel__actions');
    const deactivateCancel = el('button', 'btn btn--secondary btn--sm', 'Cancel');
    deactivateCancel.type = 'button';
    const deactivateConfirmYes = el('button', 'btn btn--danger btn--sm', 'Confirm simulated deactivation');
    deactivateConfirmYes.type = 'button';
    const deactivateResult = el('p', 'confirm-panel__title', 'Simulation complete. Your profile and session are unchanged.');
    deactivateResult.hidden = true;
    append(deactivateConfirmActions, deactivateCancel, deactivateConfirmYes);
    append(deactivateConfirm, deactivateConfirmTitle, deactivateConfirmCopy, deactivateResult, deactivateConfirmActions);
    deactivateForm.appendChild(deactivateConfirm);
    append(deactivatePanel, deactivateHead, deactivateText, deactivateForm);
    rightColumn.appendChild(deactivatePanel);

    deactivateInput.addEventListener('input', function () {
      deactivateButton.disabled = deactivateInput.value.trim() !== currentSession.email;
      if (deactivateButton.disabled) {
        deactivateConfirm.hidden = true;
        deactivateResult.hidden = true;
        deactivateConfirmActions.hidden = false;
      }
    });
    deactivateButton.addEventListener('click', function () {
      if (deactivateButton.disabled) return;
      deactivateConfirm.hidden = false;
      deactivateResult.hidden = true;
      deactivateConfirmActions.hidden = false;
      deactivateConfirmYes.focus();
      announce('Simulated deactivation confirmation opened.');
    });
    deactivateCancel.addEventListener('click', function () {
      deactivateConfirm.hidden = true;
      deactivateButton.focus();
    });
    deactivateConfirmYes.addEventListener('click', function () {
      deactivateResult.hidden = false;
      deactivateConfirmActions.hidden = true;
      announce('Simulated deactivation confirmed. Profile and session remain unchanged.');
      showToast('Simulation only — your profile remains active.');
    });

    append(grid, leftColumn, rightColumn);
    view.appendChild(grid);
    updateRateDisplay();

    return { node: view, setQuery: null, destroy: scope.destroy };
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  buildScopeOptions();
  applyDensity();
  refreshUserChrome();
  updateNavBadges();
  renderNotifications();
  syncScopeUI();

  if (!window.location.hash) {
    try {
      window.history.replaceState(null, '', '#/overview');
    } catch (error) {
      window.location.hash = '#/overview';
    }
  }

  renderRoute(false);
})();
