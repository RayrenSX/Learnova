Learnova 0.1.9

- Export chapter quiz selections from ARIA and hidden answer fields; preserve question identities and visible question counts, and remove duplicate option labels.
- Recognize native Accepted programming-test feedback and exclude runtime output from answer editors and question identity.
- Read current all-course homework rows and activity types; show approximate deadlines derived from the platform's remaining-time display.
- Respect the requested blank count in manual question-bank lookup, deduplicate answer-recheck logs, and correct the default answer-overwrite hint.
- Rebuild all GitHub, ScriptCat and Greasy Fork editions at version 0.1.9.

These fixes follow the October 27-28 live checks. Full feature acceptance remains incomplete: HTML topic reading, courseware downloads, newer exam-list requests and some background/search reliability scenarios still need work. Third-party answer accuracy is not guaranteed.

Learnova 0.1.8

- Fix chapter quizzes that reuse the homework URL being blocked by the independent-homework switch. Chapter task frames now retain chapter answering and submission settings.
- Verified the fix in the current course window: four questions were recognized and filled using three N1 results and one AI result, with random fallback and automatic submission disabled. No quiz was submitted.
- Allow Pintia's horizontal separator to reach the bottom of the workbench, collapsing lower content and action buttons while keeping the tab bar accessible.
- Restore the previous editor height through the collapse button or a tab click. Preserve collapsed state across startup and window resizing, with mouse and keyboard support in docked and floating modes.
- Rebuild all GitHub, ScriptCat and Greasy Fork editions at the same version. Pintia isolated regression checks: 71/71 passed.

Learnova 0.1.7

- Fix course catalog completion detection for the platform's newer `icon_yiwanc` green-check marker and zero remaining-task counters.
- Show vote-model configuration only while strict multi-model voting is enabled; preserve saved model names when hidden.

Learnova 0.1.6

- Use the 1024×1024 icon source for both `@icon` and `@icon64`. Script-site thumbnails may still be limited by the hosting platform's fixed image size.

Learnova 0.1.5

- Add the blue book / play icon to Chaoxing and Pintia headers and userscript metadata.
- Add reusable SVG and PNG icon assets and a 1280 × 640 project cover.
- Refresh README and platform descriptions with the new artwork, current installation links, page-specific navigation and the unified question-bank setup. Remove outdated review-pending and unpublished-feature notices.

Learnova 0.1.4

- Personal space shows Course Queue, Home and Settings, without playback controls, chapter catalog, chat or records. Course pages keep the catalog and place the queue and homework tools under Home.
- Read courses only from personal space; prefer loaded course cards, deduplicate cover/title links, preserve existing choices and completion records, and leave newly discovered courses unselected.
- Rework queue progress, search, status filters, compact rows, selection and reorder controls. Resume the current course, preserve multi-tab ownership, and recover from failed course navigation. Completion requires consistent platform task markers.
- Answer-related toggles default off; playback defaults stay on. Existing saved choices are preserved.
- Consolidate built-in services, OCS configurations, local banks and cache into Question Bank Management. OCS is the default online provider; standard handlers, field transforms, question type mapping and deduplication are supported.
- Include course study/export tools and the separate platform workbenches already implemented in the local working version. Rebuild all distribution assets at the same version.

Validation includes isolated regression tests and checks on signed-in personal-space, course and playback pages. No homework or exam was submitted during live checks.

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
