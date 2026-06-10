(function () {
  'use strict';

  var form = document.getElementById('askForm');
  var question = document.getElementById('question');
  var askButton = document.getElementById('askButton');
  var clearButton = document.getElementById('clearButton');
  var status = document.getElementById('askStatus');
  var panel = document.getElementById('answerPanel');
  var turnsList = document.getElementById('turnsList');
  var sourcesList = document.getElementById('sourcesList');
  var corpusLine = document.getElementById('corpusLine');
  var corpusLoader = document.getElementById('corpusLoader');
  var loaderCaption = document.getElementById('loaderCaption');
  var examples = Array.prototype.slice.call(document.querySelectorAll('[data-question]'));
  var history = [];

  if (!form || !question) return;

  loadStatus();

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitQuestion(question.value);
  });

  clearButton.addEventListener('click', function () {
    question.value = '';
    history = [];
    turnsList.textContent = '';
    sourcesList.textContent = '';
    panel.classList.add('hidden');
    setLoader(false);
    setStatus('');
    question.focus();
  });

  examples.forEach(function (button) {
    button.addEventListener('click', function () {
      question.value = button.getAttribute('data-question') || '';
      setMode(button.getAttribute('data-mode') || 'guide');
      question.focus();
    });
  });

  function loadStatus() {
    fetch('/api/ask-status', { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var chunkText = data && data.corpus ? data.corpus.chunks + ' indexed excerpts' : 'indexed corpus';
        var aiText = data && data.aiReady ? 'answer model ready' : 'answer model pending Cloudflare binding';
        corpusLine.textContent = 'Corpus: monograph, six public preprints, site pages, and citation sources; ' + chunkText + '; ' + aiText + '.';
      })
      .catch(function () {
        corpusLine.textContent = 'Corpus: monograph, six public preprints, site pages, and citation sources.';
      });
  }

  function submitQuestion(value) {
    var text = (value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      setStatus('Enter a question first.', 'error');
      question.focus();
      return;
    }

    setBusy(true);
    setStatus(statusForMode('working'));

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: text,
        mode: currentMode(),
        history: history.slice(-6)
      })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            var error = new Error(data && data.message ? data.message : 'The assistant could not answer.');
            error.payload = data;
            throw error;
          }
          return data;
        });
      })
      .then(function (data) {
        renderAnswer(data, text);
        rememberTurn('user', text);
        rememberTurn('assistant', data.answer || '');
        setStatus(statusForMode('done'));
      })
      .catch(function (error) {
        if (error.payload && Array.isArray(error.payload.citations)) {
          renderAnswer({
            answer: error.payload.message || error.message,
            citations: error.payload.citations
          }, text);
        }
        setStatus(error.message || 'The assistant is unavailable.', 'error');
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function currentMode() {
    var selected = document.querySelector('input[name="askMode"]:checked');
    return selected ? selected.value : 'guide';
  }

  function setMode(value) {
    var input = document.querySelector('input[name="askMode"][value="' + value + '"]');
    if (input) input.checked = true;
  }

  function statusForMode(stage) {
    var mode = currentMode();
    if (stage === 'working') {
      if (mode === 'locate') return 'Locating the strongest corpus matches...';
      if (mode === 'cite') return 'Checking citation sources...';
      return 'Reading the retrieved corpus excerpts...';
    }
    if (mode === 'locate') return 'Locations generated from retrieved corpus excerpts.';
    if (mode === 'cite') return 'Citation answer generated from retrieved corpus excerpts.';
    return 'Answer generated from retrieved corpus excerpts.';
  }

  function rememberTurn(role, content) {
    var text = (content || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    history.push({ role: role, content: text.slice(0, 900) });
    if (history.length > 6) history = history.slice(-6);
  }

  function renderAnswer(data, questionText) {
    if (questionText) {
      appendTurn('user', questionText);
    }
    appendTurn('assistant', data.answer || 'No answer was returned.');
    sourcesList.textContent = '';

    (data.citations || []).forEach(function (source) {
      var card = document.createElement('article');
      card.className = 'source-card';

      var title = document.createElement('strong');
      var link = document.createElement('a');
      link.href = source.url;
      link.textContent = '[' + source.id + '] ' + source.title;
      title.appendChild(link);

      var meta = document.createElement('div');
      meta.className = 'source-meta';
      meta.textContent = source.kind + ' - ' + source.code;

      var excerpt = document.createElement('div');
      excerpt.className = 'source-excerpt';
      excerpt.textContent = source.excerpt || '';

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(excerpt);
      sourcesList.appendChild(card);
    });

    panel.classList.remove('hidden');
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function appendTurn(role, text) {
    var card = document.createElement('article');
    card.className = 'turn-card ' + role;

    var label = document.createElement('div');
    label.className = 'turn-label';
    label.textContent = role === 'user' ? 'You' : 'Corpus response';

    var body = document.createElement('div');
    body.className = 'turn-text';
    renderFormattedText(body, text || '');

    card.appendChild(label);
    card.appendChild(body);
    turnsList.appendChild(card);
  }

  function renderFormattedText(container, text) {
    var pattern = /\*\*([^\n]+?)\*\*/g;
    var lastIndex = 0;
    var match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      var strong = document.createElement('strong');
      strong.textContent = match[1];
      container.appendChild(strong);
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function setBusy(value) {
    askButton.disabled = value;
    clearButton.disabled = value;
    examples.forEach(function (button) { button.disabled = value; });
    askButton.textContent = value ? 'Submitting...' : 'Submit Query';
    setLoader(value);
  }

  function setStatus(message, state) {
    status.textContent = message || '';
    if (state) {
      status.setAttribute('data-state', state);
    } else {
      status.removeAttribute('data-state');
    }
  }

  function setLoader(value) {
    if (!corpusLoader) return;

    if (value) {
      if (loaderCaption) loaderCaption.textContent = loaderTextForMode();
      corpusLoader.classList.remove('hidden');
    } else {
      corpusLoader.classList.add('hidden');
    }
  }

  function loaderTextForMode() {
    var mode = currentMode();
    if (mode === 'locate') return 'Tracing the source route';
    if (mode === 'cite') return 'Checking citation boundary';
    return 'Resolving comparison profiles';
  }
})();
