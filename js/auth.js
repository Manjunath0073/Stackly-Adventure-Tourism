(function () {
  'use strict';

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ROLE_MAP = {
    client: '/client-dashboard.html',
    consultant: '/consultant-dashboard.html'
  };
  const ROLES = {
    client: {
      label: 'Client',
      description: 'I’m planning or tracking my own journeys and plans.',
      icon: 'compass',
      redirect: ROLE_MAP.client,
      workspace: 'client workspace'
    },
    consultant: {
      label: 'Consultant',
      description: 'I deliver planning and journeys for clients.',
      icon: 'briefcase',
      redirect: ROLE_MAP.consultant,
      workspace: 'consultant workspace'
    }
  };
  const COMMON_PASSWORDS = ['password', 'qwerty', '12345678', 'letmein', 'welcome', 'admin', 'iloveyou'];
  const DISPOSABLE_DOMAINS = ['mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
  const STORAGE = {
    remember: 'zstackly.auth.remember',
    lastRole: 'zstackly.auth.lastRole'
  };

  function profileFromEmail(email) {
    const local = String(email || '').split('@')[0] || 'Traveler';
    const words = local.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const name = words.map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ') || 'Traveler';
    const domain = String(email || '').split('@')[1] || 'stackly.example';
    const root = domain.split('.')[0] || 'Stackly';
    const company = (root.charAt(0).toUpperCase() + root.slice(1)).replace(/[-_]+/g, ' ');
    return { name: name, company: company };
  }

  function safeNextForRole(role) {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return null;
    if (next.indexOf('//') === 0) return null;
    const expected = ROLES[role] ? ROLES[role].redirect : '';
    if (!expected) return null;
    const clean = next.split('#')[0].split('?')[0].replace(/\\/g, '/');
    if (clean === expected || clean.slice(-expected.length) === expected) return next;
    return null;
  }

  function destinationForRole(role) {
    const meta = ROLES[role];
    if (!meta) return '/login.html';
    return safeNextForRole(role) || meta.redirect;
  }

  function startSession(details) {
    if (!window.StacklySession) {
      return null;
    }
    return window.StacklySession.setSession(details);
  }

  const page = document.body.getAttribute('data-page');
  const isSignup = page === 'signup';
  const form = document.querySelector('[data-auth-form]');
  const roleInputs = Array.from(document.querySelectorAll('[data-role-input]'));
  const roleHelper = document.querySelector('[data-role-helper]');
  const crossLink = document.querySelector('[data-cross-link]');
  const submit = document.querySelector('[data-submit]');
  const submitLabel = document.querySelector('[data-submit-label]');
  const summary = document.querySelector('[data-error-summary]');
  const errorList = document.querySelector('[data-error-list]');
  const authAlert = document.querySelector('[data-auth-alert]');
  const authSuccess = document.querySelector('[data-auth-success]');
  const formContent = document.querySelector('[data-form-content]');
  const signupSuccess = document.querySelector('[data-signup-success]');
  let submitting = false;
  let failedAttempts = 0;
  let locked = false;
  let lockTimer = 0;

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      /* Storage can be unavailable in private contexts. */
    }
  }

  function readRemembered() {
    const raw = readStorage(STORAGE.remember);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.email === 'string' && ROLES[parsed.role]) return parsed;
    } catch (error) {
      return null;
    }
    return null;
  }

  function selectedRole() {
    const checked = roleInputs.find(function (input) { return input.checked; });
    return checked ? checked.value : '';
  }

  function updateRoleUI(role, persist) {
    const meta = ROLES[role];
    if (form) form.setAttribute('data-role', role || '');
    if (roleHelper) {
      roleHelper.textContent = meta
        ? 'You’ll land in your ' + meta.workspace + '.'
        : 'Choose a role to see where you’ll land.';
    }

    const base = meta
      ? (isSignup ? 'Create ' + meta.label.toLowerCase() + ' account' : 'Sign in as ' + meta.label.toLowerCase())
      : (isSignup ? 'Create account' : 'Sign in');

    if (submitLabel) {
      submitLabel.dataset.base = base;
      if (!submitting) submitLabel.textContent = base;
    }

    if (crossLink) {
      const baseHref = isSignup ? '/login.html' : '/signup.html';
      crossLink.href = meta ? baseHref + '?role=' + encodeURIComponent(role) : baseHref;
    }

    if (persist && meta) writeStorage(STORAGE.lastRole, role);
  }

  function setRole(role, persist) {
    roleInputs.forEach(function (input) {
      input.checked = input.value === role;
    });
    updateRoleUI(role, persist);
  }

  function clearRoleError() {
    const roleError = document.getElementById(isSignup ? 'signup-role-error' : 'login-role-error');
    if (!roleError) return;
    roleError.hidden = true;
    const text = roleError.querySelector('[data-error-text]');
    if (text) text.textContent = '';
    const group = roleError.closest('.auth-roles');
    if (group) group.removeAttribute('aria-invalid');
  }

  function initRoles() {
    roleInputs.forEach(function (input) {
      const meta = ROLES[input.value];
      if (!meta) return;
      const card = input.closest('.role-card');
      if (!card) return;
      const name = card.querySelector('[data-role-label]');
      const description = card.querySelector('[data-role-description]');
      if (name) name.textContent = meta.label;
      if (description) description.textContent = meta.description;
      card.setAttribute('data-role-icon', meta.icon);

      input.addEventListener('change', function () {
        if (!input.checked) return;
        updateRoleUI(input.value, true);
        clearRoleError();
      });
    });

    const params = new URLSearchParams(window.location.search);
    const queryRole = params.get('role');
    const remembered = isSignup ? null : readRemembered();
    const lastRole = readStorage(STORAGE.lastRole);
    let initialRole = '';

    if (queryRole && ROLES[queryRole]) initialRole = queryRole;
    else if (!isSignup && remembered && ROLES[remembered.role]) initialRole = remembered.role;
    else if (!isSignup && lastRole && ROLES[lastRole]) initialRole = lastRole;

    if (initialRole) setRole(initialRole, false);
    else updateRoleUI('', false);

    if (!isSignup && remembered && remembered.email) {
      const email = document.getElementById('login-email');
      const remember = document.getElementById('login-remember');
      if (email) email.value = remembered.email;
      if (remember) remember.checked = true;
    }
  }

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        const field = button.closest('.auth-field__control');
        const input = field ? field.querySelector('input') : null;
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        const label = button.querySelector('[data-toggle-label]');
        if (label) label.textContent = show ? 'Hide' : 'Show';
      });
    });
  }

  function initCapsLock() {
    document.querySelectorAll('.auth-field__control--password input').forEach(function (input) {
      const field = input.closest('.auth-field');
      const hint = field ? field.querySelector('.auth-caps') : null;
      if (!hint) return;

      input.addEventListener('keyup', function (event) {
        if (!event.getModifierState) return;
        hint.hidden = !event.getModifierState('CapsLock');
      });

      input.addEventListener('blur', function () {
        hint.hidden = true;
      });
    });
  }

  function nameError(value) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return 'Enter a name between 2 and 60 characters.';
    if (!/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(trimmed)) return 'Use letters, spaces, hyphens or apostrophes only.';
    return '';
  }

  function emailError(value) {
    const trimmed = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed)) return 'Enter a valid email address with a domain and TLD.';
    if (trimmed.indexOf('..') !== -1) return 'Remove repeated dots from the email address.';

    const parts = trimmed.split('@');
    if (parts.length !== 2) return 'Enter a valid email address.';
    if (parts[0].charAt(0) === '.' || parts[0].charAt(parts[0].length - 1) === '.') return 'Remove dots from the start or end of the email address.';
    if (parts[1].charAt(0) === '.' || parts[1].charAt(parts[1].length - 1) === '.') return 'Remove dots from the start or end of the email address.';
    if (DISPOSABLE_DOMAINS.indexOf(parts[1]) !== -1) return 'Use a work email address, not a disposable one.';
    return '';
  }

  function companyError(value) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 80) return 'Enter a company name between 2 and 80 characters.';
    return '';
  }

  function passwordRules(value) {
    return {
      length: value.length >= 10 && value.length <= 72,
      case: /[a-z]/.test(value) && /[A-Z]/.test(value),
      number: /\d/.test(value),
      symbol: /[^A-Za-z0-9\s]/.test(value),
      space: !/\s/.test(value)
    };
  }

  function isCommonPassword(value) {
    const lower = value.toLowerCase();
    return COMMON_PASSWORDS.some(function (common) {
      return lower.indexOf(common) !== -1;
    });
  }

  function isPersonalPassword(value, name, email) {
    const lower = value.toLowerCase();
    const emailLocal = (email || '').trim().toLowerCase().split('@')[0];
    if (emailLocal.length >= 2 && lower.indexOf(emailLocal) !== -1) return true;

    const fullName = (name || '').trim().toLowerCase();
    if (fullName.length >= 2 && lower.indexOf(fullName) !== -1) return true;

    const tokens = fullName.split(/[\s'-]+/).filter(function (token) { return token.length >= 2; });
    return tokens.some(function (token) { return lower.indexOf(token) !== -1; });
  }

  function passwordStrength(value, name, email) {
    const rules = passwordRules(value);
    const core = [rules.length, rules.case, rules.number, rules.symbol].filter(Boolean).length;
    let level = 0;

    if (value.length === 0) level = 0;
    else if (core <= 1) level = 1;
    else if (core === 2) level = 2;
    else if (core === 3) level = 3;
    else level = 4;

    if (level === 4 && (!rules.space || isCommonPassword(value) || isPersonalPassword(value, name, email))) level = 3;
    return { level: level, rules: rules };
  }

  function strengthName(level) {
    if (level === 1) return 'weak';
    if (level === 2) return 'fair';
    if (level === 3) return 'good';
    if (level === 4) return 'strong';
    return '';
  }

  function passwordError(value, name, email) {
    if (!value) return 'Enter a password.';
    if (value.length < 10 || value.length > 72) return 'Use 10 to 72 characters.';
    if (/\s/.test(value)) return 'Remove spaces from the password.';
    if (isCommonPassword(value)) return 'This password is too common. Choose something less predictable.';
    if (isPersonalPassword(value, name, email)) return 'Don’t use your name or email address in the password.';

    const rules = passwordRules(value);
    if (!rules.case || !rules.number || !rules.symbol) return 'Meet all five password rules.';
    return '';
  }

  function loginPasswordError(value) {
    if (!value) return 'Enter your password.';
    if (value.length < 10 || value.length > 72) return 'Use 10 to 72 characters.';
    if (/\s/.test(value)) return 'Remove spaces from the password.';
    if (isCommonPassword(value)) return 'This password is too common. Choose something less predictable.';

    const rules = passwordRules(value);
    if (!rules.case || !rules.number || !rules.symbol) return 'Use upper and lower case, a number and a symbol.';
    return '';
  }

  function makeField(key, label, element, error, validate) {
    return {
      key: key,
      label: label,
      element: element,
      error: error,
      validate: validate,
      touched: false,
      message: '',
      group: null
    };
  }

  function setFieldError(item, message) {
    item.message = message;
    if (item.error) {
      item.error.hidden = false;
      const text = item.error.querySelector('[data-error-text]');
      if (text) text.textContent = message;
    }
    if (item.element) item.element.setAttribute('aria-invalid', 'true');
    if (item.group) item.group.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(item) {
    item.message = '';
    if (item.error) {
      item.error.hidden = true;
      const text = item.error.querySelector('[data-error-text]');
      if (text) text.textContent = '';
    }
    if (item.element) item.element.removeAttribute('aria-invalid');
    if (item.group) item.group.removeAttribute('aria-invalid');
  }

  function validateField(item) {
    const message = item.validate();
    if (message) {
      setFieldError(item, message);
      return false;
    }
    clearFieldError(item);
    return true;
  }

  function clearSummary() {
    if (!summary || !errorList) return;
    summary.hidden = true;
    errorList.textContent = '';
  }

  function showSummary(invalidFields) {
    if (!summary || !errorList) return;
    errorList.textContent = '';

    invalidFields.forEach(function (item) {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#' + (item.element ? item.element.id : '');
      link.textContent = item.label + ' — ' + item.message;
      link.addEventListener('click', function (event) {
        event.preventDefault();
        if (item.element) item.element.focus();
      });
      listItem.appendChild(link);
      errorList.appendChild(listItem);
    });

    summary.hidden = false;
    summary.focus();

    if (invalidFields[0] && invalidFields[0].element) {
      window.setTimeout(function () {
        invalidFields[0].element.focus();
      }, 60);
    }
  }

  function setSubmitting(state, label) {
    if (!submit) return;
    submit.disabled = state;
    submit.classList.toggle('is-sending', state);
    submit.setAttribute('aria-busy', String(state));
    if (submitLabel) {
      submitLabel.textContent = state ? label : (submitLabel.dataset.base || (isSignup ? 'Create account' : 'Sign in'));
    }
  }

  function setAlert(message) {
    if (!authAlert) return;
    authAlert.hidden = !message;
    authAlert.textContent = message || '';
  }

  function initSignup() {
    if (!form) return;

    const nameInput = form.querySelector('#signup-name');
    const emailInput = form.querySelector('#signup-email');
    const companyInput = form.querySelector('#signup-company');
    const passwordInput = form.querySelector('#signup-password');
    const confirmInput = form.querySelector('#signup-confirm');
    const termsInput = form.querySelector('#signup-terms');
    const roleError = document.getElementById('signup-role-error');
    const roleGroup = form.querySelector('.auth-roles');
    const strength = form.querySelector('[data-strength]');
    const rulesList = form.querySelector('[data-password-rules]');
    const passwordStatus = form.querySelector('[data-password-status]');
    const match = form.querySelector('[data-password-match]');
    const successTitle = signupSuccess ? signupSuccess.querySelector('[data-success-title]') : null;
    const successCopy = signupSuccess ? signupSuccess.querySelector('[data-success-copy]') : null;
    const successLink = signupSuccess ? signupSuccess.querySelector('[data-success-link]') : null;

    if (!nameInput || !emailInput || !companyInput || !passwordInput || !confirmInput || !termsInput) return;

    const roleField = makeField('role', 'Role', roleInputs[0], roleError, function () {
      return selectedRole() ? '' : 'Choose a role to continue.';
    });
    roleField.group = roleGroup;

    const fields = [
      makeField('name', 'Full name', nameInput, document.getElementById('signup-name-error'), function () { return nameError(nameInput.value); }),
      makeField('email', 'Work email', emailInput, document.getElementById('signup-email-error'), function () { return emailError(emailInput.value); }),
      makeField('company', 'Company', companyInput, document.getElementById('signup-company-error'), function () { return companyError(companyInput.value); }),
      roleField,
      makeField('password', 'Password', passwordInput, document.getElementById('signup-password-error'), function () { return passwordError(passwordInput.value, nameInput.value, emailInput.value); }),
      makeField('confirm', 'Confirm password', confirmInput, document.getElementById('signup-confirm-error'), function () {
        if (!confirmInput.value) return 'Confirm your password.';
        return confirmInput.value === passwordInput.value ? '' : 'Passwords do not match.';
      }),
      makeField('terms', 'Terms', termsInput, document.getElementById('signup-terms-error'), function () {
        return termsInput.checked ? '' : 'Agree to the Terms and Privacy Policy to continue.';
      })
    ];

    const confirmField = fields[5];

    const updateMatch = function () {
      if (!match) return;
      const both = passwordInput.value && confirmInput.value;
      const equal = both && passwordInput.value === confirmInput.value;
      match.hidden = !equal;
    };

    const updatePasswordUI = function () {
      const assessment = passwordStrength(passwordInput.value, nameInput.value, emailInput.value);
      const rules = assessment.rules;
      Object.keys(rules).forEach(function (key) {
        const row = rulesList ? rulesList.querySelector('[data-rule="' + key + '"]') : null;
        if (row) row.classList.toggle('is-met', rules[key]);
      });

      const met = Object.keys(rules).filter(function (key) { return rules[key]; }).length;
      if (passwordStatus) passwordStatus.textContent = met + ' of 5 password rules met.';
      if (strength) strength.setAttribute('data-level', String(assessment.level));

      if (strength) {
        strength.querySelectorAll('[data-strength-label]').forEach(function (label) {
          label.classList.toggle('is-active', label.getAttribute('data-strength-label') === strengthName(assessment.level));
        });
      }

      updateMatch();
    };

    fields.forEach(function (item) {
      if (!item.element) return;
      item.element.addEventListener('blur', function () {
        item.touched = true;
        validateField(item);
      });
      item.element.addEventListener('input', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
      });
      item.element.addEventListener('change', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
      });
    });

    passwordInput.addEventListener('input', updatePasswordUI);
    confirmInput.addEventListener('input', function () {
      updateMatch();
      if (confirmField.touched && confirmInput.getAttribute('aria-invalid') === 'true') validateField(confirmField);
    });
    [nameInput, emailInput].forEach(function (input) {
      input.addEventListener('input', function () {
        updatePasswordUI();
        if (fields[4].touched && passwordInput.getAttribute('aria-invalid') === 'true') validateField(fields[4]);
      });
    });

    updatePasswordUI();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (submitting) return;

      clearSummary();
      const invalid = [];
      fields.forEach(function (item) {
        item.touched = true;
        if (!validateField(item)) invalid.push(item);
      });

      if (invalid.length) {
        showSummary(invalid);
        return;
      }

      emailInput.value = emailInput.value.trim().toLowerCase();
      nameInput.value = nameInput.value.trim();
      companyInput.value = companyInput.value.trim();

      submitting = true;
      setSubmitting(true, 'Creating account…');

      // Front-end simulation only. Replace this timeout with POST /api/auth/signup.
      window.setTimeout(function () {
        submitting = false;
        setSubmitting(false);

        const role = selectedRole();
        const meta = ROLES[role];
        if (!meta || !signupSuccess) return;

        const session = startSession({
          name: nameInput.value,
          email: emailInput.value,
          company: companyInput.value,
          role: role,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        });
        if (!session) {
          setAlert('We could not start your session in this browser. Check that site storage is enabled.');
          return;
        }

        const firstName = nameInput.value.split(/\s+/)[0] || 'there';
        if (successTitle) successTitle.textContent = 'Welcome, ' + firstName + '.';
        if (successCopy) successCopy.textContent = 'Your ' + meta.label.toLowerCase() + ' workspace is ready.';
        if (successLink) successLink.href = destinationForRole(role);

        if (formContent) formContent.hidden = true;
        signupSuccess.hidden = false;
        signupSuccess.focus();
      }, 1000);
    });
  }

  function initLogin() {
    if (!form) return;

    const emailInput = form.querySelector('#login-email');
    const passwordInput = form.querySelector('#login-password');
    const rememberInput = form.querySelector('#login-remember');
    const roleError = document.getElementById('login-role-error');
    const roleGroup = form.querySelector('.auth-roles');
    if (!emailInput || !passwordInput) return;

    const roleField = makeField('role', 'Role', roleInputs[0], roleError, function () {
      return selectedRole() ? '' : 'Choose a role to continue.';
    });
    roleField.group = roleGroup;

    const fields = [
      makeField('email', 'Work email', emailInput, document.getElementById('login-email-error'), function () { return emailError(emailInput.value); }),
      makeField('password', 'Password', passwordInput, document.getElementById('login-password-error'), function () {
        return loginPasswordError(passwordInput.value);
      }),
      roleField
    ];

    fields.forEach(function (item) {
      if (!item.element) return;
      item.element.addEventListener('blur', function () {
        item.touched = true;
        validateField(item);
      });
      item.element.addEventListener('input', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
      });
      item.element.addEventListener('change', function () {
        if (item.touched && item.element.getAttribute('aria-invalid') === 'true') validateField(item);
      });
    });

    const setLocked = function (remaining) {
      if (!submit) return;
      submit.disabled = true;
      submit.classList.remove('is-sending');
      submit.setAttribute('aria-busy', 'false');
      if (submitLabel) submitLabel.textContent = 'Try again in ' + remaining + 's';
    };

    const startLockout = function () {
      locked = true;
      let remaining = 10;
      setAlert('Too many attempts — try again in a moment.');
      setLocked(remaining);

      lockTimer = window.setInterval(function () {
        remaining -= 1;
        if (remaining > 0) {
          setLocked(remaining);
          return;
        }

        window.clearInterval(lockTimer);
        lockTimer = 0;
        locked = false;
        failedAttempts = 0;
        if (submit) {
          submit.disabled = false;
          submit.setAttribute('aria-busy', 'false');
        }
        if (submitLabel) submitLabel.textContent = submitLabel.dataset.base || 'Sign in';
        setAlert('');
      }, 1000);
    };

    const handleFailure = function () {
      failedAttempts += 1;
      if (failedAttempts >= 3) startLockout();
      else setAlert('Email or password is incorrect.');
    };

    const showLoginSuccess = function (meta, destination) {
      setAlert('');
      if (authSuccess) {
        authSuccess.hidden = false;
        authSuccess.textContent = 'Signed in — taking you to your ' + meta.workspace + '…';
        window.requestAnimationFrame(function () {
          authSuccess.classList.add('is-visible');
        });
      }
      window.setTimeout(function () {
        window.location.href = destination;
      }, 1200);
    };

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (submitting || locked) return;

      clearSummary();
      setAlert('');

      const invalid = [];
      fields.forEach(function (item) {
        item.touched = true;
        if (!validateField(item)) invalid.push(item);
      });

      if (invalid.length) {
        showSummary(invalid);
        return;
      }

      const email = emailInput.value.trim().toLowerCase();
      emailInput.value = email;
      const role = selectedRole();
      const meta = ROLES[role];
      if (!meta) return;

      submitting = true;
      setSubmitting(true, 'Signing in…');

      // Front-end simulation only. Replace this timeout with POST /api/auth/login.
      // This prototype accepts any valid email and any password that passes the
      // strong-password policy; there is no real credential store to compare against.
      window.setTimeout(function () {
        submitting = false;
        setSubmitting(false);

        const profile = profileFromEmail(email);
        const existing = window.StacklySession ? window.StacklySession.getSession() : null;
        const session = startSession({
          name: existing && existing.email === email ? existing.name : profile.name,
          email: email,
          company: existing && existing.email === email ? existing.company : profile.company,
          role: role,
          createdAt: existing && existing.email === email ? existing.createdAt : new Date().toISOString(),
          lastLogin: new Date().toISOString()
        });
        if (!session) {
          setAlert('We could not start your session in this browser. Check that site storage is enabled.');
          return;
        }
        if (rememberInput && rememberInput.checked) {
          writeStorage(STORAGE.remember, JSON.stringify({ email: email, role: role }));
        } else {
          writeStorage(STORAGE.remember, null);
        }
        showLoginSuccess(meta, destinationForRole(role));
      }, 900);
    });
  }

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

  initImageFallbacks();
  initRoles();
  initPasswordToggles();
  initCapsLock();

  if (isSignup) initSignup();
  else initLogin();
})();
