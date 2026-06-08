(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function getStoredTheme() {
    try {
      return window.localStorage.getItem('theme');
    } catch (error) {
      return null;
    }
  }

  function setStoredTheme(value) {
    try {
      window.localStorage.setItem('theme', value);
    } catch (error) {
      // Ignore private-mode or blocked-storage failures.
    }
  }

  function setThemeIcon(button, root) {
    button.textContent = root.classList.contains('dark') ? '\u2600' : '\u263e';
  }

  function setupThemeToggle() {
    var button = document.getElementById('themeToggle');
    if (!button) return;

    var root = document.documentElement;
    var storedTheme = getStoredTheme();

    if (storedTheme === 'dark') {
      root.classList.add('dark');
    } else if (storedTheme === 'light') {
      root.classList.add('light');
    }

    setThemeIcon(button, root);

    button.addEventListener('click', function () {
      if (root.classList.contains('dark')) {
        root.classList.remove('dark');
        root.classList.add('light');
        setStoredTheme('light');
      } else {
        root.classList.remove('light');
        root.classList.add('dark');
        setStoredTheme('dark');
      }

      setThemeIcon(button, root);
    });
  }

  function downloadKeyFor(link) {
    if (link.querySelector('img')) return null;

    var href = link.getAttribute('href');
    if (!href || href.indexOf('/dl/') !== 0) return null;

    try {
      var url = new URL(href, window.location.href);
      if (url.pathname.indexOf('/dl/') !== 0) return null;
      return decodeURIComponent(url.pathname.replace(/^\/dl\//, ''));
    } catch (error) {
      return href.replace(/^\/dl\//, '').split(/[?#]/)[0];
    }
  }

  function ensureDownloadCountSpan(link) {
    var span = link.querySelector('.dlc');
    if (!span) {
      span = document.createElement('span');
      span.className = 'dlc';
      link.appendChild(span);
    }
    return span;
  }

  function formatCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return number.toLocaleString();
  }

  function renderDownloadCounts(stats, links) {
    links.forEach(function (link) {
      var key = downloadKeyFor(link);
      if (!key) return;

      var count = Object.prototype.hasOwnProperty.call(stats, key) ? stats[key] : 0;
      var span = ensureDownloadCountSpan(link);
      var formatted = formatCount(count);

      span.textContent = ' \u00b7 ' + formatted + ' \u2b07';
      span.setAttribute('aria-label', formatted + ' downloads');
      span.setAttribute('title', formatted + ' downloads');
    });
  }

  function setupDownloadCounts() {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="/dl/"]'))
      .filter(function (link) {
        return downloadKeyFor(link);
      });

    if (!links.length) return;

    if (!document.getElementById('download-count-style')) {
      var style = document.createElement('style');
      style.id = 'download-count-style';
      style.textContent = '.dlc{font-size:0.68rem;color:var(--muted);white-space:nowrap;}';
      document.head.appendChild(style);
    }

    function update() {
      fetch('/dl/stats', { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('download stats unavailable');
          return response.json();
        })
        .then(function (stats) {
          renderDownloadCounts(stats, links);
        })
        .catch(function () {
          // Counts are enhancement-only; downloads must keep working without them.
        });
    }

    update();

    links.forEach(function (link) {
      link.addEventListener('click', function () {
        window.setTimeout(update, 1500);
      });
    });
  }

  onReady(function () {
    setupThemeToggle();
    setupDownloadCounts();
  });
})();
