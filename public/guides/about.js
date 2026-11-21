(function () {
  var root = document.documentElement;
  var button = document.querySelector('.about-theme');
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  var explicit = null;
  try { explicit = localStorage.getItem('sharetext.theme'); } catch (_) {}
  if (/Mac|iPhone|iPad|iPod/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    root.classList.add('about-apple');
  }
  function apply(dark) {
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#181818' : '#fbfbfd';
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  apply(explicit === 'dark' || (explicit !== 'light' && system.matches));
  button.hidden = false;
  button.addEventListener('click', function () {
    explicit = root.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem('sharetext.theme', explicit); } catch (_) {}
    apply(explicit === 'dark');
  });
  system.addEventListener('change', function (event) {
    if (explicit !== 'light' && explicit !== 'dark') apply(event.matches);
  });
  window.addEventListener('storage', function (event) {
    if (event.key !== 'sharetext.theme' && event.key !== null) return;
    explicit = event.key === null ? null : event.newValue;
    apply(explicit === 'dark' || (explicit !== 'light' && system.matches));
  });
})();
