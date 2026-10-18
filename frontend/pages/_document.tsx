/**
 * pages/_document.tsx
 * Custom document for adding manifest link and PWA meta tags
 *
 * SRI audit: no external <script> or <link rel="stylesheet"> tags are present.
 * All resources reference same-origin paths (/manifest.json,
 * /apple-touch-icon.png), which are served by this application and do not
 * require Subresource Integrity attributes. If a CDN-hosted font,
 * stylesheet, or script is ever added here, it must include
 * integrity="sha256-..." and crossOrigin="anonymous".
 *
 * iOS standalone support (#1477): Safari ignores parts of the web manifest,
 * so the installed (Add to Home Screen) experience is driven by the Apple
 * meta tags below plus a dedicated 180x180 touch icon. Keep the
 * `theme-color` value in sync with `theme_color` in
 * frontend/public/manifest.json (#7B3FE4).
 */

import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme color for browser UI — must match manifest.json theme_color */}
        <meta name="theme-color" content="#7B3FE4" />

        {/* Apple Touch Icon: iOS wants its own 180x180 asset; the 192px
            manifest icon is not used for home-screen icons (#1477). */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />

        {/* iOS standalone mode: launch without Safari chrome, with a dark
            status bar that overlays the app content (#1477). */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MicroPay" />

        {/* MS Tile Color */}
        <meta name="msapplication-TileColor" content="#7B3FE4" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
