// The event page's only script: after "I have Resbite: open the app", show a hint if the app didn't take over.
(function () {
  var open = document.getElementById("open-app");
  var hint = document.getElementById("open-hint");
  if (!open || !hint) return;
  open.addEventListener("click", function () {
    setTimeout(function () {
      if (!document.hidden) hint.hidden = false;
    }, 1500);
  });
})();
