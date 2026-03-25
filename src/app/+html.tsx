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
        <style
          id="expo-reset"
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                margin: 0;
                width: 100%;
                min-height: 100%;
                background-color: #0A1325;
              }

              body {
                overflow: hidden;
              }

              #root {
                display: flex;
                width: 100%;
                min-height: 100%;
              }

              @supports (height: 100dvh) {
                html, body, #root {
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
