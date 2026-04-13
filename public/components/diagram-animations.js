// ShopGraph Diagram Animations — IntersectionObserver trigger
// Include this script on any page with .dg-diagram containers.
// Animates all .dg-hidden, .dg-box, .dg-label, .dg-fill, .dg-connector
// elements within the diagram when it scrolls into view.

(function() {
  var diagrams = document.querySelectorAll('.dg-diagram');
  if (!diagrams.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;

      var diagram = entry.target;
      observer.unobserve(diagram);

      // Fade in hidden elements with stagger
      var hidden = diagram.querySelectorAll('.dg-hidden');
      hidden.forEach(function(el) {
        var delay = parseInt(el.getAttribute('data-dg-delay') || '0', 10);
        setTimeout(function() {
          el.classList.remove('dg-hidden');
          el.classList.add('dg-visible');
        }, delay);
      });

      // Trigger box glow animations with stagger
      var boxes = diagram.querySelectorAll('.dg-box');
      boxes.forEach(function(box) {
        var delay = parseInt(box.getAttribute('data-dg-delay') || '0', 10);
        setTimeout(function() {
          box.classList.add('dg-animate');
        }, delay);
      });

      // Trigger label color flash with stagger
      var labels = diagram.querySelectorAll('.dg-label, .dg-fill');
      labels.forEach(function(label) {
        var delay = parseInt(label.getAttribute('data-dg-delay') || '0', 10);
        setTimeout(function() {
          label.classList.add('dg-animate');
        }, delay);
      });

      // Trigger connector pulse
      var connectors = diagram.querySelectorAll('.dg-connector');
      connectors.forEach(function(conn) {
        var delay = parseInt(conn.getAttribute('data-dg-delay') || '0', 10);
        setTimeout(function() {
          conn.classList.add('dg-animate');
        }, delay);
      });
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  diagrams.forEach(function(d) { observer.observe(d); });
})();
