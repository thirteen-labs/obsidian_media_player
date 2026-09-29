/**
 * Shared error for native modules that have no web implementation.
 *
 * Every web stub reports the same message so the failure reads the same
 * wherever a consumer hits it, and so the wording can be fixed in one place.
 */

/** Names of the capabilities that simply do not exist on web. */
export const WEB_UNAVAILABLE =
  '[obsidian-media-player] This is not available on web.';

export function notOnWeb(capability: string): Error {
  return new Error(
    `${WEB_UNAVAILABLE} \`${capability}\` requires the iOS or Android build — ` +
      'it has no browser equivalent. The web build is a pure HTML5 media ' +
      'fallback, so it supports playback, queueing and progress, but not ' +
      'background audio, lock-screen controls or the offline cache.'
  );
}
