Learnova 0.1.3

- Fix stale image answers: changing an image URL, srcset, or picture source invalidates the question even when its alt text stays the same.
- Invalidate answer caches when any external question-bank configuration changes, including request templates, handlers, parsing rules and authentication headers. Older cache scopes are no longer reused.
- Reject AI responses with a different or invalid final origin, and stop that answer without random fallback. Same-origin redirects and managers without finalUrl remain compatible.
- Clarify the default random fallback, low-confidence comparison and answer-overwrite behavior after automatic answering is enabled.
- Add six regression scenarios for the fixes and rebuild combined, standalone and Greasy Fork editions.

The origin check validates the received response; it does not guarantee that a userscript manager prevented a redirected network request. Tests use isolated simulated pages and APIs.

Learnova 0.1.2

- Unified release version and English project name.
- Version button in both Chaoxing and Pintia headers; click to check for updates.
- Checks GitHub for new versions, shows an install banner, and sends one desktop notification per new version.
- Stable GitHub .user.js and .meta.js release assets for userscript manager updates.
- Readable Greasy Fork editions for Chaoxing and Pintia, each under 2 MB, with native update URLs and at most one in-script update check per day.

Install study-helper.user.js for the combined edition, or pintia-helper.user.js for Pintia only. Install one edition for Pintia.

Greasy Fork listings:
- Chaoxing: https://greasyfork.org/zh-CN/scripts/602230-learnova-for-chaoxing
- Pintia: https://greasyfork.org/zh-CN/scripts/602231-learnova-for-pintia

The ScriptCat combined-edition listing is awaiting platform review: https://scriptcat.org/zh-CN/script-show-page/8739

This release resets older 3.x / 1.x versions to 0.1.2 and changes the script name. Install it manually once and disable the old script. Future releases use increasing versions and the configured update URLs.
