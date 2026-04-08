// Basic JSON syntax highlighting for code blocks
(function () {
  function highlightJSON(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Strings (keys and values)
      .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="token-key">$1</span>:')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="token-string">$1</span>')
      // Standalone strings in arrays
      .replace(/(\[|,)\s*("(?:\\.|[^"\\])*")/g, '$1 <span class="token-string">$2</span>')
      // Numbers
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="token-number">$1</span>')
      // Booleans
      .replace(/:\s*(true|false)/g, ': <span class="token-bool">$1</span>')
      // Null
      .replace(/:\s*(null)/g, ': <span class="token-null">$1</span>');
  }

  function highlightBash(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^(\s*#.*)$/gm, '<span class="token-comment">$1</span>')
      .replace(/^(\s*\$\s*)/gm, '<span class="token-function">$1</span>');
  }

  function highlightJS(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(\/\/.*)$/gm, '<span class="token-comment">$1</span>')
      .replace(/\b(import|export|from|const|let|var|function|return|await|async|new|if|else)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g, '<span class="token-string">$1</span>');
  }

  function processBlocks() {
    document.querySelectorAll('pre[data-lang]').forEach(function (pre) {
      var code = pre.querySelector('code');
      if (!code || code.dataset.highlighted) return;

      var lang = pre.dataset.lang;
      var raw = code.textContent;

      if (lang === 'json') {
        code.innerHTML = highlightJSON(raw);
      } else if (lang === 'bash' || lang === 'shell') {
        code.innerHTML = highlightBash(raw);
      } else if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
        code.innerHTML = highlightJS(raw);
      }

      code.dataset.highlighted = 'true';
    });

    // Add copy buttons
    document.querySelectorAll('.code-header .copy-btn').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        var pre = btn.closest('.code-header').nextElementSibling;
        if (!pre) return;
        var text = pre.textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processBlocks);
  } else {
    processBlocks();
  }
})();
