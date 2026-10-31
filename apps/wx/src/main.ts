/**
 * WeChat mini game entry. Same game rules, same renderer, different host.
 *
 * The mini game runtime has no DOM, so everything here goes through the wx
 * adapter: canvas, touch, storage. Feedback on WeChat must go through a
 * whitelisted request domain (or a cloud function), configured at publish time.
 */
import { createWxPlatform } from "@factory/platform";
import { mount } from "@factory/games/arcade-dodge";

const platform = createWxPlatform({
  feedbackEndpoint: "https://feedback.example.com/api/feedback",
  appVersion: "0.1.1",
});

mount(platform, {
  onFeedbackRequested: () => {
    // A canvas-drawn sheet lands in the next iteration; WeChat has no <dialog>.
    // Until then the button is a no-op rather than a crash.
    console.log("[wx] feedback requested");
  },
});
