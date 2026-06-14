(function () {
  'use strict';

  var form = document.getElementById('askForm');
  var question = document.getElementById('question');
  var askButton = document.getElementById('askButton');
  var clearButton = document.getElementById('clearButton');
  var status = document.getElementById('askStatus');
  var panel = document.getElementById('answerPanel');
  var turnsList = document.getElementById('turnsList');
  var sourcesPanel = document.getElementById('sourcesPanel');
  var sourcesList = document.getElementById('sourcesList');
  var sourceCount = document.getElementById('sourceCount');
  var followups = document.getElementById('followups');
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
    if (followups) {
      followups.textContent = '';
      followups.classList.add('hidden');
    }
    if (sourcesPanel) sourcesPanel.classList.add('hidden');
    if (sourceCount) sourceCount.textContent = '0 sources';
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
        var retrieval = data && data.corpus && data.corpus.retrieval ? data.corpus.retrieval.replace('-', ' ') : 'static hybrid retrieval';
        corpusLine.textContent = 'Corpus: monograph, six public preprints, site pages, and citation sources; ' + chunkText + '; ' + retrieval + '; ' + aiText + '.';
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
    return selected ? selected.value : 'discuss';
  }

  function setMode(value) {
    if (value === 'guide') value = 'discuss';
    var input = document.querySelector('input[name="askMode"][value="' + value + '"]');
    if (input) input.checked = true;
  }

  function statusForMode(stage) {
    var mode = currentMode();
    if (stage === 'working') {
      if (mode === 'locate') return 'Locating the strongest corpus matches...';
      if (mode === 'cite') return 'Checking citation sources...';
      return 'Thinking through the retrieved corpus context...';
    }
    if (mode === 'locate') return 'Locations generated from retrieved corpus excerpts.';
    if (mode === 'cite') return 'Citation answer generated from retrieved corpus excerpts.';
    return 'Answer generated from the source-bound corpus.';
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
    renderSources(data.citations || []);
    renderFollowups(data.suggestions || []);
    panel.classList.remove('hidden');
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderSources(citations) {
    sourcesList.textContent = '';
    if (sourceCount) {
      sourceCount.textContent = citations.length + (citations.length === 1 ? ' source' : ' sources');
    }
    if (sourcesPanel) {
      sourcesPanel.classList.toggle('hidden', !citations.length);
      sourcesPanel.removeAttribute('open');
    }

    citations.forEach(function (source) {
      var card = document.createElement('article');
      card.className = 'source-card';

      var title = document.createElement('strong');
      var link = document.createElement('a');
      link.href = source.url;
      link.textContent = '[' + source.id + '] ' + source.title;
      title.appendChild(link);

      var meta = document.createElement('div');
      meta.className = 'source-meta';
      meta.textContent = source.kind + ' - ' + source.code + (source.locator ? ' - ' + source.locator : '');

      var details = document.createElement('details');
      var summary = document.createElement('summary');
      summary.textContent = 'Evidence excerpt';
      var excerpt = document.createElement('div');
      excerpt.className = 'source-excerpt';
      excerpt.textContent = source.excerpt || '';
      details.appendChild(summary);
      details.appendChild(excerpt);

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(details);
      sourcesList.appendChild(card);
    });
  }

  function renderFollowups(suggestions) {
    if (!followups) return;
    followups.textContent = '';
    suggestions.slice(0, 3).forEach(function (suggestion) {
      var button = document.createElement('button');
      button.className = 'followup-button';
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', function () {
        question.value = suggestion;
        submitQuestion(suggestion);
      });
      followups.appendChild(button);
    });
    followups.classList.toggle('hidden', !followups.children.length);
  }

  function appendTurn(role, text) {
    var card = document.createElement('article');
    card.className = 'turn-card ' + role;

    var label = document.createElement('div');
    label.className = 'turn-label';
    label.textContent = role === 'user' ? 'You' : 'CRI assistant';

    var body = document.createElement('div');
    body.className = 'turn-text';
    renderFormattedText(body, text || '');

    card.appendChild(label);
    card.appendChild(body);
    turnsList.appendChild(card);
  }

  function renderFormattedText(container, text) {
    container.textContent = '';
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var index = 0;

    while (index < lines.length) {
      var line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        var ul = document.createElement('ul');
        while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
          var li = document.createElement('li');
          appendInline(li, lines[index].replace(/^\s*[-*]\s+/, ''));
          ul.appendChild(li);
          index += 1;
        }
        container.appendChild(ul);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = document.createElement('ol');
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
          var oli = document.createElement('li');
          appendInline(oli, lines[index].replace(/^\s*\d+\.\s+/, ''));
          ol.appendChild(oli);
          index += 1;
        }
        container.appendChild(ol);
        continue;
      }

      var paragraphLines = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^\s*[-*]\s+/.test(lines[index]) &&
        !/^\s*\d+\.\s+/.test(lines[index])
      ) {
        paragraphLines.push(lines[index].replace(/^#{1,4}\s+/, ''));
        index += 1;
      }
      var paragraph = document.createElement('p');
      appendInline(paragraph, paragraphLines.join('\n'));
      container.appendChild(paragraph);
    }
  }

  function appendInline(container, text) {
    var pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[S\d+\])/g;
    var lastIndex = 0;
    var match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      var token = match[0];
      if (token.indexOf('**') === 0) {
        var strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        container.appendChild(strong);
      } else if (token.indexOf('`') === 0) {
        var code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        container.appendChild(code);
      } else {
        var cite = document.createElement('span');
        cite.className = 'citation-ref';
        cite.textContent = token;
        container.appendChild(cite);
      }
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
    askButton.textContent = value ? 'Thinking...' : 'Ask';
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
