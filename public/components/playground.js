// ShopGraph Playground — single URL extraction with confidence scoring & execution flags
(function () {
  var state = {
    result: null,
    loading: false,
  };

  function $(id) { return document.getElementById(id); }

  function getOptions() {
    var opts = {};
    var thresholdEl = $('pg-threshold');
    if (thresholdEl && thresholdEl.value && parseFloat(thresholdEl.value) > 0) {
      opts.strict_confidence_threshold = parseFloat(thresholdEl.value);
    }
    // Fetch mode radio: standard vs force_live
    var modeRadio = document.querySelector('input[name="pg-fetch-mode"]:checked');
    if (modeRadio && modeRadio.value === 'force_live') {
      opts.force_refresh = true;
    }
    return opts;
  }

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

    var body = Object.assign({ url: url }, getOptions());

    fetch('/api/playground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  function confColor(conf) {
    if (conf === undefined || conf === null) return '#666';
    if (conf >= 0.80) return '#22c55e';
    if (conf >= 0.50) return '#eab308';
    return '#ef4444';
  }

  function confBadgeClass(conf) {
    if (conf === undefined || conf === null) return 'badge-gray';
    if (conf >= 0.80) return 'badge-green';
    if (conf >= 0.50) return 'badge-yellow';
    return 'badge-red';
  }

  function renderResult(data) {
    var container = $('pg-result');
    if (!data || !container) return;

    if (data.error) {
      var msg = data.message || data.error;
      var link = data.upgrade || data.signup || data.pricing || '';
      var linkHtml = '';
      if (link) {
        var linkText = data.upgrade ? 'See pricing' : data.signup ? 'Get a Free API key' : 'See plans';
        linkHtml = ' <a href="' + link + '" style="color:var(--link-color);font-weight:500">' + linkText + '</a>';
      }
      container.innerHTML = '<div style="background:rgba(0,0,0,0.03);border:1px solid var(--border-color);border-radius:0.375rem;padding:0.75rem 1rem;font-size:0.8125rem;color:var(--body-color)">' + escapeHtml(msg) + linkHtml + '</div>';
      var resultsWrap = $('pg-results');
      if (resultsWrap) resultsWrap.classList.add('visible');
      return;
    }

    // Warning: no product data found (category page, non-product URL)
    if (data.warning === 'no_product_data') {
      container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:0.375rem;padding:0.75rem 1rem;font-size:0.8125rem;color:#92400e">' + escapeHtml(data.warning_message) + '</div>';
      var resultsWrap = $('pg-results');
      if (resultsWrap) resultsWrap.classList.add('visible');
      return;
    }

    var product = data.product || {};
    var shopgraph = product._shopgraph || {};
    var confidence = product.confidence || {};
    var fieldConf = shopgraph.field_confidence || confidence.per_field || {};
    var fieldFreshness = shopgraph.field_freshness || {};
    var method = product.extraction_method || 'unknown';
    var dataSource = shopgraph.data_source || (data.cached ? 'cache' : 'live');
    var creditMode = data.credit_mode || 'standard';
    var extractionStatus = product._extraction_status || {};

    // Header badges
    var html = '<div style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">';
    if (confidence.overall) {
      var oc = confBadgeClass(confidence.overall);
      html += '<span class="badge ' + oc + '">Confidence: ' + (confidence.overall * 100).toFixed(0) + '%</span>';
    }
    html += '<span class="badge badge-blue">' + method + '</span>';

    // Data source badge
    if (dataSource === 'cache') {
      html += '<span class="badge badge-yellow">cache</span>';
    } else {
      html += '<span class="badge badge-green">live</span>';
    }

    // Credit mode badge
    if (creditMode !== 'standard') {
      html += '<span class="badge badge-gray">' + creditMode + '</span>';
    }

    if (data.free_tier) {
      html += '<span class="badge badge-gray">' + data.free_tier.used + '/' + data.free_tier.limit + ' free</span>';
    }
    html += '</div>';

    // Fields table with per-field confidence
    var fields = ['product_name', 'brand', 'price', 'description', 'availability', 'categories', 'image_urls'];
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr style="border-bottom:1px solid rgba(0,0,0,0.08)">';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600">FIELD</th>';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600">VALUE</th>';
    html += '<th style="padding:6px 8px;text-align:right;font-size:11px;color:#999;font-weight:600">CONFIDENCE</th>';
    html += '<th style="padding:6px 8px;text-align:right;font-size:11px;color:#999;font-weight:600">FRESHNESS</th>';
    html += '</tr></thead><tbody>';

    fields.forEach(function (f) {
      var val = product[f];
      var scrubbed = extractionStatus[f];
      var displayVal = val;

      if (scrubbed) {
        displayVal = '<span style="color:#ef4444;font-style:italic" title="' + escapeHtml(scrubbed.message) + '">scrubbed (below threshold)</span>';
      } else if (val === null || val === undefined) {
        displayVal = '<span style="color:#666">--</span>';
      } else if (typeof val === 'object' && val.amount !== undefined) {
        displayVal = (val.currency || '') + ' ' + val.amount;
      } else if (Array.isArray(val)) {
        displayVal = val.length + ' items';
      } else if (typeof displayVal === 'string' && displayVal.length > 80) {
        displayVal = escapeHtml(displayVal.substring(0, 80)) + '...';
      } else {
        displayVal = escapeHtml(String(displayVal));
      }

      var conf = fieldConf[f];
      var confStr = conf !== undefined ? (conf * 100).toFixed(1) + '%' : '';
      var cc = confColor(conf);

      // Freshness indicator
      var freshness = fieldFreshness[f];
      var freshnessStr = '';
      if (freshness) {
        if (freshness.decayed) {
          freshnessStr = '<span style="color:#ef4444" title="Original: ' + ((freshness.original_confidence || 0) * 100).toFixed(1) + '%">decayed</span>';
        } else {
          freshnessStr = '<span style="color:#22c55e">fresh</span>';
        }
      }

      html += '<tr style="border-bottom:1px solid rgba(0,0,0,0.06)">';
      html += '<td style="padding:6px 8px;font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--text-secondary);width:140px">' + f + '</td>';
      html += '<td style="padding:6px 8px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + displayVal + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-weight:600;font-size:11px;width:70px"><span style="color:' + cc + '">' + confStr + '</span></td>';
      html += '<td style="padding:6px 8px;text-align:right;font-size:11px;width:70px">' + freshnessStr + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';

    // Full JSON toggle
    html += '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;color:var(--link-color)">View full JSON response</summary>';
    html += '<pre style="background:#f8f8f8;color:#333;padding:0.875rem 1rem;border-radius:0.5rem;font-size:0.75rem;overflow-x:auto;margin-top:0.5rem;max-height:400px;overflow-y:auto;border:1px solid rgba(0,0,0,0.06)"><code>' + escapeHtml(JSON.stringify(data, null, 2)) + '</code></pre>';
    html += '</details>';

    container.innerHTML = html;

    // After rendering results, show remaining runs
    if (data.runs_remaining !== undefined) {
      var quotaHtml = '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">' + data.runs_remaining + ' / 5 runs left today</div>';
      container.innerHTML += quotaHtml;
    }

    // Add post-extraction CTA
    var ctaHtml = '<div style="margin-top:1rem;padding:0.75rem 1rem;background:rgba(0,0,0,0.03);border:1px solid var(--border-color);border-radius:0.375rem;font-size:0.8125rem;color:var(--text-secondary)">';
    ctaHtml += 'Want to keep going? The Free API tier gives you 50 full-pipeline calls a month with your own key. ';
    ctaHtml += '<a href="/dashboard" style="color:var(--link-color);font-weight:500">Get a Free API key</a>';
    ctaHtml += '</div>';
    container.innerHTML += ctaHtml;

    // Show the results container
    var resultsWrap = $('pg-results');
    if (resultsWrap) resultsWrap.classList.add('visible');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateThresholdDisplay() {
    var el = $('pg-threshold');
    var display = $('pg-threshold-val');
    if (el && display) {
      var val = parseFloat(el.value);
      display.textContent = val > 0 ? val.toFixed(2) : 'Off';
    }
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

    // Threshold slider
    var thresholdEl = $('pg-threshold');
    if (thresholdEl) {
      thresholdEl.addEventListener('input', updateThresholdDisplay);
      updateThresholdDisplay();
    }
  }

  // Export for external use
  window.ShopGraphPlayground = { run: runPlayground };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayground);
  } else {
    initPlayground();
  }
})();
