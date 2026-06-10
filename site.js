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

  function setupAskLauncher() {
    if (document.getElementById('askLauncher')) return;

    var launcher = document.createElement('a');
    launcher.id = 'askLauncher';
    launcher.className = 'ask-launcher';
    launcher.href = '/ask/';
    launcher.setAttribute('aria-label', 'Open Corpus Query');
    launcher.setAttribute('title', 'Open Corpus Query');
    launcher.innerHTML = '<span aria-hidden="true">Q</span><strong>Corpus Query</strong>';

    var style = document.createElement('style');
    style.id = 'ask-launcher-style';
    style.textContent = [
      '.ask-launcher{position:fixed;right:1.25rem;bottom:1.25rem;z-index:50;display:flex;align-items:center;gap:0.45rem;max-width:calc(100vw - 2.5rem);min-height:2.75rem;padding:0.55rem 0.85rem 0.55rem 0.62rem;border:1px solid var(--border);border-radius:999px;background:var(--navy);color:var(--paper);text-decoration:none;box-shadow:0 0.7rem 1.8rem rgba(10,35,72,0.18);font-family:\'Inter\',\'Source Sans Pro\',sans-serif;font-size:0.82rem;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;transition:transform 0.2s,box-shadow 0.2s,background-color 0.2s;}',
      '.ask-launcher span{display:inline-flex;align-items:center;justify-content:center;width:1.45rem;height:1.45rem;border-radius:50%;background:rgba(255,255,255,0.16);font-size:0.9rem;font-weight:600;line-height:1;}',
      '.ask-launcher strong{font:inherit;color:inherit;}',
      '.ask-launcher:hover,.ask-launcher:focus{transform:translateY(-1px);box-shadow:0 0.9rem 2.1rem rgba(10,35,72,0.24);outline:none;}',
      '.ask-launcher:focus-visible{outline:2px solid var(--gold);outline-offset:3px;}',
      '@media print{.ask-launcher{display:none;}}',
      '@media (max-width:600px){.ask-launcher{right:0.85rem;bottom:0.85rem;min-height:2.55rem;padding:0.48rem 0.72rem 0.48rem 0.52rem;font-size:0.76rem;}.ask-launcher span{width:1.32rem;height:1.32rem;}}'
    ].join('');

    document.head.appendChild(style);
    document.body.appendChild(launcher);
  }

  onReady(function () {
    setupThemeToggle();
    setupDownloadCounts();
    setupAskLauncher();
  });
})();
