// ShopGraph Playground — single URL extraction
(function () {
  var state = {
    result: null,
    loading: false,
  };

  function $(id) { return document.getElementById(id); }

  function runPlayground() {
    var url = $('pg-url').value.trim();
    var btn = $('pg-extract-btn');
    var loading = $('pg-loading');
    var resultEl = $('pg-result');

    if (!url) return;

    state.loading = true;
    btn.disabled = true;
    btn.textContent = 'Extracting...';
    if (loading) loading.style.display = 'block';
    if (resultEl) resultEl.innerHTML = '';
    if ($('pg-error')) $('pg-error').style.display = 'none';

    fetch('/api/enrich/basic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.result = data;
        renderResult(data);
      })
      .catch(function (err) {
        if ($('pg-error')) {
          $('pg-error').style.display = 'block';
          $('pg-error').textContent = 'Error: ' + err.message;
        }
      })
      .finally(function () {
        state.loading = false;
        btn.disabled = false;
        btn.textContent = 'Extract';
        if (loading) loading.style.display = 'none';
      });
  }

  function renderResult(data) {
    var container = $('pg-result');
    if (!data || !container) return;

    if (data.error) {
      container.innerHTML = '<div style="background:#fce8e6;border-radius:8px;padding:12px;color:#611a15;font-size:13px">' + data.error + ': ' + (data.message || '') + '</div>';
      return;
    }

    var product = data.product || {};
    var shopgraph = product._shopgraph || {};
    var confidence = product.confidence || {};
    var fieldConf = shopgraph.field_confidence || confidence.per_field || {};
    var method = product.extraction_method || 'unknown';
    var cached = data.cached;

    // Build result display
    var html = '<div style="margin-bottom:12px">';
    if (confidence.overall) html += '<span class="badge badge-green">Confidence: ' + (confidence.overall * 100).toFixed(0) + '%</span> ';
    html += '<span class="badge badge-blue">' + method + '</span> ';
    if (cached) html += '<span class="badge badge-yellow">cached</span> ';
    if (data.free_tier) html += '<span class="badge badge-gray">' + data.free_tier.used + '/' + data.free_tier.limit + ' free</span>';
    html += '</div>';

    // Fields table
    var fields = ['product_name', 'brand', 'price', 'description', 'availability', 'categories', 'image_urls'];
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse"><tbody>';
    fields.forEach(function (f) {
      var val = product[f];
      if (val === null || val === undefined) return;
      var displayVal = val;
      if (typeof val === 'object' && val.amount !== undefined) displayVal = (val.currency || '') + ' ' + val.amount;
      if (Array.isArray(val)) displayVal = val.length + ' items';
      if (typeof displayVal === 'string' && displayVal.length > 80) displayVal = displayVal.substring(0, 80) + '...';

      var conf = fieldConf[f];
      var confStr = conf !== undefined ? (conf * 100).toFixed(0) + '%' : '';
      var confColor = conf >= 0.9 ? '#16a34a' : (conf >= 0.7 ? '#d97706' : '#dc2626');
      if (conf === undefined) confColor = '#999';

      html += '<tr style="border-bottom:1px solid #f0f0f0">';
      html += '<td style="padding:6px 8px;font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--color-text-secondary);width:140px">' + f + '</td>';
      html += '<td style="padding:6px 8px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + displayVal + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-weight:600;font-size:11px;color:' + confColor + ';width:50px">' + confStr + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';

    // Full JSON toggle
    html += '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;color:var(--color-accent)">View full JSON response</summary>';
    html += '<pre style="background:#1e1e2e;color:#d8dee9;padding:16px;border-radius:8px;font-size:12px;overflow-x:auto;margin-top:8px;max-height:400px;overflow-y:auto"><code>' + escapeHtml(JSON.stringify(data, null, 2)) + '</code></pre>';
    html += '</details>';

    container.innerHTML = html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initPlayground() {
    var btn = $('pg-extract-btn');
    if (!btn) return;

    btn.addEventListener('click', runPlayground);

    var urlInput = $('pg-url');
    if (urlInput) {
      urlInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runPlayground();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayground);
  } else {
    initPlayground();
  }
})();
