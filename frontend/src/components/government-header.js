/**
 * GovernmentHeader Component
 * Official Government of India header bar with emblem.
 * Reusable across portal pages.
 */
class GovernmentHeader extends HTMLElement {
  connectedCallback() {
    // Emblem URL from approved design
    const emblemUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuC-d1MMZFG2oXxPQAfexWgDUVu6ThiRBzGSHCTGSozGDWZuApvdx9wwmmNYpunT4dCZld9gX9wPZJjEzCdZKCAeRgv4Rf01GeG-UO4e8yqscVsUkRxTDUhARhZwDfzbQ-aOXKX9T3YS2sJpzjfIzNkVm3zc5XyM6uAYkfSALzRrCcnHwHO6IimAY5Zd_mmbQo9vvCOM-u4ibii48wVd8svEwWG_sGhqZy6POeXdpFSF9qkJKrWcZ6wt3A";

    this.innerHTML = `
      <div class="bg-surface-container-lowest border-b border-outline-variant py-2 px-margin-mobile md:px-margin-desktop">
        <div class="max-w-container-max mx-auto flex items-center justify-between">
          <div class="flex items-center gap-4">
            <img
              alt="National Emblem of India"
              class="h-10 w-auto"
              src="${emblemUrl}"
            />
            <div>
              <h1 class="font-label-md text-label-md text-on-surface uppercase tracking-wide">Government of India</h1>
              <p class="font-caption text-caption text-on-surface-variant">Ministry of Health &amp; Family Welfare</p>
            </div>
          </div>
          <div class="hidden md:flex gap-2">
            <span class="font-caption text-caption text-on-surface-variant cursor-pointer" role="button" tabindex="0" aria-label="Decrease font size">A-</span>
            <span class="font-caption text-caption text-on-surface-variant cursor-pointer" role="button" tabindex="0" aria-label="Default font size">A</span>
            <span class="font-caption text-caption text-on-surface-variant cursor-pointer" role="button" tabindex="0" aria-label="Increase font size">A+</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('government-header', GovernmentHeader);
