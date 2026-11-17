// The company, the legal links, the footer and the page shell, shared by the build and the functions. Imports no other
// module: render.mjs imports this file, and a cycle would leave PAGE_CSP uninitialised. FORM_CSP is its own literal,
// and links/legal.test.mjs pins it to PAGE_CSP.
export const COMPANY = {
  name: "Resbite Ltd",
  number: "12450334",
  registeredIn: "England and Wales",
  office: "86-90 Paul Street, London EC2A 4NE, United Kingdom",
  support: "support@resbite.com",
  privacy: "privacy@resbite.com",
};

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/support", label: "Support" },
  { href: "/delete-account", label: "Delete your account" },
];

// PAGE_CSP with the form allowed to post to its own origin, for the pages that carry the contact form only.
export const FORM_CSP =
  "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; connect-src 'none'; frame-ancestors 'none'";

export function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function siteFooter() {
  const links = LEGAL_LINKS.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join("\n      ");
  return `
  <footer class="site-footer">
    <nav aria-label="Legal">
      ${links}
    </nav>
    <p>${escapeHtml(COMPANY.name)} is a private limited company registered in ${escapeHtml(COMPANY.registeredIn)}, company number ${escapeHtml(COMPANY.number)}. Registered office: ${escapeHtml(COMPANY.office)}.</p>
    <p>Email <a href="mailto:${COMPANY.support}">${COMPANY.support}</a> for help, or <a href="mailto:${COMPANY.privacy}">${COMPANY.privacy}</a> about your data.</p>
  </footer>`;
}

export function sitePage({ title, body, csp, robots = true, banner = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />${robots ? "" : '\n  <meta name="robots" content="noindex, nofollow" />'}
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>${escapeHtml(title)} – Resbite</title>
  <link rel="icon" href="/resbite-mark.png" />
  <link rel="stylesheet" href="/site.css" />
  <link rel="stylesheet" href="/legal.css" />
</head>
<body>
  <header class="site-header"><img src="/resbite-mark.png" alt="" width="32" height="32" /><span>Resbite</span></header>
  ${banner}
  <main id="main" class="legal">${body}</main>${siteFooter()}
</body>
</html>
`;
}
