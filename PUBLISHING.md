# Publishing Learnova

All editions currently use **0.1.4**. The root `package.json` is the build version source. Keep the Pintia package and both lockfile root versions in sync when releasing.

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
