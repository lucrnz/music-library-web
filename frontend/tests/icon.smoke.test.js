import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "vue";
import Icon from "../js/components/icons/Icon.js";

describe("Icon", () => {
  let app;

  beforeEach(() => {
    document.body.innerHTML = `
      <svg style="display:none" aria-hidden="true">
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></symbol>
      </svg>
      <div id="host"></div>
    `;
  });

  afterEach(() => {
    app.unmount();
  });

  it("sets use href to #i-play", () => {
    app = createApp(Icon, { name: "play" });
    app.mount("#host");
    expect(document.querySelector("#host use").getAttribute("href")).toBe("#i-play");
  });
});
