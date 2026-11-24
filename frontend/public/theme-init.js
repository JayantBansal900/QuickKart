// Light is the default. Apply a saved dark/system choice before first paint, so dark-mode users never see a white flash.
// A separate file (not inline) so the Content-Security-Policy can allow scripts from 'self' only.
(function () {
  try {
    var saved = localStorage.getItem("qk-theme");
    var dark = saved === "dark" || (saved === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
