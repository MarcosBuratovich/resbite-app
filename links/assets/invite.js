"use strict";
(() => {
  const hash = location.hash;
  const hasQuery = Boolean(location.search);
  // Remove the secret from visible history without persisting it anywhere.
  history.replaceState(null, "", "/invite");
  const valid = !hasQuery && /^#token=[a-f0-9]{64}$/.test(hash);
  if (!valid) {
    document.getElementById("status").textContent =
      "This invitation link is incomplete. Return to the original invitation message or ask your organizer for a new link.";
    return;
  }
  const open = document.getElementById("open");
  open.href = "resbite://invite?token=" + hash.slice(7);
  open.hidden = false;
})();
