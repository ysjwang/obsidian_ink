import * as semVer from 'semver';
import { createInkNoticeTemplate, createNoticeCtaBar, launchPersistentInkNotice } from 'src/components/dom-components/notice-components';
import InkPlugin from "src/main";
import CHANGELOG from './changelog';

///////////
///////////

// Per-version release notes shown in the in-app update notice. changelog.ts is
// generated from changelog.json by scripts/josiah-release.sh from the --notes
// passed at release time, so the notice always matches the shipped version.

export function showVersionNotice(plugin: InkPlugin) {
    let curVersion = plugin.manifest.version;
    if (curVersion.endsWith('-beta')) {
        curVersion = curVersion.replace('-beta', '');
    }

    const lastVersionTipRead = plugin.settings.onboardingTips.lastVersionTipRead;
    const noLastVersionTipRead = !semVer.valid(lastVersionTipRead)
    const updatedToNewerVersion = noLastVersionTipRead || semVer.gt(curVersion, lastVersionTipRead);

    if(updatedToNewerVersion) {
        showChanges(plugin, curVersion);
    }
}

//////////

function showChanges(plugin: InkPlugin, curVersion: string) {

    const changes = CHANGELOG[curVersion];

    const noticeBody = createInkNoticeTemplate();
    noticeBody.createEl('h1').setText(`Changes in ${plugin.manifest.name} v${curVersion}`);

    if(changes && changes.length) {
        const listEl = noticeBody.createEl('ul');
        changes.forEach((change) => listEl.createEl('li').setText(change));
    } else {
        noticeBody.createEl('p').setText(`Updated to v${curVersion}.`);
    }

    const {
        tertiaryBtnEl
    } = createNoticeCtaBar(noticeBody, {
        tertiaryLabel: 'Dismiss',
    })

    const notice = launchPersistentInkNotice(noticeBody);

    if(tertiaryBtnEl) {
        tertiaryBtnEl.addEventListener('click', () => {
            notice.hide();
            plugin.settings.onboardingTips.lastVersionTipRead = plugin.manifest.version;
            plugin.saveSettings();
        });
    }

}
