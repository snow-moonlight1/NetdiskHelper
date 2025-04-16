// ==UserScript==
// @name         网盘链接自动识别补全 (Cloud Drive Link Helper)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  自动识别、清理、补全网盘分享链接(支持完整URL)，处理干扰字符，弹出选择框，复制/尝试自动填充提取码。
// @author       Gemini & You
// @match        *://*/*
// @match        *://pan.baidu.com/s/*
// @match        *://*.123pan.com/s/*
// @match        *://*.aliyundrive.com/s/*
// @match        *://*.quark.cn/s/*
// @exclude      *://pan.baidu.com/disk/home* // 排除网盘主页等非分享页面
// @exclude      *://*.123pan.com/folder*
// @exclude      *://*.aliyundrive.com/drive*
// @exclude      *://*.quark.cn/list*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const providers = {
        // Added inputSelector and potentially submitSelector for autofill
        baidu: { name: "百度网盘", domain: "https://pan.baidu.com", pathPrefix: "/s/", pwdParam: "pwd", pwdLength: 4, inputSelector: '#pwd', submitSelector: '#submitBtn' }, // Example selectors, need verification
        pan123: { name: "123云盘", domain: "https://www.123pan.com", pathPrefix: "/s/", codeSeparator: "-", codeKeyword: "提取码", inputSelector: 'input[placeholder*="提取码"], input[placeholder*="访问码"]', submitSelector: 'button[type="submit"], button:contains("确定")' }, // Example selectors
        aliyun: { name: "阿里云盘", domain: "https://www.aliyundrive.com", pathPrefix: "/s/", codeKeyword: "提取码", inputSelector: 'input[placeholder*="提取码"]', submitSelector: 'button:contains("提取文件")' }, // Example selectors
        quark: { name: "夸克网盘", domain: "https://pan.quark.cn", pathPrefix: "/s/", codeKeyword: "提取码", inputSelector: 'input[placeholder*="提取码"]', submitSelector: 'button:contains("确认")' } // Example selectors
    };
    const STORAGE_KEY_CODE = 'cdlh_shareCode';
    const STORAGE_KEY_PROVIDER = 'cdlh_shareProvider';

    const linkSelectorClass = 'cdlh-link-helper';
    const fullUrlSelectorClass = 'cdlh-full-url';

    // Regex v3: Use two main patterns separated by |
    // 1. Full URL: https?://domain/s/alphanum[non-special-chars]*
    // 2. Partial URL: /s/alphanum[non-special-chars]*
    // Allows spaces within the [^...] part now, cleaning handles it.
    const potentialLinkRegex = /(https?:\/\/[\w.\-]+\/s\/[a-zA-Z0-9][^\n\"\'\<\(\)]*)|(\/s\/[a-zA-Z0-9][^\n\"\'\<\(\)]*)/g;
    // Regex for standalone codes (less priority now, focus is on codes attached to links)
    // const standaloneCodeRegex = /(?:\W|^)([a-zA-Z0-9_\-]{8,})\s+(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{4,})(?:\W|$)/g;


    // --- Styling ---
    GM_addStyle(`
        .${linkSelectorClass}, .${fullUrlSelectorClass} {
            color: #007bff !important; cursor: pointer; text-decoration: underline !important;
            font-weight: bold; background: none !important; border: none !important;
            margin: 0 !important; padding: 0 !important;
        }
        .${linkSelectorClass}:hover, .${fullUrlSelectorClass}:hover { color: #0056b3 !important; }
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
     * Cleans PARTIAL link text (/s/...) removing junk. Handles spaces captured by regex.
     * @param {string} text - Original partial link text (must start with /s/).
     * @returns {string|null} Cleaned text, or null if invalid.
     */
    function cleanLink(text) {
        if (!text || !text.startsWith('/s/')) return null;

        // 1. Remove bracketed content: [开心], 【abc】
        let cleaned = text.replace(/[\[【][^\]】]*[\]】]/g, '');
        // 2. Remove common interfering words/chars: 删, 插, etc.
        cleaned = cleaned.replace(/[删插]/g, '');
        // 3. Remove standard emojis
        cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/ug, '');
        // 4. Remove potential invisible characters
        cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

        // 5. Handle spaces carefully: Remove leading/trailing spaces, collapse internal multiple spaces to one.
        // Then remove spaces ONLY if they are not part of a potential code keyword phrase.
        // This is complex. Let's try removing all spaces for now as paths/codes usually don't contain them.
        cleaned = cleaned.replace(/\s+/g, '');

        // 6. Trim trailing punctuation
        cleaned = cleaned.replace(/[.,!?;:]+$/, '');

        // 7. Basic validation
        if (!cleaned.startsWith('/s/') || cleaned.length <= 3 || !/^\/s\/[a-zA-Z0-9]/.test(cleaned)) {
             console.warn(`[网盘助手] Cleaning resulted in invalid link: ${text} -> ${cleaned}`);
             return null;
        }
        return cleaned;
    }

    /**
     * Parses the cleaned link (/s/...) to extract path, code, and Baidu hint.
     * @param {string} cleanedLink - Cleaned link text (starts with /s/).
     * @returns {{path: string|null, code: string|null, providerHint: string|null}}
     */
    function parseLink(cleanedLink) {
        let path = null;
        let code = null;
        let providerHint = null; // Only set for Baidu ?pwd= format

        if (!cleanedLink || !cleanedLink.startsWith('/s/')) {
            return { path, code, providerHint };
        }

        // Try Baidu format: /s/<code>?pwd=<pass>
        let match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9_-]+)\?pwd=([a-zA-Z0-9]{4})$/);
        if (match) {
            providerHint = 'baidu'; // Set hint ONLY for this specific Baidu format
            path = match[1];
            code = match[2];
            console.log(`[网盘助手] 解析为百度 ?pwd= 格式: Path=${path}, Code=${code}`);
            return { path, code, providerHint };
        }

        // Try 123Pan format: /s/<id>-<pass> (No hint)
        match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9]+)-([a-zA-Z0-9]+)$/);
        if (match) {
            path = match[1];
            code = match[2];
            console.log(`[网盘助手] 解析为 '-' 格式 (无提示): Path=${path}, Code=${code}`);
            return { path, code, providerHint }; // providerHint is null
        }

        // Try extraction code keyword format: /s/<id>提取码:<pass> (No hint)
        // Needs to handle cases where code might be attached with ? or & after cleaning spaces
        match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9_\-]+)(?:[\?\&]?)(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{4,})/i);
         if (match) {
            path = match[1];
            code = match[2];
            console.log(`[网盘助手] 解析为关键字提取码格式 (无提示): Path=${path}, Code=${code}`);
            return { path, code, providerHint }; // providerHint is null
        }

        // Fallback: Treat as path, remove potential trailing code patterns just in case
        path = cleanedLink.replace(/[\?\&]?(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*[a-zA-Z0-9]{4,}.*$/i, '');
        path = path.replace(/-[a-zA-Z0-9]+$/, ''); // Also remove potential trailing -code

        if (path && path.startsWith('/s/') && path.length > 3) {
             console.log(`[网盘助手] 解析为通用路径: Path=${path}`);
             return { path, code, providerHint }; // code and hint are null
        } else {
             console.log(`[网盘助手] 解析失败或路径无效: ${cleanedLink}`);
             return { path: null, code: null, providerHint: null };
        }
    }

    /** Shows the provider selection dialog */
    function showProviderPrompt(cleanedPath, potentialCode, originalText) {
        // ... (Modal display logic - unchanged from v1.2, including animation)
        const existingOverlay = document.getElementById('cdlh-modal-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cdlh-modal-overlay';
        const content = document.createElement('div');
        content.id = 'cdlh-modal-content';
        content.innerHTML = `<h3>选择网盘提供商 (Select Provider)</h3><p>检测到链接 (Detected Link):<br><code style="font-size: 0.9em;">${originalText}</code><br>解析路径 (Parsed Path): ${cleanedPath}${potentialCode ? '<br>提取码 (Code): ' + potentialCode : ''}</p>`;

        for (const key in providers) {
            const provider = providers[key];
            const btn = document.createElement('button');
            btn.textContent = provider.name;
            btn.onclick = (e) => {
                e.stopPropagation();
                // Pass code to handleSelection for storage/URL modification
                handleSelection(key, cleanedPath, potentialCode);
                hideModal(overlay);
            };
            content.appendChild(btn);
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
        // ... (Unchanged from v1.2)
        if (!overlay) return;
        overlay.classList.remove('cdlh-visible');
        overlay.addEventListener('transitionend', () => {
             if (overlay.parentNode) overlay.remove();
        }, { once: true });
     }


    /**
     * Handles selection, prepares for redirect (stores code), and navigates.
     * @param {string} providerKey - Key ('baidu', 'pan123', etc.)
     * @param {string} path - Cleaned path starting with /s/
     * @param {string|null} code - Extracted code
     */
    async function handleSelection(providerKey, path, code) {
        const provider = providers[providerKey];
        if (!provider || !path) return;

        let finalUrl = provider.domain + path;
        let storeCodeForAutofill = true; // Flag to control storing code

        // Baidu Specific Logic: Try to append ?pwd= if possible
        if (providerKey === 'baidu' && code && code.length === provider.pwdLength) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${provider.pwdParam}=${code}`;
            storeCodeForAutofill = false; // Already in URL, no need to store for autofill
            console.log(`[网盘助手] Baidu: Appending ?pwd= to URL.`);
        }

        console.log(`[网盘助手] Selected: ${provider.name}, Path: ${path}, Code: ${code || 'None'}, Final URL: ${finalUrl}`);

        // Store code for autofill on the destination page if needed and code exists
        if (storeCodeForAutofill && code) {
            try {
                await GM_setValue(STORAGE_KEY_CODE, code);
                await GM_setValue(STORAGE_KEY_PROVIDER, providerKey);
                console.log(`[网盘助手] Stored code "${code}" and provider "${providerKey}" for autofill.`);
                // Notify about copy as fallback/confirmation
                GM_setClipboard(code, 'text');
                 GM_notification({
                    text: `提取码 "${code}" 已复制 (将尝试自动填充)`,
                    title: '网盘助手',
                    timeout: 4000
                 });
            } catch (err) {
                 console.error('[网盘助手] Failed to store code for autofill:', err);
                 // Still copy code as fallback
                 GM_setClipboard(code, 'text');
                 GM_notification({
                    text: `提取码 "${code}" 已复制 (存储失败)`,
                    title: '网盘助手',
                    timeout: 4000
                 });
            }
        } else if (code) {
             // Code exists but wasn't stored (e.g., Baidu ?pwd=) - still copy
             GM_setClipboard(code, 'text');
             GM_notification({
                 text: `提取码 "${code}" 已复制`,
                 title: '网盘助手',
                 timeout: 4000
             });
        }

        // Redirect
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }

    /**
     * Processes a text node potentially containing links.
     * @param {Node} node - The text node.
     */
    function processNode(node) {
        let content = node.nodeValue;
        let match;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let foundMatch = false;

        potentialLinkRegex.lastIndex = 0;

        while ((match = potentialLinkRegex.exec(content)) !== null) {
            const fullUrlMatch = match[1]; // Group 1: Full URL (includes http)
            const partialUrlMatch = match[2]; // Group 2: Partial URL (starts with /s/)
            const originalMatch = fullUrlMatch || partialUrlMatch; // The actual matched string

            if (!originalMatch) continue; // Should not happen with this regex structure

            console.log(`[网盘助手] Regex Match: Full='${fullUrlMatch}', Partial='${partialUrlMatch}'`);

            // Add text before the match
            fragment.appendChild(document.createTextNode(content.substring(lastIndex, match.index)));
            foundMatch = true;

            // Trim trailing punctuation for display/linking purposes
            const displayMatch = originalMatch.replace(/[.,!?;:]+$/, '');

            if (fullUrlMatch) {
                // Handle full URL match
                console.log(`[网盘助手] Found full URL: ${displayMatch}`);
                const a = document.createElement('a');
                a.href = displayMatch; // Use trimmed URL for href
                a.textContent = displayMatch; // Show trimmed URL
                a.className = fullUrlSelectorClass;
                a.title = `点击直接打开链接 (Click to open link directly)`;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                // Add click handler to potentially parse code from full URL for storage?
                 a.onclick = async (e) => {
                     e.preventDefault(); // Prevent default navigation initially
                     const url = e.target.href;
                     console.log("[网盘助手] Full URL clicked:", url);
                     // Try parsing code from full URL (e.g., Baidu ?pwd=)
                     const baiduMatch = url.match(/\/s\/[a-zA-Z0-9_-]+\?pwd=([a-zA-Z0-9]{4})$/);
                     const code = baiduMatch ? baiduMatch[1] : null;
                     if (code) {
                         console.log("[网盘助手] Found code in full Baidu URL, copying:", code);
                         GM_setClipboard(code, 'text');
                         GM_notification({ text: `提取码 "${code}" 已复制`, title: '网盘助手', timeout: 3000 });
                     }
                     // No storage needed for Baidu ?pwd=
                     window.open(url, '_blank', 'noopener,noreferrer'); // Open link after potential copy
                 };
                fragment.appendChild(a);

            } else if (partialUrlMatch) {
                // Handle partial URL match
                console.log(`[网盘助手] Found partial link: ${originalMatch}`);
                const cleaned = cleanLink(originalMatch); // Clean the partial link
                console.log(`[网盘助手] Cleaned partial link: "${cleaned}"`);

                if (cleaned) {
                    const { path: parsedPath, code: parsedCode, providerHint } = parseLink(cleaned);
                    console.log(`[网盘助手] Parsed partial link - Path: ${parsedPath}, Code: ${parsedCode}, Hint: ${providerHint}`);

                    if (parsedPath) {
                        const span = document.createElement('span');
                        span.className = linkSelectorClass;
                        span.textContent = displayMatch; // Show trimmed original text
                        span.title = `点击处理链接 (Click to process link): ${cleaned || '无效'}`;
                        span.dataset.cleanedPath = parsedPath;
                        if (parsedCode) span.dataset.potentialCode = parsedCode;
                        span.dataset.originalText = originalMatch; // Store raw original for prompt

                        span.onclick = (e) => {
                            e.preventDefault(); e.stopPropagation();
                            const path = e.target.dataset.cleanedPath;
                            const code = e.target.dataset.potentialCode;
                            const original = e.target.dataset.originalText;
                            const hint = parseLink(cleaned)?.providerHint; // Re-parse to get hint reliably

                            console.log(`[网盘助手] Click event (Partial) - Path: ${path}, Code: ${code}, Hint: ${hint}`);

                            if (hint === 'baidu') {
                                handleSelection('baidu', path, code);
                            } else {
                                showProviderPrompt(path, code, original); // Prompt for others
                            }
                        };
                        fragment.appendChild(span);
                    } else {
                        fragment.appendChild(document.createTextNode(originalMatch)); // Append original if parsing failed
                    }
                } else {
                    fragment.appendChild(document.createTextNode(originalMatch)); // Append original if cleaning failed
                }
            }

            lastIndex = match.index + originalMatch.length; // Move lastIndex past the current match
        }

        if (lastIndex < content.length) {
            fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
        }

        if (foundMatch) {
            node.parentNode.replaceChild(fragment, node);
        }
    }

    /**
     * Attempts to auto-fill the password on cloud drive share pages.
     */
    async function tryAutofillPassword() {
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
        if (!provider || !provider.inputSelector) {
            console.warn('[网盘助手] Provider config missing or no input selector for autofill.');
            // Clear storage even if config is missing to prevent reuse
            await GM_setValue(STORAGE_KEY_CODE, null);
            await GM_setValue(STORAGE_KEY_PROVIDER, null);
            return;
        }

        // Wait a short moment for the page elements to likely be ready
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

        try {
            const inputElement = document.querySelector(provider.inputSelector);
            if (inputElement) {
                console.log('[网盘助手] Found input element:', inputElement);
                inputElement.value = code;
                // Trigger input event in case the page uses listeners
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[网盘助手] Autofilled code.');

                // Optionally try to click submit button
                if (provider.submitSelector) {
                     await new Promise(resolve => setTimeout(resolve, 200)); // Short delay before submit
                     const submitButton = document.querySelector(provider.submitSelector);
                     if (submitButton && !submitButton.disabled) {
                         console.log('[网盘助手] Found submit button, attempting click:', submitButton);
                         submitButton.click();
                     } else {
                         console.log('[网盘助手] Submit button not found or disabled.');
                     }
                }

                // Clear storage after successful fill (and potential submit attempt)
                await GM_setValue(STORAGE_KEY_CODE, null);
                await GM_setValue(STORAGE_KEY_PROVIDER, null);
                console.log('[网盘助手] Cleared stored code/provider.');

            } else {
                console.warn('[网盘助手] Password input element not found using selector:', provider.inputSelector);
                 // Clear storage even if input not found
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


    // --- Main Execution ---

    // 1. Process links on the current page (runs on all matched pages except excluded ones)
    if (!Object.values(providers).some(p => window.location.hostname.includes(p.domain.split('/')[2]))) {
        // Avoid running link processing on the target share pages themselves initially
        console.log('[网盘助手] Script starting (v1.3) - Link Processing Mode');
        // ... (TreeWalker logic - unchanged from v1.2)
        const walker = document.createTreeWalker( /* ... filter logic ... */
             document.body, NodeFilter.SHOW_TEXT, {
                 acceptNode: function(node) { /* ... same filter as v1.2 ... */
                    const parent = node.parentNode;
                    if (parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE' || parent.nodeName === 'TEXTAREA' || parent.nodeName === 'INPUT' || parent.isContentEditable || parent.closest('[contenteditable="true"]') || parent.closest(`.${linkSelectorClass}, .${fullUrlSelectorClass}`)) return NodeFilter.FILTER_REJECT;
                    if (potentialLinkRegex.test(node.nodeValue) || /\/s\/|提取码|密码|口令|code|pwd/i.test(node.nodeValue)) { potentialLinkRegex.lastIndex = 0; return NodeFilter.FILTER_ACCEPT; } // Adjusted test slightly
                    return NodeFilter.FILTER_REJECT;
                 }
             }
        );
        const nodesToProcess = [];
        let currentNode;
        while (currentNode = walker.nextNode()) nodesToProcess.push(currentNode);
        console.log(`[网盘助手] Found ${nodesToProcess.length} potential text nodes.`);
        nodesToProcess.forEach(processNode);
        console.log('[网盘助手] Link processing finished.');
    }


    // 2. Try autofill if on a matched share page (runs only on specific share pages)
    window.addEventListener('load', () => {
         if (Object.values(providers).some(p => window.location.href.startsWith(p.domain + p.pathPrefix))) {
              console.log('[网盘助手] On potential share page, attempting autofill...');
              tryAutofillPassword();
         }
    });

})();
