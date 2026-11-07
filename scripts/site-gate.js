/**
 * Shared-password front door for the static site.
 * The password itself is not stored; only its SHA-256 hash is compared.
 */
const PASSWORD_SHA256 =
  "fad0bdd2cbec24c8a9e0c590393ee930b28aa029dffca9b6187932f833385c07";
const ACCESS_KEY = "sdv-site-access";

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

function openSite() {
  document.documentElement.classList.add("site-unlocked");
  try {
    sessionStorage.setItem(ACCESS_KEY, "ok");
  } catch (err) {
    /* private mode can block storage; the page still opens for this load */
  }
  if (!document.querySelector("script[data-site-app]")) {
    const app = document.createElement("script");
    app.type = "module";
    app.src = "./app.js?v=20261106-gate";
    app.dataset.siteApp = "1";
    document.body.appendChild(app);
  }
}

const form = document.getElementById("siteGateForm");
const input = document.getElementById("siteGatePassword");
const error = document.getElementById("siteGateError");

if (document.documentElement.classList.contains("site-unlocked")) {
  openSite();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entered = input?.value || "";
  const digest = await sha256(entered);
  if (digest !== PASSWORD_SHA256) {
    if (error) error.hidden = false;
    input?.select();
    return;
  }
  if (error) error.hidden = true;
  openSite();
});
