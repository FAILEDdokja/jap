/* Tailwind configuration for Jan Arogya Portal
   Matches the approved landing page design.
   Loaded after tailwind CDN.
*/
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "secondary-fixed-dim": "#f0c12c",
        "tertiary-container": "#004c10",
        "background": "#f8f9ff",
        "primary-fixed-dim": "#aec6ff",
        "on-error": "#ffffff",
        "on-surface": "#0b1c30",
        "on-primary-container": "#8eacf2",
        "outline": "#747781",
        "tertiary-fixed": "#a3f69c",
        "inverse-surface": "#213145",
        "on-tertiary-fixed-variant": "#005312",
        "on-secondary-fixed-variant": "#584400",
        "surface-container-high": "#dce9ff",
        "on-tertiary": "#ffffff",
        "on-secondary": "#ffffff",
        "tertiary-fixed-dim": "#88d982",
        "on-primary-fixed-variant": "#224583",
        "on-tertiary-fixed": "#002204",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff4ff",
        "surface-tint": "#3d5d9d",
        "error-container": "#ffdad6",
        "on-background": "#0b1c30",
        "on-secondary-container": "#6f5600",
        "inverse-on-surface": "#eaf1ff",
        "surface-bright": "#f8f9ff",
        "surface": "#f8f9ff",
        "on-tertiary-container": "#6ebf6b",
        "secondary-fixed": "#ffdf90",
        "on-secondary-fixed": "#241a00",
        "primary": "#002861",
        "on-surface-variant": "#434750",
        "on-primary-fixed": "#001a43",
        "surface-container-highest": "#d3e4fe",
        "primary-container": "#1b3f7d",
        "surface-container": "#e5eeff",
        "on-error-container": "#93000a",
        "error": "#ba1a1a",
        "secondary-container": "#fccc38",
        "primary-fixed": "#d8e2ff",
        "surface-dim": "#cbdbf5",
        "outline-variant": "#c4c6d2",
        "inverse-primary": "#aec6ff",
        "on-primary": "#ffffff",
        "tertiary": "#003307",
        "secondary": "#755b00",
        "surface-variant": "#d3e4fe"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "stack-md": "24px",
        "stack-sm": "12px",
        "margin-desktop": "32px",
        "stack-lg": "48px",
        "margin-mobile": "16px",
        "gutter": "24px",
        "base": "8px",
        "container-max": "1200px"
      },
      "fontFamily": {
        "headline-lg-mobile": ["Noto Sans"],
        "display-lg": ["Noto Sans"],
        "headline-lg": ["Noto Sans"],
        "body-lg": ["Noto Sans"],
        "headline-md": ["Noto Sans"],
        "caption": ["Noto Sans"],
        "title-lg": ["Noto Sans"],
        "label-md": ["Noto Sans"],
        "body-md": ["Noto Sans"]
      },
      "fontSize": {
        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "700" }],
        "display-lg": ["40px", { "lineHeight": "48px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "caption": ["12px", { "lineHeight": "16px", "fontWeight": "400" }],
        "title-lg": ["20px", { "lineHeight": "28px", "fontWeight": "600" }],
        "label-md": ["14px", { "lineHeight": "20px", "letterSpacing": "0.01em", "fontWeight": "500" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }]
      }
    },
  },
}
