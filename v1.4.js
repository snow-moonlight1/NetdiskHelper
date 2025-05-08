// ==UserScript==
// @name         网盘链接自动识别补全 (Cloud Drive Link Helper)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  自动识别(网盘/通用链接)、清理、补全网盘分享链接，处理干扰字符，弹出选择框，复制/尝试自动填充提取码。整合更多网盘支持。 (Automatically identifies (cloud drive/general links), cleans, completes cloud drive share links, handles interfering characters, shows selection popup, copies/attempts autofill of extraction codes. Integrates support for more cloud drives.)
// @author       Gemini & You & Ref Scripts
// @match        *://*/*
// @match        *://pan.baidu.com/s/*
// @match        *://*.123pan.com/s/*
// @match        *://*.aliyundrive.com/s/*
// @match        *://*.quark.cn/s/*
// @match        *://share.weiyun.com/*
// @match        *://*.lanzou*.com/*
// @match        *://*.lanzn.com/*
// @match        *://cloud.189.cn/*
// @match        *://*.139.com/*
// @match        *://pan.xunlei.com/s/*
// @match        *://*.yunpan.360.cn/*
// @match        *://*.yunpan.com/*
// @match        *://115.com/s/*
// @match        *://*.cowtransfer.com/s/*
// @match        *://*.ctfile.com/*
// @match        *://*.545c.com/*
// @match        *://*.u062.com/*
// @match        *://*.ghpym.com/*
// @match        *://vdisk.weibo.com/lc/*
// @match        *://*.wenshushu.cn/*
// @match        *://drive.uc.cn/s/*
// @match        *://*.jianguoyun.com/p/*
// @match        *://pan.wo.cn/s/*
// @match        *://*.mega.nz/*
// @match        *://*.mega.co.nz/*
// @match        *://flowus.cn/*share/*
// @exclude      *://pan.baidu.com/disk/home* // Exclude cloud drive homepages etc.
// @exclude      *://*.123pan.com/folder*
// @exclude      *://*.aliyundrive.com/drive*
// @exclude      *://*.quark.cn/list*
// @exclude      *://*.google.com/* // Exclude search engines to avoid excessive processing
// @exclude      *://*.bing.com/*
// @exclude      *://*.baidu.com/* // Exclude main search engine domain, but keep pan.baidu.com/s/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @run-at       document-start // Run early for general link processing
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // Merged providers from user feedback and reference script
    // Note: Selectors are examples and NEED VERIFICATION against actual pages.
    const providers = {
        baidu: { name: "百度网盘", domain: "https://pan.baidu.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?(?:e?yun|pan)\.baidu\.com\/(?:doc\/|enterprise\/)?(?:s\/[\w~]*((?:-)?\w*)*|share\/\S{4,}))/, host: /(pan|e?yun)\.baidu\.com/, pwdParam: "pwd", pwdLength: 4, inputSelector: '#pwd, .share-access-code, #wpdoc-share-page > .u-dialog__wrapper .u-input__inner', submitSelector: '#submitBtn, .share-access .g-button, #wpdoc-share-page > .u-dialog__wrapper .u-btn--primary', storage: 'hash' },
        aliyun: { name: "阿里云盘", domain: "https://www.aliyundrive.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?(?:(?:www\.)?(?:aliyundrive|alipan)\.com\/s|alywp\.net)\/[a-zA-Z\d]+)/, host: /www\.(aliyundrive|alipan)\.com|alywp\.net/, inputSelector: 'form .ant-input, form input[type="text"], input[name="pwd"]', submitSelector: 'form .button--fep7l, form button[type="submit"]', storage: 'hash' },
        weiyun: { name: "腾讯微云", domain: "https://share.weiyun.com", pathPrefix: "/", reg: /((?:https?:\/\/)?share\.weiyun\.com\/[a-zA-Z\d]+)/, host: /share\.weiyun\.com/, inputSelector: '.mod-card-s input[type=password], input.pw-input', submitSelector: '.mod-card-s .btn-main, .pw-btn-wrap button.btn', storage: 'hash' },
        lanzou: { name: "蓝奏云", domain: "https://www.lanzoui.com", pathPrefix: "/", reg: /((?:https?:\/\/)?(?:[a-zA-Z0-9\-.]+)?(?:lanzou[a-z]|lanzn)\.com\/[a-zA-Z\d_\-]+(?:\/[\w-]+)?)/, host: /(?:[a-zA-Z\d-.]+)?(?:lanzou[a-z]|lanzn)\.com/, inputSelector: '#pwd', submitSelector: '.passwddiv-btn, #sub', storage: 'hash' }, // Domain is example, host regex covers variations
        tianyi: { name: "天翼云盘", domain: "https://cloud.189.cn", pathPrefix: "/", reg: /((?:https?:\/\/)?cloud\.189\.cn\/(?:t\/|web\/share\?code=)?[a-zA-Z\d]+)/, host: /cloud\.189\.cn/, inputSelector: '.access-code-item #code_txt, input.access-code-input', submitSelector: '.access-code-item .visit, .button', storage: 'hash', storagePwdName: 'tmp_tianyi_pwd' }, // Storage type might depend on mobile/desktop, defaulting to hash
        caiyun: { name: "移动云盘", domain: "https://caiyun.139.com", pathPrefix: "/", reg: /((?:https?:\/\/)?caiyun\.139\.com\/(?:m\/i|w\/i\/|web\/|front\/#\/detail)\??(?:linkID=)?[a-zA-Z\d]+)/, host: /(?:cai)?yun\.139\.com/, inputSelector: '.token-form input[type=text]', submitSelector: '.token-form .btn-token', storage: 'local', storagePwdName: 'tmp_caiyun_pwd' },
        xunlei: { name: "迅雷云盘", domain: "https://pan.xunlei.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?pan\.xunlei\.com\/s\/[\w-]{10,})/, host: /pan\.xunlei\.com/, inputSelector: '.pass-input-wrap .td-input__inner', submitSelector: '.pass-input-wrap .td-button', storage: 'hash' },
        pan123: { name: "123云盘", domain: "https://www.123pan.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?www\.123pan\.com\/s\/[\w-]{6,})/, host: /www\.123pan\.com/, inputSelector: '.ca-fot input, .appinput .appinput', submitSelector: '.ca-fot button, .appinput button', storage: 'hash' },
        pan360: { name: "360云盘", domain: "https://yunpan.360.cn", pathPrefix: "/", reg: /((?:https?:\/\/)?(?:[a-zA-Z\d\-.]+)?(?:yunpan\.360\.cn|yunpan\.com)(?:\/lk)?\/surl_\w{6,})/, host: /[\w.]+?yunpan\.com/, inputSelector: '.pwd-input', submitSelector: '.submit-btn', storage: 'local', storagePwdName: 'tmp_360_pwd' },
        pan115: { name: "115网盘", domain: "https://115.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?115\.com\/s\/[a-zA-Z\d]+)/, host: /115\.com/, inputSelector: '.form-decode input', submitSelector: '.form-decode .submit a', storage: 'hash' },
        cowtransfer: { name: "奶牛快传", domain: "https://cowtransfer.com", pathPrefix: "/s/", reg: /((?:https?:\/\/)?(?:[a-zA-Z\d-.]+)?cowtransfer\.com\/s\/[a-zA-Z\d]+)/, host: /(?:[a-zA-Z\d-.]+)?cowtransfer\.com/, inputSelector: '.receive-code-input input', submitSelector: '.open-button', storage: 'hash' },
        ctfile: { name: "城通网盘", domain: "https://www.ctfile.com", pathPrefix: "/", reg: /((?:https?:\/\/)?(?:[a-zA-Z\d-.]+)?(?:ctfile|545c|u062|ghpym)\.com\/\w+\/[a-zA-Z\d-]+)/, host: /(?:[a-zA-Z\d-.]+)?(?:ctfile|545c|u062)\.com/, inputSelector: '#passcode', submitSelector: '.card-body button', storage: 'hash' },
        quark: { name: "夸克网盘", domain: "https://pan.quark.cn", pathPrefix: "/s/", reg: /((?:https?:\/\/)?pan\.quark\.cn\/s\/[a-zA-Z\d-]+)/, host: /pan\.quark\.cn/, inputSelector: '.ant-input', submitSelector: '.ant-btn-primary', storage: 'local', storagePwdName: 'tmp_quark_pwd' },
        vdisk: { name: "新浪微盘", domain: "https://vdisk.weibo.com", pathPrefix: "/lc/", reg: /((?:https?:\/\/)?vdisk.weibo.com\/lc\/\w+)/, host: /vdisk\.weibo\.com/, inputSelector: '#keypass, #access_code', submitSelector: '.search_btn_wrap a, #linkcommon_btn', storage: 'hash' },
        wenshushu: { name: "文叔叔", domain: "https://www.wenshushu.cn", pathPrefix: "/", reg: /((?:https?:\/\/)?(?:www\.wenshushu|ws28)\.cn\/(?:k|box|f)\/\w+)/, host: /www\.wenshushu\.cn/, inputSelector: '.pwd-inp .ivu-input', submitSelector: '.pwd-inp .ivu-btn', storage: 'hash' },
        uc: { name: "UC网盘", domain: "https://drive.uc.cn", pathPrefix: "/s/", reg: /((?:https?:\/\/)?drive\.uc\.cn\/s\/[a-zA-Z\d]+)/, host: /drive\.uc\.cn/, inputSelector: "input[class*='ShareReceivePC--input'], .input-wrap input", submitSelector: "button[class*='ShareReceivePC--submit-btn'], .input-wrap button", storage: 'hash' },
        jianguoyun: { name: "坚果云", domain: "https://www.jianguoyun.com", pathPrefix: "/p/", reg: /((?:https?:\/\/)?www\.jianguoyun\.com\/p\/[\w-]+)/, host: /www\.jianguoyun\.com/, inputSelector: 'input[type=password]', submitSelector: '.ok-button, .confirm-button', storage: 'hash' },
        wopan: { name: "联通云盘", domain: "https://pan.wo.cn", pathPrefix: "/s/", reg: /((?:https?:\/\/)?pan\.wo\.cn\/s\/[\w_]+)/, host: /(pan\.wo\.cn|panservice\.mail\.wo\.cn)/, inputSelector: 'input.el-input__inner, .van-field__control', submitSelector: '.s-button, .share-code button', storage: 'hash', storagePwdName: 'tmp_wo_pwd' },
        mega: { name: "MEGA", domain: "https://mega.nz", pathPrefix: "/#", reg: /((?:https?:\/\/)?(?:mega\.nz|mega\.co\.nz)\/(?:#F?|file\/|folder\/)![\w!-]+)/, host: /(?:mega\.nz|mega\.co\.nz)/, inputSelector: '.dlkey-dialog input', submitSelector: '.dlkey-dialog .fm-dialog-new-folder-button', storage: 'local' }, // MEGA link structure is different
        flowus: { name: "FlowUs息流", domain: "https://flowus.cn", pathPrefix: "/", reg: /((?:https?:\/\/)?flowus\.cn\/[\S ^\/]*\/?share\/[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12})/, host: /flowus\.cn/, storage: 'hash' },
        // Add more providers here based on reference script...
    };
    const STORAGE_KEY_CODE = 'cdlh_shareCode';
    const STORAGE_KEY_PROVIDER = 'cdlh_shareProvider';

    const linkSelectorClass = 'cdlh-cloud-link'; // Specific class for cloud links
    const generalLinkClass = 'cdlh-general-link'; // Class for general links

    // Regex v4: Prioritize matching specific cloud drive patterns first.
    // Group 1: Cloud drive full URL or partial (/s/...) - stops before common delimiters or code phrases
    // Group 2: Optional code part following the link (提取码: xxx or ?pwd=xxx) - must have space/delimiter before it
    const cloudLinkRegex = /((?:https?:\/\/[\w.\-]+\/|\/)?s\/[a-zA-Z0-9_\-]+(?:[?&][\w=&%+-]*)?)(?:\s+(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{3,8}))?/g;

    // Regex for general HTTP/HTTPS links (excluding those starting with /s/)
    const generalLinkRegex = /(?<!\/)https?:\/\/[\w.-]+\.\w+(?::\d{1,5})?(?:\/[\w?&.=%-@+#]*)*[\w/-]/g; // Added negative lookbehind to avoid /s/

    // Regex to extract password/code from text near a link (used as fallback)
    const codeExtractRegex = /(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{3,8})/i;

    // --- Styling ---
    GM_addStyle(`
        .${linkSelectorClass}, .${generalLinkClass} { /* Apply base style to both */
            color: #007bff !important; cursor: pointer; text-decoration: underline !important;
            font-weight: bold; background: none !important; border: none !important;
            margin: 0 !important; padding: 0 !important;
        }
        .${linkSelectorClass}:hover, .${generalLinkClass}:hover { color: #0056b3 !important; }
        /* Specific styles if needed */
        .${linkSelectorClass} { /* Maybe slightly different style for cloud links? */ }
        .${generalLinkClass} { /* Style for general links */ }

        /* Modal Styles (unchanged) */
        #cdlh-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6); z-index: 99998; display: flex;
            justify-content: center; align-items: center; backdrop-filter: blur(3px);
            opacity: 0; visibility: hidden; transition: opacity 0.3s ease-in-out, visibility 0s linear 0.3s;
        }
        #cdlh-modal-overlay.cdlh-visible { opacity: 1; visibility: visible; transition: opacity 0.3s ease-in-out, visibility 0s linear 0s; }
        #cdlh-modal-content {
            background-color: white; padding: 25px 35px; border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.25); min-width: 320px; max-width: 90%;
            text-align: center; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            border: 1px solid #ccc; transform: scale(0.9); opacity: 0;
            transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
        }
        #cdlh-modal-overlay.cdlh-visible #cdlh-modal-content { transform: scale(1); opacity: 1; }
        #cdlh-modal-content h3 { margin-top: 0; margin-bottom: 15px; color: #333; font-size: 1.3em; }
        #cdlh-modal-content p { margin-bottom: 20px; color: #555; font-size: 0.95em; word-break: break-all; }
        #cdlh-modal-content code { font-size: 0.9em; background-color: #eee; padding: 2px 4px; border-radius: 3px; }
        #cdlh-modal-content button {
            display: block; width: 100%; padding: 12px 20px; margin: 10px 0; border: none;
            border-radius: 5px; background-color: #007bff; color: white; font-size: 16px;
            cursor: pointer; transition: background-color 0.2s ease, transform 0.1s ease;
        }
        #cdlh-modal-content button:hover { background-color: #0056b3; transform: translateY(-1px); }
        #cdlh-modal-content button.cdlh-cancel { background-color: #6c757d; }
        #cdlh-modal-content button.cdlh-cancel:hover { background-color: #5a6268; }
    `);


    // --- Functions ---

    /**
     * Cleans PARTIAL cloud link text (/s/...) removing junk.
     * @param {string} text - Original partial link text (must start with /s/).
     * @returns {string|null} Cleaned text, or null if invalid.
     */
    function cleanPartialLink(text) {
        if (!text || !text.startsWith('/s/')) return null;
        // Basic cleaning, remove common junk, emojis, invisible chars
        let cleaned = text.replace(/[\[【][^\]】]*[\]】]/g, '')
                          .replace(/[删插]/g, '')
                          .replace(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/ug, '')
                          .replace(/[\u200B-\u200D\uFEFF]/g, '')
                          .replace(/\s+/g, ''); // Remove all spaces for simplicity now

        // Trim trailing punctuation AFTER potential query params
        // Be careful not to remove punctuation that might be part of the link/query
        cleaned = cleaned.replace(/(?<![a-zA-Z0-9])[.,!?;:]+$/, '');


        // Validation
        if (!/^\/s\/[a-zA-Z0-9]/.test(cleaned)) {
             console.warn(`[网盘助手] Cleaning partial link resulted in invalid: ${text} -> ${cleaned}`);
             return null;
        }
        return cleaned;
    }

    /**
     * Parses a cleaned cloud link path (/s/...) to extract path and code.
     * No longer assumes provider based on format (except Baidu ?pwd=).
     * @param {string} cleanedLinkPath - Cleaned link path (starts with /s/).
     * @returns {{path: string|null, code: string|null, isBaiduPwdFormat: boolean}}
     */
    function parseCloudLinkPath(cleanedLinkPath) {
        let path = null;
        let code = null;
        let isBaiduPwdFormat = false;

        if (!cleanedLinkPath || !cleanedLinkPath.startsWith('/s/')) {
            return { path, code, isBaiduPwdFormat };
        }

        // Check Baidu ?pwd= format first
        let match = cleanedLinkPath.match(/^(\/s\/[a-zA-Z0-9_-]+)\?pwd=([a-zA-Z0-9]{4})$/);
        if (match) {
            path = match[1];
            code = match[2];
            isBaiduPwdFormat = true;
            console.log(`[网盘助手] 解析为百度 ?pwd= 格式: Path=${path}, Code=${code}`);
            return { path, code, isBaiduPwdFormat };
        }

        // No other format implies code directly from path (removed '-' logic)
        // Just return the path itself
        path = cleanedLinkPath;
         // Basic validation on the path itself
        if (path && path.startsWith('/s/') && path.length > 3) {
             console.log(`[网盘助手] 解析为通用路径: Path=${path}`);
             return { path, code, isBaiduPwdFormat }; // code is null
        } else {
             console.log(`[网盘助手] 解析路径无效: ${cleanedLinkPath}`);
             return { path: null, code: null, isBaiduPwdFormat: false };
        }
    }


    /** Shows the provider selection dialog */
    function showProviderPrompt(linkPath, potentialCode, originalText) {
        // ... (Modal display logic - unchanged) ...
        const existingOverlay = document.getElementById('cdlh-modal-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cdlh-modal-overlay';
        const content = document.createElement('div');
        content.id = 'cdlh-modal-content';
        // Display original text and the *parsed* path and code
        content.innerHTML = `<h3>选择网盘提供商 (Select Provider)</h3><p>检测到内容 (Detected):<br><code style="font-size: 0.9em;">${originalText}</code><br>解析路径 (Path): ${linkPath}${potentialCode ? '<br>提取码 (Code): ' + potentialCode : ''}</p>`;

        for (const key in providers) {
            // Only show providers that actually have a /s/ path structure generally or other common prefixes
             if (providers[key].pathPrefix || key === 'baidu' || key === 'pan123' || key === 'aliyun' || key === 'quark' || key === 'weiyun' || key === 'lanzou' || key === 'tianyi' || key === 'caiyun' || key === 'xunlei' || key === 'pan360' || key === 'pan115' || key === 'cowtransfer' || key === 'ctfile') { // Add more relevant keys if needed
                const provider = providers[key];
                const btn = document.createElement('button');
                btn.textContent = provider.name;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    handleSelection(key, linkPath, potentialCode); // Pass parsed path and code
                    hideModal(overlay);
                };
                content.appendChild(btn);
            }
        }
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消 (Cancel)';
        cancelBtn.className = 'cdlh-cancel';
        cancelBtn.onclick = (e) => { e.stopPropagation(); hideModal(overlay); };
        content.appendChild(cancelBtn);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => { overlay.classList.add('cdlh-visible'); });
        overlay.addEventListener('click', (event) => { if (event.target === overlay) hideModal(overlay); });
    }

    /** Hides the modal with animation */
    function hideModal(overlay) {
        // ... (Unchanged) ...
         if (!overlay) return;
         overlay.classList.remove('cdlh-visible');
         overlay.addEventListener('transitionend', () => {
              if (overlay.parentNode) overlay.remove();
         }, { once: true });
    }

    /**
     * Handles selection, prepares for redirect (stores code), and navigates.
     * @param {string} providerKey - Key ('baidu', 'pan123', etc.)
     * @param {string} path - Parsed path (e.g., /s/xyz or /lc/abc)
     * @param {string|null} code - Extracted code
     */
    async function handleSelection(providerKey, path, code) {
        const provider = providers[providerKey];
        if (!provider || !path) return;

        // Ensure path starts correctly based on provider config (might not always be /s/)
        const expectedPrefix = provider.pathPrefix || '/s/'; // Default to /s/ if not specified
        if (!path.startsWith(expectedPrefix)) {
            console.warn(`[网盘助手] Path "${path}" does not start with expected prefix "${expectedPrefix}" for provider "${providerKey}". Attempting anyway.`);
            // Optionally prepend domain only: finalUrl = provider.domain + path;
        }

        let finalUrl = provider.domain + path;
        let storeCodeForAutofill = true;

        // Baidu Specific Logic: Append ?pwd= if code exists and matches length
        if (providerKey === 'baidu' && code && code.length === provider.pwdLength) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${provider.pwdParam}=${code}`;
            storeCodeForAutofill = false;
            console.log(`[网盘助手] Baidu: Appending ?pwd= to URL.`);
        }

        console.log(`[网盘助手] Selected: ${provider.name}, Path: ${path}, Code: ${code || 'None'}, Final URL: ${finalUrl}`);

        // Store code for autofill if needed
        if (storeCodeForAutofill && code) {
            try {
                await GM_setValue(STORAGE_KEY_CODE, code);
                await GM_setValue(STORAGE_KEY_PROVIDER, providerKey);
                console.log(`[网盘助手] Stored code "${code}" and provider "${providerKey}" for autofill.`);
                GM_setClipboard(code, 'text'); // Also copy as fallback
                 GM_notification({ text: `提取码 "${code}" 已复制 (将尝试自动填充)`, title: '网盘助手', timeout: 4000 });
            } catch (err) {
                 console.error('[网盘助手] Failed to store code for autofill:', err);
                 GM_setClipboard(code, 'text');
                 GM_notification({ text: `提取码 "${code}" 已复制 (存储失败)`, title: '网盘助手', timeout: 4000 });
            }
        } else if (code) {
             GM_setClipboard(code, 'text');
             GM_notification({ text: `提取码 "${code}" 已复制`, title: '网盘助手', timeout: 4000 });
        }

        // Redirect using GM_openInTab for better control? Or keep window.open?
        GM_openInTab(finalUrl, { active: true, setParent: true }); // Use GM_openInTab
        // window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }

    /**
     * Processes a text node, finding cloud links, general links, and handling them.
     * @param {Node} node - The text node.
     */
    function processNode(node) {
        let content = node.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let foundMatch = false;

        // --- Step 1: Process Cloud Links ---
        cloudLinkRegex.lastIndex = 0; // Reset regex state
        let cloudMatches = [];
        let match;
        while ((match = cloudLinkRegex.exec(content)) !== null) {
            cloudMatches.push({
                index: match.index,
                linkPart: match[1], // The /s/... part or full URL with /s/
                codePart: match[2], // The code extracted by the regex (optional)
                fullMatch: match[0] // The entire string matched by this iteration
            });
        }

        // --- Step 2: Process General Links ---
        generalLinkRegex.lastIndex = 0; // Reset regex state
        let generalMatches = [];
        while ((match = generalLinkRegex.exec(content)) !== null) {
             // Avoid matching if it overlaps significantly with a cloud link match
             const isOverlapping = cloudMatches.some(cm =>
                 match.index < (cm.index + cm.fullMatch.length) && (match.index + match[0].length) > cm.index
             );
             if (!isOverlapping) {
                 generalMatches.push({
                     index: match.index,
                     link: match[0]
                 });
             }
        }

        // --- Step 3: Combine and Sort Matches ---
        let allMatches = [...cloudMatches, ...generalMatches];
        allMatches.sort((a, b) => a.index - b.index); // Sort by starting position

        // --- Step 4: Build the Fragment ---
        allMatches.forEach(m => {
            // Add text before the current match
            if (m.index > lastIndex) {
                fragment.appendChild(document.createTextNode(content.substring(lastIndex, m.index)));
            }
            foundMatch = true;

            if (m.linkPart !== undefined) { // It's a cloud link match
                const originalCloudMatchText = m.fullMatch; // Use the full matched text for context
                const linkPartRaw = m.linkPart;
                let codePartRaw = m.codePart; // Code found by regex directly after link

                console.log(`[网盘助手] Cloud Match: Link='${linkPartRaw}', Code='${codePartRaw}', Full='${originalCloudMatchText}'`);

                // Determine if link is full URL or partial
                const isFullUrl = linkPartRaw.startsWith('http');
                // Trim trailing punctuation from the link part only for display/href
                let displayLink = linkPartRaw.replace(/[.,!?;:]+$/, '');
                let finalCode = codePartRaw; // Use code found by regex if present

                if (isFullUrl) {
                    // Full Cloud URL (e.g., https://pan.baidu.com/s/...)
                     const a = document.createElement('a');
                     a.href = displayLink;
                     a.textContent = displayLink; // Show the cleaned link
                     a.className = linkSelectorClass; // Use cloud link class
                     a.title = `点击打开网盘链接 (Click to open cloud link)`;
                     a.target = '_blank';
                     a.rel = 'noopener noreferrer';
                     a.onclick = async (e) => {
                         e.preventDefault();
                         const url = e.target.href;
                         console.log("[网盘助手] Full Cloud URL clicked:", url);
                         // Try to parse code from URL itself (Baidu ?pwd=)
                         const baiduMatch = url.match(/\?pwd=([a-zA-Z0-9]{4})$/);
                         const urlCode = baiduMatch ? baiduMatch[1] : null;
                         const codeToUse = finalCode || urlCode; // Prioritize code found near link, fallback to URL code

                         if (codeToUse) {
                             GM_setClipboard(codeToUse, 'text');
                             GM_notification({ text: `提取码 "${codeToUse}" 已复制`, title: '网盘助手', timeout: 3000 });
                         }
                         // Determine provider based on domain for potential autofill storage if code wasn't in URL
                         let providerKey = null;
                         let providerPath = null;
                         try {
                             const urlObj = new URL(url);
                             for (const key in providers) {
                                 if (providers[key].host.test(urlObj.hostname)) {
                                     providerKey = key;
                                     providerPath = urlObj.pathname + urlObj.search; // Get path + query
                                     // Ensure path starts with expected prefix for consistency
                                     const expectedPrefix = providers[key].pathPrefix || '/s/';
                                     if (!providerPath.startsWith(expectedPrefix)) {
                                         console.warn(`[网盘助手] Full URL path "${providerPath}" doesn't match expected prefix "${expectedPrefix}" for ${key}`);
                                         // Decide how to handle this - maybe proceed anyway?
                                     }
                                     break;
                                 }
                             }
                         } catch (e) { console.error("Error parsing URL", e); }

                         if (providerKey && codeToUse && !urlCode) { // Store only if code wasn't part of URL
                             try {
                                 await GM_setValue(STORAGE_KEY_CODE, codeToUse);
                                 await GM_setValue(STORAGE_KEY_PROVIDER, providerKey);
                                 console.log(`[网盘助手] Stored code "${codeToUse}" for ${providerKey} from full URL context.`);
                             } catch(err) { console.error("Storage failed", err); }
                         }
                         GM_openInTab(url, { active: true, setParent: true }); // Open link after potential copy/store
                     };
                     fragment.appendChild(a);

                } else {
                    // Partial Cloud Link (/s/...)
                    const cleanedPath = cleanPartialLink(linkPartRaw); // Clean the /s/... part
                    if (cleanedPath) {
                        const { path: parsedPath, code: pathCode, isBaiduPwdFormat } = parseCloudLinkPath(cleanedPath);
                        const codeToUse = finalCode || pathCode; // Prioritize code found near link, fallback to code parsed from path (e.g. ?pwd=)

                        if (parsedPath) {
                            const span = document.createElement('span');
                            span.className = linkSelectorClass;
                            span.textContent = displayLink; // Show the cleaned original partial link
                            span.title = `点击处理网盘链接 (Click to process cloud link): ${parsedPath}`;
                            span.dataset.parsedPath = parsedPath; // Store parsed path
                            if (codeToUse) span.dataset.potentialCode = codeToUse; // Store final code
                            span.dataset.originalText = originalCloudMatchText; // Store raw original for prompt

                            span.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const path = e.target.dataset.parsedPath;
                                const code = e.target.dataset.potentialCode;
                                const original = e.target.dataset.originalText;
                                const isBaiduDirect = parseCloudLinkPath(cleanedPath)?.isBaiduPwdFormat;

                                console.log(`[网盘助手] Click event (Partial) - Path: ${path}, Code: ${code}, isBaiduDirect: ${isBaiduDirect}`);

                                if (isBaiduDirect) {
                                    handleSelection('baidu', path, code); // Directly handle Baidu ?pwd= format
                                } else {
                                    showProviderPrompt(path, code, original); // Prompt for others
                                }
                            };
                            fragment.appendChild(span);
                        } else {
                             fragment.appendChild(document.createTextNode(originalCloudMatchText)); // Append original if parsing failed
                        }
                    } else {
                         fragment.appendChild(document.createTextNode(originalCloudMatchText)); // Append original if cleaning failed
                    }
                }
                 // Advance index past the full cloud match (link part + optional code part)
                 lastIndex = m.index + originalCloudMatchText.length;

            } else if (m.link !== undefined) { // It's a general link match
                 const generalLink = m.link;
                 console.log(`[网盘助手] Found General Link: ${generalLink}`);
                 const a = document.createElement('a');
                 a.href = generalLink;
                 a.textContent = generalLink;
                 a.className = generalLinkClass; // Use general link class
                 a.title = `点击打开链接 (Click to open link)`;
                 a.target = '_blank';
                 a.rel = 'noopener noreferrer';
                 fragment.appendChild(a);
                 lastIndex = m.index + generalLink.length; // Advance index past the general link
            }

        });

        // Add any remaining text after the last match
        if (lastIndex < content.length) {
            fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
        }

        // Replace the original node only if matches were found
        if (foundMatch) {
            // Check if parent already contains our specific classes to prevent nesting issues
            if (!node.parentNode || !node.parentNode.classList || (!node.parentNode.classList.contains(linkSelectorClass) && !node.parentNode.classList.contains(generalLinkClass))) {
                 try {
                    node.parentNode.replaceChild(fragment, node);
                 } catch (e) {
                     console.error("[网盘助手] Error replacing node:", e, "Node:", node, "Fragment:", fragment);
                     // Fallback or ignore if replacement fails
                 }
            } else {
                 console.warn("[网盘助手] Skipping replacement to avoid nesting links within links.", node.parentNode);
            }
        }
    }


    /** Attempts to auto-fill the password on cloud drive share pages. */
    async function tryAutofillPassword() {
        // ... (Autofill logic - largely unchanged from v1.3, but ensure selectors in providers are updated) ...
        const currentUrl = window.location.href;
        console.log('[网盘助手] Checking for autofill on:', currentUrl);

        const code = await GM_getValue(STORAGE_KEY_CODE, null);
        const providerKey = await GM_getValue(STORAGE_KEY_PROVIDER, null);

        if (!code || !providerKey) {
            console.log('[网盘助手] No code/provider found in storage for autofill.');
            return;
        }
        console.log(`[网盘助手] Found stored code "${code}" for provider "${providerKey}". Attempting autofill.`);

        const provider = providers[providerKey];
        // Check if the current URL actually matches the provider's host regex
        if (!provider || !provider.host.test(window.location.hostname)) {
             console.warn(`[网盘助手] Stored provider "${providerKey}" does not match current host "${window.location.hostname}". Clearing storage.`);
             await GM_setValue(STORAGE_KEY_CODE, null);
             await GM_setValue(STORAGE_KEY_PROVIDER, null);
             return;
        }
        if (!provider.inputSelector) {
            console.warn(`[网盘助手] Provider "${providerKey}" config missing input selector. Clearing storage.`);
            await GM_setValue(STORAGE_KEY_CODE, null);
            await GM_setValue(STORAGE_KEY_PROVIDER, null);
            return;
        }

        // Wait for elements
        await new Promise(resolve => setTimeout(resolve, 700)); // Increased delay slightly more

        try {
            const inputElement = document.querySelector(provider.inputSelector);
            if (inputElement && !inputElement.disabled && inputElement.offsetParent !== null) { // Check visibility
                console.log('[网盘助手] Found input element:', inputElement);
                inputElement.value = code;
                // Trigger events for frameworks like React/Vue
                inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                inputElement.focus(); // Try focusing
                inputElement.blur(); // Then blurring, sometimes helps trigger validation
                console.log('[网盘助手] Autofilled code.');

                // Try submit
                if (provider.submitSelector) {
                     await new Promise(resolve => setTimeout(resolve, 400)); // Delay before submit
                     const submitButton = document.querySelector(provider.submitSelector);
                     if (submitButton && !submitButton.disabled && submitButton.offsetParent !== null) {
                         console.log('[网盘助手] Found submit button, attempting click:', submitButton);
                         submitButton.click();
                     } else {
                         console.log('[网盘助手] Submit button not found, disabled, or hidden.');
                     }
                }
                // Clear storage after successful attempt
                await GM_setValue(STORAGE_KEY_CODE, null);
                await GM_setValue(STORAGE_KEY_PROVIDER, null);
                console.log('[网盘助手] Cleared stored code/provider.');
            } else {
                console.warn('[网盘助手] Password input element not found, disabled, or hidden using selector:', provider.inputSelector);
                 // Clear storage even if input not found, to prevent retrying with wrong code
                 await GM_setValue(STORAGE_KEY_CODE, null);
                 await GM_setValue(STORAGE_KEY_PROVIDER, null);
            }
        } catch (error) {
            console.error('[网盘助手] Error during autofill attempt:', error);
             // Clear storage on error
             await GM_setValue(STORAGE_KEY_CODE, null);
             await GM_setValue(STORAGE_KEY_PROVIDER, null);
        }
    }

    // --- Observer and Initial Run ---
    const formatLimit = 10; // Limit processing per node
    const formatMap = new WeakMap();
    const ignoreTags = ['SCRIPT', 'STYLE', 'A', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'TITLE', 'PRE', `.${linkSelectorClass}`, `.${generalLinkClass}`]; // Added PRE and generated classes

    function processTarget(target) {
         if (!target || target.nodeType !== Node.ELEMENT_NODE || ignoreTags.some(tag => target.matches(tag))) {
             return;
         }
         // Limit processing depth/frequency per node
         let formatTimes = formatMap.get(target) || 0;
         if (formatTimes > formatLimit) return;
         formatMap.set(target, formatTimes + 1);

         // Process direct text node children
         // Create a snapshot of childNodes as processing might change the live list
         const childNodesSnapshot = Array.from(target.childNodes);
         childNodesSnapshot.forEach(node => {
             if (node.nodeType === Node.TEXT_NODE) {
                 // Check content before processing
                 const textContent = node.nodeValue;
                 cloudLinkRegex.lastIndex = 0; // Reset before test
                 generalLinkRegex.lastIndex = 0; // Reset before test
                 if (cloudLinkRegex.test(textContent) || generalLinkRegex.test(textContent)) {
                      processNode(node);
                 }
             } else if (node.nodeType === Node.ELEMENT_NODE) {
                 // Recursively process child elements if needed, though observer should handle most cases
                 // Be careful with recursion depth/performance
                 // processTarget(node); // Optional: uncomment for deeper initial scan
             }
         });
    }

    // Run on existing content when script starts
    function initialScan() {
        console.log('[网盘助手] Starting initial scan (v1.4)...');
        // Target common content containers, avoid scanning the entire body directly if possible
        const contentAreas = document.querySelectorAll('body, main, article, .content, #content, #main'); // Example selectors
        contentAreas.forEach(area => {
            // Scan direct children first
            processTarget(area);
            // Then scan descendants more carefully
            area.querySelectorAll('*:not(script):not(style):not(textarea):not(a):not(pre):not(code)')
                .forEach(processTarget);
        });
        console.log('[网盘助手] Initial scan finished.');
    }

    // Use MutationObserver for dynamically added content
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                         processTarget(node); // Process the added node itself
                         node.querySelectorAll('*:not(script):not(style):not(textarea):not(a):not(pre):not(code)')
                             .forEach(processTarget); // Process its descendants
                    } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
                         processTarget(node.parentNode); // Process the parent if a text node is added
                    }
                });
            } else if (mutation.type === 'characterData') {
                 // Handle text changes within existing nodes
                 if (mutation.target && mutation.target.nodeType === Node.TEXT_NODE && mutation.target.parentNode) {
                     processTarget(mutation.target.parentNode); // Re-process the parent container
                 }
            }
        });
    });

    // Start observing after initial scan might be better
    // Use window.onload to ensure body exists for initial scan & observer
    window.addEventListener('load', () => {
        // 1. Autofill check (runs only on specific share pages)
        const currentHostname = window.location.hostname;
        const currentPathname = window.location.pathname;
        let isOnSharePage = false;
        for (const key in providers) {
            const provider = providers[key];
            const expectedPrefix = provider.pathPrefix || '/s/'; // Use configured prefix or default
            if (provider.host.test(currentHostname) && currentPathname.startsWith(expectedPrefix)) {
                isOnSharePage = true;
                break;
            }
        }

        if (isOnSharePage) {
             console.log('[网盘助手] On potential share page, attempting autofill...');
             tryAutofillPassword();
        } else {
            // 2. Initial Link Scan (runs everywhere else)
            initialScan();

            // 3. Start MutationObserver only if not on a share page initially?
            // Or always start it? Let's start it always for now.
            observer.observe(document.body || document.documentElement, { // Observe body or html
                childList: true,
                subtree: true,
                characterData: true // Observe text changes too
            });
            console.log('[网盘助手] MutationObserver started.');
        }
    });

})();
