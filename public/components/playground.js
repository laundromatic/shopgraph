// ShopGraph Playground — single URL extraction with confidence scoring & execution flags
(function () {
  var state = {
    result: null,
    loading: false,
    threshold: 0,
  };

  function $(id) { return document.getElementById(id); }

  function getOptions() {
    var opts = {};
    // Fetch mode radio: standard vs force_live. Threshold is NOT sent
    // pre-extraction anymore — users drag a post-extraction slider to
    // filter visually (Scope 2 of Phase 4 Playground enhancement).
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
    state.threshold = 0;
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

  // Map an extraction tier enum value to a human-readable SOURCE label.
  function sourceLabel(method) {
    if (!method) return '—';
    if (method === 'schema_org') return 'Schema.org';
    if (method === 'llm') return 'LLM inference';
    if (method === 'llm_boosted') return 'LLM + Schema.org';
    if (method === 'hybrid') return 'Schema.org + LLM';
    if (method === 'playwright') return 'Browser rendering';
    return method;
  }

  // Resolve the per-field source: prefer _shopgraph.field_method[f] (per-field
  // attribution), fall back to the document-level extraction_method when the
  // per-field map is absent (e.g. older cached responses during rollout).
  function fieldSource(shopgraph, documentMethod, field) {
    if (shopgraph && shopgraph.field_method && shopgraph.field_method[field]) {
      return shopgraph.field_method[field];
    }
    return documentMethod;
  }

  // Tier baseline confidence per extraction method (matches src/types.ts).
  function tierBaseline(method) {
    if (method === 'schema_org') return 0.93;
    if (method === 'llm') return 0.70;
    if (method === 'llm_boosted') return 0.85;
    if (method === 'hybrid') return 0.85;
    return null;
  }

  function renderResult(data) {
    var container = $('pg-result');
    if (!data || !container) return;

    if (data.error) {
      var msg = data.message || data.error;
      var link = data.upgrade || data.signup || data.pricing || '';
      var linkHtml = '';
      if (link) {
        linkHtml = ' <a href="' + link + '" style="color:var(--link-color);font-weight:500">See pricing</a>';
      }
      container.innerHTML = '<div style="background:rgba(0,0,0,0.03);border:1px solid var(--border-color);border-radius:0.375rem;padding:0.75rem 1rem;font-size:0.8125rem;color:var(--body-color)">' + escapeHtml(msg) + linkHtml + '</div>';
      var errWrap = $('pg-results');
      if (errWrap) errWrap.classList.add('visible');
      return;
    }

    if (data.warning === 'no_product_data') {
      container.innerHTML = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:0.375rem;padding:0.75rem 1rem;font-size:0.8125rem;color:#92400e">' + escapeHtml(data.warning_message) + '</div>';
      var warnWrap = $('pg-results');
      if (warnWrap) warnWrap.classList.add('visible');
      return;
    }

    var product = data.product || {};
    var shopgraph = product._shopgraph || {};
    var confidence = product.confidence || {};
    var fieldConf = shopgraph.field_confidence || confidence.per_field || {};
    var fieldFreshness = shopgraph.field_freshness || {};
    var method = product.extraction_method || shopgraph.extraction_method || 'unknown';
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
    if (dataSource === 'cache') {
      html += '<span class="badge badge-yellow">cache</span>';
    } else {
      html += '<span class="badge badge-green">live</span>';
    }
    if (creditMode !== 'standard') {
      html += '<span class="badge badge-gray">' + creditMode + '</span>';
    }
    if (data.free_tier) {
      html += '<span class="badge badge-gray">' + data.free_tier.used + '/' + data.free_tier.limit + ' free</span>';
    }
    html += '</div>';

    // Fields table: [expand caret] | FIELD | VALUE | SOURCE | CONFIDENCE | FRESHNESS
    var fields = ['product_name', 'brand', 'price', 'description', 'availability', 'categories', 'image_urls'];
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse" id="pg-fields-table"><thead><tr style="border-bottom:1px solid rgba(0,0,0,0.08)">';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600;width:24px"></th>';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600">FIELD</th>';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600">VALUE</th>';
    html += '<th style="padding:6px 8px;text-align:left;font-size:11px;color:#999;font-weight:600">SOURCE</th>';
    html += '<th style="padding:6px 8px;text-align:right;font-size:11px;color:#999;font-weight:600">CONFIDENCE</th>';
    html += '<th style="padding:6px 8px;text-align:right;font-size:11px;color:#999;font-weight:600">FRESHNESS</th>';
    html += '</tr></thead><tbody>';

    fields.forEach(function (f) {
      var val = product[f];
      var scrubbed = extractionStatus[f];
      var displayVal;

      if (scrubbed) {
        displayVal = '<span style="color:#ef4444;font-style:italic">scrubbed (below threshold)</span>';
      } else if (val === null || val === undefined) {
        displayVal = '<span style="color:#666">—</span>';
      } else if (typeof val === 'object' && val.amount !== undefined) {
        displayVal = (val.currency || '') + ' ' + val.amount;
      } else if (Array.isArray(val)) {
        if (val.length === 0) {
          displayVal = '<span style="color:#666">—</span>';
        } else if (f === 'image_urls') {
          // URL arrays stay as a count — rendering the hrefs inline is noise.
          displayVal = val.length + ' URLs';
        } else if (val.every(function (item) { return typeof item === 'string'; })) {
          var joined = val.join(', ');
          displayVal = joined.length > 80 ? escapeHtml(joined.substring(0, 80)) + '…' : escapeHtml(joined);
        } else {
          displayVal = val.length + ' items';
        }
      } else if (typeof val === 'string' && val.length > 80) {
        displayVal = escapeHtml(val.substring(0, 80)) + '...';
      } else {
        displayVal = escapeHtml(String(val));
      }

      var conf = fieldConf[f];
      var hasConf = conf !== undefined && conf !== null;
      var confStr = hasConf ? (conf * 100).toFixed(1) + '%' : '';
      var confPillClass = hasConf ? confBadgeClass(conf) : '';
      var source = hasConf ? sourceLabel(fieldSource(shopgraph, method, f)) : '—';

      var freshness = fieldFreshness[f];
      var freshnessStr = '';
      if (dataSource === 'live' && hasConf) {
        freshnessStr = '<span style="color:#22c55e">Live</span>';
      } else if (freshness) {
        if (freshness.decayed) {
          freshnessStr = '<span style="color:#ef4444" title="Original: ' + ((freshness.original_confidence || 0) * 100).toFixed(1) + '%">decayed</span>';
        } else {
          freshnessStr = '<span style="color:#22c55e">fresh</span>';
        }
      }

      // Field row — clickable to expand breakdown
      var confAttr = hasConf ? conf : '';
      html += '<tr class="pg-field-row" data-field="' + f + '" data-conf="' + confAttr + '" style="border-bottom:1px solid rgba(0,0,0,0.06);cursor:pointer;transition:opacity 0.2s" onclick="window.ShopGraphPlayground.toggleRow(\'' + f + '\')">';
      html += '<td style="padding:6px 8px;text-align:center;font-size:10px;color:#999;user-select:none"><span id="pg-caret-' + f + '">&#9656;</span></td>';
      html += '<td style="padding:6px 8px;font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--text-secondary);width:140px">' + f + '</td>';
      html += '<td class="pg-value-cell" style="padding:6px 8px;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + displayVal + '</td>';
      html += '<td style="padding:6px 8px;font-size:11px;color:var(--text-secondary)">' + source + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;width:80px">' + (hasConf ? '<span class="badge ' + confPillClass + '">' + confStr + '</span>' : '') + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-size:11px;width:70px">' + freshnessStr + '</td>';
      html += '</tr>';

      // Detail row (collapsed by default)
      html += '<tr class="pg-field-detail" id="pg-detail-' + f + '" style="display:none"><td colspan="6" style="padding:12px 16px;background:rgba(0,0,0,0.02);border-bottom:1px solid rgba(0,0,0,0.06)">';
      html += buildBreakdownHtml(f, conf, method, shopgraph);
      html += '<div style="margin-top:8px;font-size:11px"><a href="/features/confidence" style="color:var(--link-color)">How scores are calculated &rarr;</a></div>';
      html += '</td></tr>';
    });
    html += '</tbody></table>';

    // Post-extraction threshold slider
    html += '<div id="pg-threshold-panel" style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06)">';
    html += '<label style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--text-secondary);font-weight:500">';
    html += '<span style="white-space:nowrap">Filter fields below:</span>';
    html += '<span id="pg-filter-val" style="font-family:var(--font-mono);color:#111;min-width:40px">0.00</span>';
    html += '<input id="pg-filter-slider" type="range" min="0" max="1" step="0.05" value="0" style="flex:1;max-width:240px;accent-color:#007AFF">';
    html += '</label>';
    html += '<p style="font-size:11px;color:#222222;margin:8px 0 0">This slider simulates the <code style="font-size:11px">strict_confidence_threshold</code> API parameter. In production, filtered fields are removed server-side before reaching your agent.</p>';
    html += '</div>';

    // Cross-link: back to How Extraction Works
    html += '<div style="margin-top:12px;font-size:12px"><a href="/features/self-healing" style="color:#222222;text-decoration:underline">Want to understand the pipeline? &rarr; How Extraction Works</a></div>';

    // Full JSON toggle
    html += '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:12px;color:var(--link-color)">View full JSON response</summary>';
    html += '<pre style="background:#f8f8f8;color:#333;padding:0.875rem 1rem;border-radius:0.5rem;font-size:0.75rem;overflow-x:auto;margin-top:0.5rem;max-height:400px;overflow-y:auto;border:1px solid rgba(0,0,0,0.06)"><code>' + escapeHtml(JSON.stringify(data, null, 2)) + '</code></pre>';
    html += '</details>';

    // Quota footer (append to html BEFORE innerHTML assignment — later
    // innerHTML mutations would detach listeners attached below).
    if (data.runs_remaining !== undefined) {
      html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">' + data.runs_remaining + ' / 5 runs left today</div>';
    }

    container.innerHTML = html;

    // Wire post-extraction threshold slider (after innerHTML assignment)
    var slider = $('pg-filter-slider');
    var valEl = $('pg-filter-val');
    if (slider) {
      slider.addEventListener('input', function () {
        var t = parseFloat(slider.value);
        state.threshold = t;
        if (valEl) valEl.textContent = t.toFixed(2);
        applyFilter(t);
      });
    }

    var resultsWrap = $('pg-results');
    if (resultsWrap) resultsWrap.classList.add('visible');

    // Close/clear button
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Clear results';
    closeBtn.style.cssText = 'background:none;border:1px solid var(--border-color);border-radius:0.375rem;padding:0.25rem 0.75rem;font-size:0.75rem;color:var(--text-secondary);cursor:pointer;margin-bottom:0.75rem;font-family:var(--font-sans)';
    closeBtn.addEventListener('click', function () {
      container.innerHTML = '';
      if (resultsWrap) resultsWrap.classList.remove('visible');
    });
    container.insertBefore(closeBtn, container.firstChild);
  }

  // Build the per-field confidence breakdown block shown when a row expands.
  // Prefers the full ledger at _shopgraph.field_modifiers[field] when present
  // (every base, delta with reason/source, and the final result). Falls back
  // to the baseline-only rendering for older cached responses that lack the
  // per-field ledger.
  function buildBreakdownHtml(field, conf, method, shopgraph) {
    if (conf === undefined || conf === null) {
      return '<div style="font-family:var(--font-mono);font-size:11px;color:var(--body-color)">' +
             escapeHtml(field) + ': no confidence scoring' +
             '</div><div style="font-size:11px;color:var(--text-secondary);margin-top:4px">List fields report count only. Confidence scoring applies to scalar values (price, title, brand, availability).</div>';
    }

    var ledger = shopgraph && shopgraph.field_modifiers && shopgraph.field_modifiers[field];
    var fieldMethod = shopgraph && shopgraph.field_method && shopgraph.field_method[field];
    var pct = (conf * 100).toFixed(0) + '%';
    var lines = [];
    lines.push(escapeHtml(field) + ': ' + pct);

    if (ledger && ledger.length > 0) {
      for (var i = 0; i < ledger.length; i++) {
        var entry = ledger[i];
        if (entry && typeof entry.base === 'number') {
          var m = entry.method || fieldMethod || method;
          lines.push('  Base: ' + entry.base.toFixed(2) + ' (' + sourceLabel(m) + ' tier baseline)');
        } else if (entry && typeof entry.delta === 'number') {
          var sign = entry.delta > 0 ? '+' : '';
          var line = '  ' + sign + entry.delta.toFixed(2) + ' ' + (entry.reason || '');
          if (entry.source) line += ' (' + entry.source + ')';
          lines.push(line);
        } else if (entry && typeof entry.result === 'number') {
          lines.push('  = ' + entry.result.toFixed(2));
        }
      }
    } else {
      // Fallback: baseline-only rendering for older cached responses / UCP format.
      var baseline = tierBaseline(fieldMethod || method);
      if (baseline !== null) {
        lines.push('  Base: ' + baseline.toFixed(2) + ' (' + sourceLabel(fieldMethod || method) + ' tier baseline)');
        var delta = conf - baseline;
        if (Math.abs(delta) >= 0.005) {
          var s = delta > 0 ? '+' : '';
          lines.push('  ' + s + delta.toFixed(2) + ' Field-level modifier adjustments');
        }
        lines.push('  = ' + conf.toFixed(2));
      } else {
        lines.push('  (Method: ' + escapeHtml(fieldMethod || method) + ')');
      }
    }

    return '<pre style="margin:0;font-family:var(--font-mono);font-size:11px;background:transparent;padding:0;color:var(--body-color);white-space:pre-wrap">' + lines.join('\n') + '</pre>';
  }

  // Apply the visual filter to rows based on a confidence threshold.
  // Rows below threshold get muted opacity and the value cell is struck
  // through with a "scrubbed (below threshold)" badge. The row is NOT
  // removed — users need to see WHY it was filtered.
  function applyFilter(threshold) {
    var rows = document.querySelectorAll('.pg-field-row');
    rows.forEach(function (row) {
      var confAttr = row.getAttribute('data-conf');
      if (!confAttr) return;
      var conf = parseFloat(confAttr);
      var valCell = row.querySelector('.pg-value-cell');
      if (!valCell) return;
      if (conf < threshold) {
        row.style.opacity = '0.45';
        if (!valCell.dataset.original) {
          valCell.dataset.original = valCell.innerHTML;
          valCell.innerHTML = '<s>' + valCell.dataset.original + '</s> <span style="color:#ef4444;font-style:italic;font-size:11px">scrubbed (below threshold)</span>';
        }
      } else {
        row.style.opacity = '1';
        if (valCell.dataset.original) {
          valCell.innerHTML = valCell.dataset.original;
          delete valCell.dataset.original;
        }
      }
    });
  }

  function toggleRow(field) {
    var detail = document.getElementById('pg-detail-' + field);
    var caret = document.getElementById('pg-caret-' + field);
    if (!detail) return;
    var isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'table-row';
    if (caret) caret.innerHTML = isOpen ? '&#9656;' : '&#9662;';
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // Export for external use + onclick handlers
  window.ShopGraphPlayground = {
    run: runPlayground,
    toggleRow: toggleRow,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayground);
  } else {
    initPlayground();
  }
})();
