/**
 * AnnouncementTicker Component
 * Scrolling ticker for latest government health updates.
 * Purely presentational - no API calls.
 */
class AnnouncementTicker extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="bg-primary text-on-primary py-2 px-margin-mobile md:px-margin-desktop text-sm font-label-md flex items-center gap-4 border-b border-primary-container">
        <span class="bg-secondary text-secondary-fixed-dim px-2 py-1 rounded font-bold uppercase text-xs shrink-0 tracking-wider">Latest Updates</span>
        <div class="ticker-wrap flex-grow relative overflow-hidden">
          <div class="ticker">
            <span class="mr-8 inline-block">• PM-JAY registration deadline extended to 31st October.</span>
            <span class="mr-8 inline-block">• New digital health IDs can now be generated via Aadhar linkage.</span>
            <span class="mr-8 inline-block">• 500 new hospitals empanelled under the Jan Arogya scheme this month.</span>
            <span class="mr-8 inline-block">• Scheduled maintenance on the portal this Sunday from 2 AM to 4 AM IST.</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('announcement-ticker', AnnouncementTicker);
