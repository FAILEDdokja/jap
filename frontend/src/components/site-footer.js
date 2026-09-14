/**
 * SiteFooter Component
 * Government footer with policy links and ABDM reference.
 * Reusable across all portal pages.
 */
class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer class="bg-primary dark:bg-surface-container-lowest full-width border-t border-outline dark:border-outline-variant">
        <div class="w-full py-8 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-stack-md">
          <div class="text-center md:text-left">
            <div class="font-title-lg text-title-lg text-on-primary dark:text-primary mb-2">
              Government of India
            </div>
            <div class="font-body-md text-body-md text-primary-fixed-dim">
              © 2024 Ministry of Health &amp; Family Welfare
            </div>
          </div>
          <nav class="flex flex-wrap justify-center gap-x-6 gap-y-3">
            <a class="text-on-primary dark:text-primary opacity-90 hover:opacity-100 transition-opacity hover:text-secondary-fixed dark:hover:text-secondary focus:outline-none focus:underline font-body-md text-body-md" href="#">
              Privacy Policy
            </a>
            <a class="text-on-primary dark:text-primary opacity-90 hover:opacity-100 transition-opacity hover:text-secondary-fixed dark:hover:text-secondary focus:outline-none focus:underline font-body-md text-body-md" href="#">
              Accessibility
            </a>
            <a class="text-on-primary dark:text-primary opacity-90 hover:opacity-100 transition-opacity hover:text-secondary-fixed dark:hover:text-secondary focus:outline-none focus:underline font-body-md text-body-md" href="#">
              Contact
            </a>
            <a class="text-on-primary dark:text-primary opacity-90 hover:opacity-100 transition-opacity hover:text-secondary-fixed dark:hover:text-secondary focus:outline-none focus:underline font-body-md text-body-md" href="#">
              Help
            </a>
            <span class="text-on-primary/50 hidden md:inline">|</span>
            <span class="text-primary-fixed-dim font-medium mr-2 hidden md:inline">Related Services:</span>
            <a class="text-on-primary dark:text-primary opacity-90 hover:opacity-100 transition-opacity hover:text-secondary-fixed dark:hover:text-secondary focus:outline-none focus:underline font-body-md text-body-md" href="#">
              ABDM
            </a>
          </nav>
        </div>
      </footer>
    `;
  }
}

customElements.define('site-footer', SiteFooter);
