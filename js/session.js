/* Stackly shared session — single source of truth for signed-in user details. */
(function () {
  'use strict';

  const SESSION_KEY = 'zstackly.session.v1';
  const UI_KEYS = ['zstackly.client.prefs.v1', 'zstackly.consultant.prefs.v1'];
  const DASHBOARDS = Object.freeze({
    client: 'client-dashboard.html',
    consultant: 'consultant-dashboard.html'
  });
  const VALID_ROLES = ['client', 'consultant'];
  const AVATAR_COUNT = 5;

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* Storage can be unavailable in private contexts. */
    }
  }

  function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }

  function cleanEmail(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase().slice(0, 160);
  }

  function isValidDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function isValidShape(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (typeof value.name !== 'string' || !value.name.trim()) return false;
    if (typeof value.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return false;
    if (typeof value.company !== 'string' || !value.company.trim()) return false;
    if (VALID_ROLES.indexOf(value.role) === -1) return false;
    if (!isValidDate(value.createdAt)) return false;
    if (value.lastLogin !== undefined && !isValidDate(value.lastLogin)) return false;
    return true;
  }

  function getSession() {
    const raw = storageGet(SESSION_KEY);
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      storageRemove(SESSION_KEY);
      return null;
    }

    if (!isValidShape(parsed)) {
      storageRemove(SESSION_KEY);
      return null;
    }

    return {
      name: cleanText(parsed.name, 80),
      email: cleanEmail(parsed.email),
      company: cleanText(parsed.company, 80),
      role: parsed.role,
      createdAt: parsed.createdAt,
      lastLogin: isValidDate(parsed.lastLogin) ? parsed.lastLogin : parsed.createdAt
    };
  }

  function setSession(input) {
    if (!input || typeof input !== 'object') return null;

    const previous = getSession();
    const candidate = {
      name: cleanText(input.name, 80) || (previous ? previous.name : ''),
      email: cleanEmail(input.email) || (previous ? previous.email : ''),
      company: cleanText(input.company, 80) || (previous ? previous.company : ''),
      role: VALID_ROLES.indexOf(input.role) !== -1 ? input.role : (previous ? previous.role : ''),
      createdAt: isValidDate(input.createdAt) ? input.createdAt : (previous ? previous.createdAt : new Date().toISOString()),
      lastLogin: isValidDate(input.lastLogin) ? input.lastLogin : (previous ? previous.lastLogin : new Date().toISOString())
    };

    if (!candidate.name || !candidate.email || !candidate.company || !candidate.role) return null;
    if (!isValidShape(candidate)) return null;

    storageSet(SESSION_KEY, JSON.stringify(candidate));
    return candidate;
  }

  function clearSession() {
    storageRemove(SESSION_KEY);
    UI_KEYS.forEach(storageRemove);
  }

  function currentPathWithHash() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function requireRole(role) {
    const session = getSession();

    if (!session) {
      const next = encodeURIComponent(currentPathWithHash());
      window.location.replace('login.html?next=' + next);
      return false;
    }

    if (session.role !== role) {
      window.location.replace(DASHBOARDS[session.role] || 'login.html');
      return false;
    }

    return session;
  }

  function initials(name, email) {
    const source = cleanText(name, 80) || cleanEmail(email);
    if (!source) return 'N';

    const parts = source.split(/[\s._-]+/).filter(Boolean);
    if (parts.length > 1) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  function avatarColor(name, email) {
    const source = (cleanText(name, 80) + '|' + cleanEmail(email)) || 'stackly';
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    const slot = (Math.abs(hash) % AVATAR_COUNT) + 1;
    return 'var(--avatar-' + slot + ')';
  }

  window.StacklySession = Object.freeze({
    KEY: SESSION_KEY,
    DASHBOARDS: DASHBOARDS,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    requireRole: requireRole,
    initials: initials,
    avatarColor: avatarColor
  });
})();
