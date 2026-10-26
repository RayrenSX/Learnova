# Learnova publishing

The root package.json is the build version source. Keep pintia/package.json and both lockfile root versions in sync when releasing.

1. Increase the version (for example, 0.1.2 → 0.1.3) and update RELEASE_NOTES.md.
2. Run `npm ci`, `npm ci --prefix pintia`, `npm run build`, `npm run build --prefix pintia`, `npm run check`, `npm run check --prefix pintia`, and `npm run test:update`.
3. Commit the changes, push main, then push the matching tag (for example `git tag v0.1.3` and `git push origin v0.1.3`).
4. GitHub Actions builds both editions, checks metadata and update behavior, and publishes four release assets. A tag that differs from package.json is rejected. A main branch push builds and checks without publishing.

Stable installation and metadata URLs:

- https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.user.js
- https://github.com/RayrenSX/Learnova/releases/latest/download/study-helper.meta.js
- https://github.com/RayrenSX/Learnova/releases/latest/download/pintia-helper.user.js
- https://github.com/RayrenSX/Learnova/releases/latest/download/pintia-helper.meta.js

## Greasy Fork and ScriptCat

ScriptCat combined-edition listing (0.1.2): https://scriptcat.org/zh-CN/script-show-page/8739

ScriptCat install URL: https://scriptcat.org/scripts/code/8739/Learnova.user.js

The initial ScriptCat version has been uploaded. Automatic site synchronization has not yet been configured; the script metadata points installed clients to the GitHub release assets. Greasy Fork publication is pending the account security setup required by its new-author page (verified email plus 2FA, or external-login-only setup).

Publish the combined `dist/study-helper.user.js` as Learnova. The optional Pintia-only edition is `dist/pintia-helper.user.js`, named Learnova for Pintia. The license is MIT; source and issue links are https://github.com/RayrenSX/Learnova.

For the first publication, sign in to each site and create the listing. Use the description below. If the editor offers URL import and automatic synchronization, set the combined .user.js URL above as its source. Use the Pintia URL for the independent edition. Confirm site validation and synchronization results before treating the listing as live. Record the resulting listing URLs here after publication. A GitHub release does not create or synchronize a listing by itself.

Listing description:

Learnova brings a course workspace to Chaoxing and a code workspace to Pintia. It includes course navigation, playback and reading tools, question-bank and configurable AI assistance, and code editing, testing, diagnosis and filling for Pintia. API keys and question-bank settings are configured by the user. The header shows the installed version and offers update checks with a visible install link when a newer release is available. Install the combined edition or the Pintia-only edition, and disable older editions to avoid duplicate panels. Source is available under the MIT license.

The initial 0.1.2 release requires manual installation for users migrating from older 3.x / 1.x versions because the project name and version scheme changed.
