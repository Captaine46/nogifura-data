// Small list images first; bounded idle prefetch never downloads full-size art.
window.VisualImages = (() => {
  const variants = window.VISUAL_DATA.imageVariants || {};
  const smallClasses = new Set(['thumb', 'condition-img', 'own-card-image', 'synchro-image']);
  const sizes = new Map(Object.values(variants).map(v => [v.image, v.bytes]));
  const ready = new Set();
  const foreground = new Set();
  const active = new Set();
  const deferred = typeof window.IntersectionObserver === 'function';
  const budget = 2 * 1024 * 1024;
  let queue = [], spent = 0, timer = null;
  const source = (src, cls) => {
    const variant = variants[src];
    return variant ? smallClasses.has(cls) ? variant.image : src + '?v=' + variant.fullVersion : src;
  };
  const restricted = () => typeof navigator === 'undefined' || document.hidden ||
    navigator.connection?.saveData || ['slow-2g', '2g'].includes(navigator.connection?.effectiveType);
  const later = (delay = 1000) => {
    clearTimeout(timer);
    if (queue.length && !restricted()) timer = setTimeout(pump, delay);
  };
  function pump() {
    timer = null;
    if (restricted()) return;
    for (const image of foreground) if (!image.isConnected) foreground.delete(image);
    if (foreground.size) { later(); return; }
    while (active.size < 2 && queue.length) {
      const url = queue.shift();
      if (ready.has(url) || active.has(url)) continue;
      const bytes = sizes.get(url);
      if (spent + bytes > budget) continue;
      spent += bytes;
      active.add(url);
      fetch(url, {cache: 'force-cache', priority: 'low'})
        .then(response => { if (!response.ok) throw new Error('Image prefetch failed'); return response.arrayBuffer(); })
        .then(() => ready.add(url))
        .catch(() => {})
        .finally(() => { active.delete(url); later(100); });
    }
  }
  function prefetch(current, next = []) {
    if (typeof navigator === 'undefined') return;
    const urls = [...current.slice(0, 12), ...next.slice(0, 16), ...current.slice(12)]
      .map(src => source(src, 'thumb')).filter(url => sizes.has(url));
    queue = [...new Set(urls)].filter(url => !ready.has(url) && !active.has(url));
    later();
  }
  function setup() {
    if (!deferred) return;
    const observed = new Set();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const image = entry.target, url = image.dataset.src;
        foreground.add(image);
        const done = () => {
          foreground.delete(image);
          if (image.naturalWidth) ready.add(url);
          later();
        };
        image.addEventListener('load', done, {once: true});
        image.addEventListener('error', done, {once: true});
        image.loading = 'eager';
        image.fetchPriority = 'high';
        image.src = url;
        image.removeAttribute('data-src');
        observer.unobserve(image);
        observed.delete(image);
      }
    }, {rootMargin: '160px'});
    const watch = root => {
      const images = root.querySelectorAll ? [...root.querySelectorAll('img[data-src]')] : [];
      if (root.matches?.('img[data-src]')) images.push(root);
      for (const image of images) if (!observed.has(image)) { observed.add(image); observer.observe(image); }
    };
    watch(document);
    new MutationObserver(mutations => {
      for (const image of observed) if (!image.isConnected) { observer.unobserve(image); observed.delete(image); }
      for (const mutation of mutations) for (const node of mutation.addedNodes) watch(node);
    }).observe(document.body, {childList: true, subtree: true});
    document.addEventListener('visibilitychange', () => later());
    navigator.connection?.addEventListener?.('change', () => later());
    if (['http:', 'https:'].includes(location.protocol) && navigator.serviceWorker) {
      navigator.serviceWorker.register('image-cache-worker.js?v=' + window.VISUAL_DATA.imageCacheWorkerVersion)
        .catch(() => {}); // HTTP caching remains available if storage is unavailable.
    }
  }
  return {source, ready, deferred, prefetch, setup};
})();
