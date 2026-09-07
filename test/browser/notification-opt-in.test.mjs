import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

// Regression fixtures from the broad Hitcents form rules and Spartan's scoped
// controls. No production pages, credentials, or network requests are needed.
const hostStyles = {
  hitcents: `
    input, textarea { width: 100%; border: 1px solid #ddd; border-radius: 9px;
      padding: .7rem .8rem; background: #fff; color: #202020; }
    label { display: grid; gap: .35rem; font-size: .85rem; font-weight: 700; }
  `,
  spartan: `
    .report-dialog input:not([type="checkbox"]), .report-dialog textarea {
      width: 100%; padding: 10px 11px; border: 1px solid #d9d3cc; }
    .report-dialog label { display: grid; gap: 7px; font-weight: 600; }
  `,
  important: `
    input[type="checkbox"] { appearance: none !important; width: 100% !important;
      min-width: 240px !important; height: 48px !important; padding: 20px !important;
      margin: 24px !important; flex: 1 !important; position: absolute !important; }
    label { display: grid !important; grid-template-columns: 1fr 1fr !important;
      gap: 80px !important; font-weight: 900 !important; text-align: right !important; }
    label span, label strong { font-size: 24px !important; font-weight: 900 !important;
      white-space: nowrap !important; text-transform: uppercase !important; }
    label::before, input[type="checkbox"]::after { content: "Host checkbox" !important; }
    input:focus-visible { outline: 0 !important; box-shadow: none !important; }
  `,
};

test("notification consent withstands host CSS without changing host controls", async (t) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./notification-opt-in.fixture.jsx", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  try {
    for (const [host, css] of Object.entries(hostStyles)) {
      for (const width of [1280, 390]) {
        for (const themeMode of ["light", "dark"]) {
          await t.test(`${host}, ${width}px, ${themeMode}`, async () => {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            try {
              const errors = [];
              page.on("pageerror", (error) => errors.push(error.message));
              await page.route("**/*", (route) => route.abort());
              await page.setContent(`<style>${css}</style>
                <label id="host-control">Host field<input type="checkbox"></label>
                <div id="root"></div>`);
              const hostMetrics = () => page.locator("#host-control").evaluate((label) => {
                const input = label.querySelector("input");
                return {
                  width: input.getBoundingClientRect().width,
                  weight: getComputedStyle(label).fontWeight,
                  display: getComputedStyle(label).display,
                };
              });
              const before = await hostMetrics();
              await page.addScriptTag({ content: bundle.outputFiles[0].text });
              await page.evaluate(({ themeMode }) => window.mountReporter({
                themeMode,
                recipientHint: `j***@${"long-domain".repeat(12)}.example.invalid`,
              }), { themeMode });
              const checkbox = page.getByRole("checkbox", { name: "Email me when this bug is fixed" });
              await checkbox.waitFor({ state: "visible" });
              // Also check styles loaded after the SDK, as in lazy-loaded routes.
              await page.addStyleTag({ content: css });

              const layout = await checkbox.evaluate((input) => {
                const label = input.closest("label");
                const copy = label.querySelector("span");
                const hint = copy.querySelector("span");
                const box = input.getBoundingClientRect();
                const row = label.getBoundingClientRect();
                const text = copy.getBoundingClientRect();
                return {
                  width: box.width,
                  height: box.height,
                  gap: text.left - box.right,
                  rowRight: row.right,
                  textRight: text.right,
                  helperWeight: getComputedStyle(hint).fontWeight,
                  helperSize: getComputedStyle(hint).fontSize,
                  helperColor: getComputedStyle(hint).color,
                  titleWeight: getComputedStyle(copy.querySelector("strong")).fontWeight,
                  fontFamily: getComputedStyle(hint).fontFamily,
                  accent: getComputedStyle(input).accentColor,
                  appearance: getComputedStyle(input).appearance,
                  hasOverflow: label.scrollWidth > label.clientWidth + 1,
                  hostPseudo: getComputedStyle(label, "::before").content,
                };
              });
              assert.equal(layout.width, 14, "checkbox must keep its compact width");
              assert.equal(layout.height, 14);
              assert.equal(layout.gap, 9, "copy must stay beside the checkbox");
              assert.ok(layout.textRight <= layout.rowRight + 1);
              assert.equal(layout.hasOverflow, false, "long recipient hints must wrap");
              assert.equal(layout.helperWeight, "400");
              assert.equal(layout.helperSize, "11px");
              assert.equal(layout.titleWeight, "700");
              assert.equal(layout.helperColor, themeMode === "dark" ? "rgb(187, 187, 187)" : "rgb(102, 102, 102)");
              assert.equal(layout.fontFamily, "Arial, sans-serif");
              assert.equal(layout.accent, "rgb(200, 62, 8)");
              assert.equal(layout.appearance, "auto");
              assert.equal(layout.hostPseudo, "none");
              assert.deepEqual(await hostMetrics(), before, "SDK reset must stay within its opt-in");

              assert.equal(await checkbox.isChecked(), false);
              await checkbox.focus();
              await page.keyboard.press("Space");
              assert.equal(await checkbox.isChecked(), true);
              const focus = await checkbox.evaluate((input) => ({
                visible: input.matches(":focus-visible"),
                outline: getComputedStyle(input).outlineWidth,
                color: getComputedStyle(input).outlineColor,
              }));
              assert.deepEqual(focus, { visible: true, outline: "2px", color: "rgb(200, 62, 8)" });
              await page.getByText("Email me when this bug is fixed", { exact: true }).click();
              assert.equal(await checkbox.isChecked(), false, "label clicks must update React consent state");
              assert.deepEqual(errors, []);
            } finally {
              await page.close();
            }
          });
        }
      }
    }
  } finally {
    await browser.close();
  }
});
