import type { PropsWithChildren } from "react";

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var root = document.documentElement;

                function updateAppHeight() {
                  var viewportHeight = window.visualViewport
                    ? window.visualViewport.height
                    : window.innerHeight;

                  root.style.setProperty("--app-height", viewportHeight + "px");
                }

                updateAppHeight();
                window.addEventListener("resize", updateAppHeight);
                window.addEventListener("orientationchange", updateAppHeight);

                if (window.visualViewport) {
                  window.visualViewport.addEventListener("resize", updateAppHeight);
                  window.visualViewport.addEventListener("scroll", updateAppHeight);
                }
              })();
            `,
          }}
        />
        <style
          id="expo-reset"
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                margin: 0;
                width: 100%;
                height: var(--app-height, 100vh);
                min-height: var(--app-height, 100vh);
                background-color: #0A1325;
                overscroll-behavior: none;
                overflow-x: hidden;
              }

              body {
                overflow-y: auto;
              }

              #root {
                display: flex;
                width: 100%;
                height: var(--app-height, 100vh);
                min-height: var(--app-height, 100vh);
                overflow-x: hidden;
              }

              @supports (height: 100dvh) {
                html, body, #root {
                  height: 100dvh;
                  min-height: 100dvh;
                }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
