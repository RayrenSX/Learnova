# Publishing Learnova

All editions currently use **0.1.12**. The root `package.json` is the build version source. Keep the Pintia package and both lockfile root versions in sync when releasing.

## 0.1.12 fix (2026-10-29)

The v0.1.11 empty-card check compared the DOM window with the userscript sandbox window. In the actual installed Tampermonkey environment this misidentified a visible card as hidden. The fix walks iframe owner elements instead. A virtual-window regression reproduces the old failure and passes with the fix; all 10 empty-content scenarios and the Home interface regression passed. Syntax, update and distribution checks passed.

The fixed v0.1.12 was saved through the actual Tampermonkey editor and tested after reloading the signed-in course. Both the original chapter (1260609409) and chapter 1260611175 advanced from an empty first card to their PDF card, with the helper's navigation log and real active-card change observed. Tests ended paused and temporary settings were restored. GitHub/platform publication verification will be recorded after release.

## 0.1.11 release (2026-10-29)

Adds the default-on empty-card navigation setting and Home shortcut. Empty cards advance through the remaining current-chapter cards before using the native next-section button. The final implementation passed 9 empty-content and 4 interface regression scenarios; a live signed-in course confirmed an empty card advanced to a document card.

- [GitHub release v0.1.11](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.11) was published from `c823508`. The [tagged workflow](https://github.com/RayrenSX/Learnova/actions/runs/40821730328) and [main workflow](https://github.com/RayrenSX/Learnova/actions/runs/40821725976) passed; the tagged browser regression checks passed 41/41. All eight downloaded assets match GitHub's digests, byte counts, version and local builds after LF normalization; syntax checks passed.
- ScriptCat 8739 was synchronized through its existing form. Its public description and installation link show 0.1.11. The complete anonymous installation download passes syntax checks, includes the empty-card setting, and matches the combined release code body after excluding platform metadata and normalizing line endings.
- Greasy Fork Chaoxing 602230 and Pintia 602231 remain pending manual synchronization and public version verification. Connections to greasyfork.org timed out. Their existing automatic code and description sources were preserved; the latest GitHub source assets are ready. No Greasy Fork success is claimed for this release.

## 0.1.10 verification (2026-10-29)

The release adds native HTML book entry, scrolling, section navigation and shared pause behavior, plus matching native reading receipts for course navigation. The final combined script has SHA-256 `587188bca114b7c3340e265bedd6eba8649a3c07e5a6a617ab4028edc7286eea`, identical to the October 28 full isolated regression build (301/301). Release-day reading/page/queue regressions passed 43/43, study tools 16/16 and web-search checks 11/11; syntax, update, distribution, font, external-bank and native-task checks passed. CI now includes the HTML book and reading-receipt regressions. Required book/link completion receipts still lack valid live samples; see the release notes and HTML reading report.

- [GitHub release v0.1.10](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.10) was published from `6b7e274`; the [tagged workflow](https://github.com/RayrenSX/Learnova/actions/runs/40811105214) and [main build](https://github.com/RayrenSX/Learnova/actions/runs/40811105736) passed. All eight release assets were downloaded and checked against GitHub's SHA-256 digests, byte counts and local builds after LF normalization; versions and syntax passed.
- ScriptCat 8739 was synchronized through its existing source-sync form. Its public page and description show 0.1.10. The anonymous installation download returned HTTP 200, passes syntax checks and matches the combined release code body after excluding platform metadata and normalizing line endings.
- Greasy Fork Chaoxing 602230 and Pintia 602231 both returned "Script successfully synced." Public pages and descriptions show 0.1.10. The complete public source from each Code page passes syntax checks and matches its corresponding release code body after excluding platform metadata and normalizing line endings. Direct requests to the separate `update.greasyfork.org` download host timed out in this environment; source verification used the public Code pages instead.
- Existing automatic synchronization and stable code/description URLs were preserved for all three listings. Local account captures and unrelated research files were excluded from the release commit.

## 0.1.9 verification (2026-10-28)

Chapter export, programming-result recognition, all-course task parsing, manual blank lookup and recheck-log fixes passed local checks: study tools 16/16, selected integration scenarios 26/26, and the answer-recheck regression 1/1. All editions build at 0.1.9; syntax, update and distribution checks passed. Full feature acceptance remains incomplete as described in the release notes.

- [GitHub release v0.1.9](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.9) was published from `8907972`; the [tagged workflow](https://github.com/RayrenSX/Learnova/actions/runs/40636910379) and main build both passed. GitHub's SHA-256 digests and byte counts for all eight assets match the local builds after LF normalization.
- ScriptCat 8739 was synchronized through its existing source-sync form. Its public page and description show 0.1.9. The public installation file returns HTTP 200, passes syntax checks and matches the combined release code body after excluding platform metadata and normalizing line endings.
- Greasy Fork Chaoxing 602230 and Pintia 602231 were synchronized through their existing source-sync forms after network access was restored. Both returned "Script successfully synced." Their public pages and descriptions show 0.1.9. Both public installation files were downloaded, pass syntax checks and match the corresponding GitHub release code bodies after excluding platform metadata and normalizing line endings. Existing automatic synchronization and source/description URLs remain configured.

## 0.1.8 verification (2026-10-27)

- [GitHub release v0.1.8](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.8) was published from `ebf1344`; the [tagged build](https://github.com/RayrenSX/Learnova/actions/runs/40440465804) passed. All eight release assets report 0.1.8, pass syntax checks, and match the local builds after line-ending normalization.
- The release includes chapter quiz iframe classification and Pintia's collapsible lower panel. Local Pintia regression checks passed 71/71, study tools 12/12, and focused chapter/homework checks 2/2. Update and distribution checks passed. The tagged CI also ran the new chapter iframe regression with the existing page/audit checks.
- ScriptCat 8739 and Greasy Fork Chaoxing 602230 / Pintia 602231 were manually synchronized through their existing source-sync forms. Greasy Fork reported successful synchronization for both listings. All three public installation files were downloaded: version 0.1.8 and valid syntax confirmed, with code bodies matching their GitHub release assets after excluding platform metadata.
- Automatic synchronization and the existing stable source/description URLs remain configured. The current course window was tested before publication: 4/4 questions filled via N1 and AI; no quiz was submitted.

## 0.1.7 verification (2026-10-26)

GitHub release v0.1.7 and its tagged build succeeded. ScriptCat 8739, Greasy Fork Chaoxing 602230 and Pintia 602231 were synchronized; all three public installation files report 0.1.7. The combined and Chaoxing downloads include conditional vote-model fields and unified catalog completion detection. Targeted voting/catalog regressions, syntax, update and distribution checks passed. On the supplied live course catalog, the revised detector recognized all 48 chapters as completed, consistent with the platform's 96/96 task points.

## Icon resolution (0.1.6)

Both icon metadata fields now use the 1024×1024 PNG. ScriptCat's detail page requests `/icon/thumb/64` without a high-DPI `srcset`, even at a device pixel ratio of 1.5. Increasing source resolution improves the stored original, but the platform's fixed 64×64 display pipeline can still blur the header icon on scaled screens.

## 0.1.5 branding update (2026-10-26)

The new book/play icon is embedded in both workbench headers and referenced by `@icon` in all script editions. The repository social preview uses the 1280×640 cover; GitHub confirms `usesCustomOpenGraphImage: true`. README and both Greasy Fork descriptions use the same cover. README uses an absolute image URL for ScriptCat description synchronization.

GitHub release v0.1.5 built successfully. ScriptCat 8739 and both Greasy Fork listings were synchronized to 0.1.5; their code includes the new icon metadata. Branding UI checks 7/7, Pintia checks 69/69, syntax, native update and distribution checks passed.

## 0.1.4 publication status (2026-10-26)

- [GitHub release](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.4) published from `777d56d`. The [tagged build](https://github.com/RayrenSX/Learnova/actions/runs/40276633021) passed and uploaded all eight script / metadata assets.
- Downloaded release assets have version 0.1.4 and valid syntax. The downloaded combined script passed all nine page / queue regression scenarios.
- Existing platform sync URLs continue to point to `releases/latest/download/`; no sync-source URL change is required.
- ScriptCat 8739 was manually synchronized through its existing source-sync form. Its public installation file now reports `@version 0.1.4`.
- Greasy Fork Chaoxing 602230 and Pintia 602231 both returned “Script successfully synced.” Their public installation files now report `@version 0.1.4`; the synchronized descriptions also use 0.1.4.
- The initial connection failures were resolved using the already-running DualNet explicit proxy entry. System proxy settings and saved automatic sync source URLs were not changed.

## Release process

1. Increase the version and update `RELEASE_NOTES.md`, the README version labels, and platform descriptions under `docs/`.
2. Run:

   ```sh
   npm ci
   npm ci --prefix pintia
   npm run build
   npm run build --prefix pintia
   npm run build:greasyfork
   npm run check
   npm run check --prefix pintia
   npm run test:update
   npm run test:distribution
   ```

3. Commit and push `main`, then push the matching tag, for example `v0.1.4`.
4. GitHub Actions builds all editions, verifies syntax, update behavior and distribution limits, and publishes the release assets. A tag that differs from the package version is rejected. Main branch pushes build without publishing.
5. Confirm that the latest release downloads contain the intended version. Check each script site's source synchronization status and publicly accessible installation link.

The initial [v0.1.2 release](https://github.com/RayrenSX/Learnova/releases/tag/v0.1.2) and its automated build passed. Its GitHub installation and metadata URLs were verified through anonymous downloads. The Greasy Fork editions were added during initial platform publication and are built by subsequent tagged releases too.

## GitHub assets

Base URL: `https://github.com/RayrenSX/Learnova/releases/latest/download/`.

| Edition | Installed script | Metadata |
| --- | --- | --- |
| Combined | `study-helper.user.js` | `study-helper.meta.js` |
| Pintia standalone | `pintia-helper.user.js` | `pintia-helper.meta.js` |
| Greasy Fork Chaoxing source | `learnova-chaoxing.user.js` | `learnova-chaoxing.meta.js` |
| Greasy Fork Pintia source | `learnova-pintia.user.js` | `learnova-pintia.meta.js` |

Local Greasy Fork files are under `dist/greasyfork/`; release asset names are flat. The initial name and version reset requires manual installation for older 3.x / 1.x users, followed by disabling the old scripts.

## Greasy Fork

| Edition | Listing | Source for automatic syncing | Additional info source |
| --- | --- | --- | --- |
| Chaoxing | [602230](https://greasyfork.org/zh-CN/scripts/602230-learnova-for-chaoxing) | `https://github.com/RayrenSX/Learnova/releases/latest/download/learnova-chaoxing.user.js` | `https://raw.githubusercontent.com/RayrenSX/Learnova/main/docs/greasyfork-chaoxing.md` |
| Pintia | [602231](https://greasyfork.org/zh-CN/scripts/602231-learnova-for-pintia) | `https://github.com/RayrenSX/Learnova/releases/latest/download/learnova-pintia.user.js` | `https://raw.githubusercontent.com/RayrenSX/Learnova/main/docs/greasyfork-pintia.md` |

Both listings were created at version 0.1.2. Automatic source synchronization and Markdown additional-info synchronization are configured on both listings. Their initial syncs returned “Script successfully synced.” The Pintia settings were reloaded and confirmed to retain Automatic and the configured source/description URLs.

For later edits, use each listing's Admin → Source Syncing settings. A tagged GitHub release updates the stable asset URLs that Greasy Fork checks; its description documents follow main.

Greasy Fork requires readable, non-minified code below 2 MB. The build separates the two sites, retains source and license comments, removes GitHub update/download metadata, and uses Greasy Fork's native installed update URLs. In-script update checks, including manual checks, are throttled to one per 24 hours. When native metadata is unavailable, the version button asks the user to check through the manager.

Keep these editions on the Greasy Fork update channel. Platform descriptions must describe the uploaded edition and should not tell users to install an alternate hosted copy instead.

## ScriptCat

Combined listing: [8739](https://scriptcat.org/zh-CN/script-show-page/8739).

The existing listing is publicly accessible as of 2026-10-26. Version 0.1.3 was synchronized successfully and its public installation URL returns HTTP 200 with `@version 0.1.3`.

Confirmed source synchronization:

- Script: `https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js`
- Description: `https://raw.githubusercontent.com/RayrenSX/Learnova/main/README.md`
- Mode: Automatic.

The earlier review-pending 404 is resolved. The source and description URLs and Automatic selection were saved, synchronized once, and reloaded to confirm persistence. Both Greasy Fork listings were also synchronized to 0.1.3; their public installation files and description versions were verified.
