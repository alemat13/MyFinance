// Applies the saved (or system) dark mode before the app renders, so the page
// never flashes light. A file rather than an inline script so nginx's
// Content-Security-Policy can allow scripts from this origin only.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
})();
