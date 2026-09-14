/**
 * MainSection Component
 * Compact official landing content - central emblem and portal identity.
 * Centered to match approved design.
 */
class MainSection extends HTMLElement {
  connectedCallback() {
    const emblemUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuC-d1MMZFG2oXxPQAfexWgDUVu6ThiRBzGSHCTGSozGDWZuApvdx9wwmmNYpunT4dCZld9gX9wPZJjEzCdZKCAeRgv4Rf01GeG-UO4e8yqscVsUkRxTDUhARhZwDfzbQ-aOXKX9T3YS2sJpzjfIzNkVm3zc5XyM6uAYkfSALzRrCcnHwHO6IimAY5Zd_mmbQo9vvCOM-u4ibii48wVd8svEwWG_sGhqZy6POeXdpFSF9qkJKrWcZ6wt3A";

    this.innerHTML = `
      <main class="flex-grow w-full max-w-container-max mx-auto py-stack-md flex flex-col items-center justify-center">
        <section class="text-center px-margin-mobile md:px-margin-desktop max-w-3xl">
          <img alt="National Emblem of India" class="h-20 w-auto mx-auto mb-6 opacity-90" src="${emblemUrl}" />
          <h2 class="font-headline-lg text-headline-lg text-primary mb-2 uppercase tracking-wide">Jan Arogya Portal</h2>
          <h3 class="font-title-lg text-title-lg text-on-surface mb-1">Government of India</h3>
          <h4 class="font-body-lg text-body-lg text-on-surface-variant mb-6">Ministry of Health &amp; Family Welfare</h4>
          <div class="h-px w-24 bg-secondary mx-auto mb-6"></div>
          <p class="font-body-md text-body-md text-on-surface max-w-2xl mx-auto leading-relaxed">
            India's unified healthcare coordination platform for citizens, providers, and administrators.
          </p>
        </section>
      </main>
    `;
  }
}

customElements.define('main-section', MainSection);
