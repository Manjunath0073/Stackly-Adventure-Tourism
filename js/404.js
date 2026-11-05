/* Page-specific 404 behaviour: route reveal and a safe Go back fallback. */
(function () {
  'use strict';

  const backLink = document.querySelector('[data-go-back]');
  if (backLink) {
    backLink.addEventListener('click', function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (document.referrer) {
        try {
          if (new URL(document.referrer).origin === window.location.origin) {
            window.history.back();
            return;
          }
        } catch (error) {
          /* Fall through to the home page. */
        }
      }
      window.location.assign('/index.html');
    });
  }

  const poster = document.querySelector('.error-poster');
  const routeSvg = document.querySelector('.error-route');
  const dashedPath = document.querySelector('.error-route__path');
  const revealPath = document.querySelector('.error-route__reveal');
  const dot = document.querySelector('.error-route__dot');
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = Boolean(motionQuery && motionQuery.matches);
  let animationStarted = false;
  let animationFinished = false;
  let resizeTimer = 0;

  if (!poster || !routeSvg || !dashedPath || !revealPath || !dot) return;

  function pathData(width, height, endX, endY) {
    const startX = -3;
    const startY = Math.round(height * 0.78);
    return 'M ' + startX + ' ' + startY +
      ' C ' + Math.round(width * 0.13) + ' ' + Math.round(height * 0.82) +
      ', ' + Math.round(width * 0.14) + ' ' + Math.round(height * 0.20) +
      ', ' + Math.round(width * 0.30) + ' ' + Math.round(height * 0.27) +
      ' C ' + Math.round(width * 0.48) + ' ' + Math.round(height * 0.34) +
      ', ' + Math.round(width * 0.42) + ' ' + Math.round(height * 0.74) +
      ', ' + Math.round(width * 0.57) + ' ' + Math.round(height * 0.65) +
      ' C ' + Math.round(width * 0.75) + ' ' + Math.round(height * 0.53) +
      ', ' + Math.round(width * 0.69) + ' ' + Math.round(height * 0.17) +
      ', ' + Math.round(endX) + ' ' + Math.round(endY);
  }

  function setPaths() {
    const posterRect = poster.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();
    const width = Math.max(1, Math.round(posterRect.width));
    const height = Math.max(1, Math.round(posterRect.height));
    const endX = dotRect.left + dotRect.width / 2 - posterRect.left;
    const endY = dotRect.top + dotRect.height / 2 - posterRect.top;
    const data = pathData(width, height, endX, endY);

    routeSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    routeSvg.setAttribute('preserveAspectRatio', 'none');
    dashedPath.setAttribute('d', data);
    revealPath.setAttribute('d', data);
  }

  function finishPath() {
    revealPath.style.transition = 'none';
    revealPath.style.strokeDasharray = 'none';
    revealPath.style.strokeDashoffset = '0';
    animationStarted = true;
    animationFinished = true;
  }

  function drawPath() {
    setPaths();
    if (reducedMotion) {
      finishPath();
      return;
    }
    if (animationStarted) return;

    let length = 0;
    try {
      length = revealPath.getTotalLength();
    } catch (error) {
      length = 0;
    }
    if (!length) {
      finishPath();
      return;
    }

    revealPath.style.transition = 'none';
    revealPath.style.strokeDasharray = length + ' ' + length;
    revealPath.style.strokeDashoffset = length;
    animationStarted = true;

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        revealPath.style.transition = 'stroke-dashoffset 1200ms var(--ease-out)';
        revealPath.style.strokeDashoffset = '0';
        window.setTimeout(function () {
          animationFinished = true;
          setPaths();
          finishPath();
        }, 1250);
      });
    });
  }

  drawPath();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (animationFinished) {
        setPaths();
      }
    });
  }

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(function () {
      if (!animationFinished) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setPaths();
        finishPath();
      }, 120);
    });
    observer.observe(poster);
  } else {
    window.addEventListener('resize', function () {
      if (!animationFinished) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        setPaths();
        finishPath();
      }, 120);
    });
  }
})();
