// ==UserScript==
// @name         网盘链接自动识别补全 (Cloud Drive Link Helper)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自动识别、清理、补全网盘分享链接(支持完整URL)，处理干扰字符，弹出选择框，复制提取码。
// @author       Gemini & You
// @match        *://*/*
// @exclude      *://pan.baidu.com/* // 排除百度网盘自身，避免干扰
// @exclude      *://*.123pan.com/* // 排除123云盘自身及其子域名
// @exclude      *://*.aliyundrive.com/* // 排除阿里云盘自身及其子域名
// @exclude      *://*.quark.cn/* // 排除夸克网盘自身及其子域名
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_notification
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const providers = {
        baidu: { name: "百度网盘", domain: "https://pan.baidu.com", pathPrefix: "/s/", pwdParam: "pwd", pwdLength: 4 },
        pan123: { name: "123云盘", domain: "https://www.123pan.com", pathPrefix: "/s/", codeSeparator: "-", codeKeyword: "提取码" },
        aliyun: { name: "阿里云盘", domain: "https://www.aliyundrive.com", pathPrefix: "/s/", codeKeyword: "提取码" }, // Code often external
        quark: { name: "夸克网盘", domain: "https://pan.quark.cn", pathPrefix: "/s/", codeKeyword: "提取码" } // Code often external
        // Add more providers if needed
    };

    const linkSelectorClass = 'cdlh-link-helper'; // CSS class for highlighted links
    const fullUrlSelectorClass = 'cdlh-full-url'; // CSS class for detected full URLs

    // Regex to find potential link fragments or full URLs, and standalone codes
    // Group 1: Captures the link part (optional full URL + /s/path...)
    // Group 2: Captures standalone code patterns
    // Updated Regex:
    // - Optional non-capturing group for http(s)://domain/
    // - Requires /s/
    // - Requires alphanumeric char after /s/
    // - More permissive capture after that to grab junk for later cleaning
    // - Improved standalone code capture (Group 2)
    const potentialLinkRegex = /((?:https?:\/\/[\w\.\-]+\/)?\/s\/[a-zA-Z0-9][^\s\"\'\<\(\)]*)|(?:\W|^)([a-zA-Z0-9_\-]{8,})\s+(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{4,})(?:\W|$)/g;


    // --- Styling ---
    GM_addStyle(`
        .${linkSelectorClass}, .${fullUrlSelectorClass} {
            color: #007bff !important; /* Blue link color */
            cursor: pointer;
            text-decoration: underline !important;
            font-weight: bold; /* Make it stand out */
            background: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        .${linkSelectorClass}:hover, .${fullUrlSelectorClass}:hover {
            color: #0056b3 !important; /* Darker blue on hover */
        }
        /* Modal Styles with Animation */
        #cdlh-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 99998;
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(3px);
            /* Animation */
            opacity: 0;
            visibility: hidden; /* Hide initially */
            transition: opacity 0.3s ease-in-out, visibility 0s linear 0.3s; /* Delay visibility change */
        }
        #cdlh-modal-overlay.cdlh-visible { /* Class to show modal */
            opacity: 1;
            visibility: visible; /* Make visible */
            transition: opacity 0.3s ease-in-out, visibility 0s linear 0s;
        }
        #cdlh-modal-content {
            background-color: white;
            padding: 25px 35px;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.25);
            min-width: 320px;
            max-width: 90%;
            text-align: center;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            border: 1px solid #ccc;
             /* Animation */
            transform: scale(0.9);
            opacity: 0;
            transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
        }
        #cdlh-modal-overlay.cdlh-visible #cdlh-modal-content { /* Animate in */
            transform: scale(1);
            opacity: 1;
        }
        #cdlh-modal-content h3 {
             margin-top: 0; margin-bottom: 15px; color: #333; font-size: 1.3em;
        }
         #cdlh-modal-content p {
             margin-bottom: 20px; color: #555; font-size: 0.95em; word-break: break-all;
         }
        #cdlh-modal-content button {
            display: block; width: 100%; padding: 12px 20px; margin: 10px 0;
            border: none; border-radius: 5px; background-color: #007bff;
            color: white; font-size: 16px; cursor: pointer;
            transition: background-color 0.2s ease, transform 0.1s ease;
        }
        #cdlh-modal-content button:hover {
            background-color: #0056b3; transform: translateY(-1px);
        }
         #cdlh-modal-content button.cdlh-cancel { background-color: #6c757d; }
         #cdlh-modal-content button.cdlh-cancel:hover { background-color: #5a6268; }
    `);

    // --- Functions ---

    /**
     * Cleans link text, removing interfering characters and emojis.
     * Also trims trailing punctuation.
     * @param {string} text - Original text.
     * @returns {string|null} Cleaned text, or null if invalid.
     */
    function cleanLink(text) {
        if (!text) return null;

        // Preserve the full URL structure if present initially
        let prefix = '';
        const httpMatch = text.match(/^https?:\/\/[^\/]+\//);
        if (httpMatch) {
            prefix = httpMatch[0];
            text = text.substring(prefix.length); // Process only the path part
        }

        // Find the core /s/ part first
        const sIndex = text.indexOf('/s/');
        if (sIndex === -1) return null; // Must contain /s/
        let corePart = text.substring(sIndex);

        // 1. Remove bracketed content: [开心], 【abc】
        let cleaned = corePart.replace(/[\[【][^\]】]*[\]】]/g, '');
        // 2. Remove common interfering words/chars: 删, 插, etc. (Keep spaces for now, handle later)
        cleaned = cleaned.replace(/[删插]/g, '');
        // 3. Remove standard emojis (Unicode ranges)
        cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/ug, '');
        // 4. Remove potential invisible characters
        cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
        // 5. Remove excess whitespace within the link path/query (tricky, be conservative)
        // Example: collapse multiple spaces, trim spaces around ? & =
        cleaned = cleaned.replace(/\s+/g, ''); // Aggressively remove all spaces for now

        // 6. Trim trailing punctuation (do this *after* potential query params are processed)
        cleaned = cleaned.replace(/[.,!?;:]+$/, '');

        // 7. Basic validation
        if (!cleaned.startsWith('/s/') || cleaned.length <= 3 || !/^\/s\/[a-zA-Z0-9]/.test(cleaned)) {
             console.warn(`[网盘助手] Cleaning resulted in invalid link: ${cleaned}`);
             return null;
        }

        // Re-attach prefix if it existed (though cleaning is mainly for partial links)
        // For simplicity, if prefix exists, we usually skip cleaning.
        // This function is now primarily for cleaning *partial* links found by the regex.
        return cleaned;
    }

    /**
     * Parses the cleaned link to extract path, code, and potential provider hint.
     * @param {string} cleanedLink - Cleaned link text (should start with /s/).
     * @returns {{path: string|null, code: string|null, providerHint: string|null}}
     */
    function parseLink(cleanedLink) {
        let path = null;
        let code = null;
        let providerHint = null;

        if (!cleanedLink || !cleanedLink.startsWith('/s/')) {
            return { path, code, providerHint };
        }

        // Try Baidu format: /s/<code>?pwd=<pass> (4位密码)
        let match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9_-]+)\?pwd=([a-zA-Z0-9]{4})$/);
        if (match) {
            providerHint = 'baidu';
            path = match[1];
            code = match[2];
            console.log(`[网盘助手] 解析为百度格式: Path=${path}, Code=${code}`);
            return { path, code, providerHint };
        }

        // Try 123Pan format: /s/<id>-<pass> - REMOVED HINT, now prompts
        match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9]+)-([a-zA-Z0-9]+)$/);
        if (match) {
            // providerHint = 'pan123'; // REMOVED: Don't assume, prompt user
            path = match[1];
            code = match[2]; // Still extract code if present
            console.log(`[网盘助手] 解析为 '-' 格式 (无提示): Path=${path}, Code=${code}`);
            return { path, code, providerHint }; // providerHint is null
        }

        // Try extraction code keyword format: /s/<id> 提取码:<pass> (或其他关键字)
        match = cleanedLink.match(/^(\/s\/[a-zA-Z0-9_\-]+)[\s\?\&]*(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*([a-zA-Z0-9]{4,})/i);
        if (match) {
            // Avoid double matching Baidu's ?pwd=
            if (!cleanedLink.includes('?pwd=')) {
                // providerHint = 'pan123'; // REMOVED: Don't assume, prompt user
                path = match[1];
                code = match[2]; // Still extract code
                console.log(`[网盘助手] 解析为关键字提取码格式 (无提示): Path=${path}, Code=${code}`);
                return { path, code, providerHint }; // providerHint is null
            }
        }

        // If no specific format matched, treat the whole cleaned link as path
        path = cleanedLink.replace(/[\s\?\&]*(?:提取码|密码|口令|code|pwd)\s*[:：]?\s*[a-zA-Z0-9]{4,}.*$/i, '');
        // Ensure path is still valid after potential code removal
        if (path && path.startsWith('/s/') && path.length > 3) {
             console.log(`[网盘助手] 解析为通用路径: Path=${path}`);
             return { path, code, providerHint }; // code and hint are null
        } else {
             console.log(`[网盘助手] 解析失败或路径无效: ${cleanedLink}`);
             return { path: null, code: null, providerHint: null }; // Invalid path
        }
    }

    /**
     * Shows the provider selection dialog with animation.
     * @param {string} cleanedPath - Cleaned link path.
     * @param {string|null} potentialCode - Possible extraction code.
     * @param {string} originalText - Original matched text.
     */
    function showProviderPrompt(cleanedPath, potentialCode, originalText) {
        const existingOverlay = document.getElementById('cdlh-modal-overlay');
        if (existingOverlay) {
            existingOverlay.remove(); // Remove previous modal if any
        }

        const overlay = document.createElement('div');
        overlay.id = 'cdlh-modal-overlay';

        const content = document.createElement('div');
        content.id = 'cdlh-modal-content';
        // Display original text for context, along with parsed parts
        content.innerHTML = `<h3>选择网盘提供商 (Select Provider)</h3><p>检测到链接 (Detected Link):<br><code style="font-size: 0.9em;">${originalText}</code><br>解析路径 (Parsed Path): ${cleanedPath}${potentialCode ? '<br>提取码 (Code): ' + potentialCode : ''}</p>`;

        for (const key in providers) {
            const provider = providers[key];
            const btn = document.createElement('button');
            btn.textContent = provider.name;
            btn.onclick = (e) => {
                e.stopPropagation();
                handleSelection(key, cleanedPath, potentialCode);
                hideModal(overlay); // Use hide function for animation
            };
            content.appendChild(btn);
        }

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消 (Cancel)';
        cancelBtn.className = 'cdlh-cancel';
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            hideModal(overlay); // Use hide function for animation
        };
        content.appendChild(cancelBtn);

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // Add class to trigger animation after element is added to DOM
        requestAnimationFrame(() => {
             overlay.classList.add('cdlh-visible');
        });


        // Click outside to close
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                hideModal(overlay); // Use hide function for animation
            }
        });
    }

    /**
     * Hides the modal with animation and removes it.
     * @param {HTMLElement} overlay - The modal overlay element.
     */
     function hideModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('cdlh-visible');
        // Remove the element after the transition completes
        overlay.addEventListener('transitionend', () => {
             if (overlay.parentNode) {
                 overlay.remove();
             }
        }, { once: true }); // Ensure listener is removed after firing once
     }


    /**
     * Handles the user's selection or automatic determination, builds URL, and navigates.
     * @param {string} providerKey - Key name from the providers object.
     * @param {string} path - Cleaned link path.
     * @param {string|null} code - Extraction code.
     */
    function handleSelection(providerKey, path, code) {
        const provider = providers[providerKey];
        if (!provider || !path) {
            console.error('[网盘助手] Error handling selection: Invalid provider or path', providerKey, path);
            return;
        }

        let finalUrl = provider.domain + path;

        // Special handling for Baidu Pan's pwd parameter
        if (providerKey === 'baidu' && code && code.length === provider.pwdLength) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${provider.pwdParam}=${code}`;
        }
        // No special URL building for other providers' codes currently

        console.log(`[网盘助手] Selected: ${provider.name}, Path: ${path}, Code: ${code || 'None'}, Final URL: ${finalUrl}`);

        if (code) {
            try {
                GM_setClipboard(code, 'text');
                GM_notification({
                    text: `提取码 "${code}" 已复制到剪贴板 (Code "${code}" copied to clipboard)`,
                    title: '网盘助手 (Link Helper)',
                    timeout: 4000
                });
                console.log(`[网盘助手] Extraction code "${code}" copied`);
            } catch (err) {
                console.error('[网盘助手] Failed to copy code to clipboard:', err);
                alert(`提取码 "${code}" 复制失败，请手动复制。\n(Failed to copy code "${code}", please copy manually.)`);
            }
        } else {
            console.log(`[网盘助手] No extraction code found or needed for this link`);
        }

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

        potentialLinkRegex.lastIndex = 0; // Reset regex state

        while ((match = potentialLinkRegex.exec(content)) !== null) {
            const originalMatch = match[1] || match[0]; // Group 1 is the link, fallback to full match if group 1 fails (shouldn't happen often)
            const standaloneCodeMatch = match[2] && match[3] ? { id: match[2], code: match[3] } : null; // Check groups for standalone code

            console.log(`[网盘助手] Regex Match: `, match);
            console.log(`[网盘助手] Original Match Text: "${originalMatch}"`, `Standalone Code Match:`, standaloneCodeMatch);

            // Add text before the match
            fragment.appendChild(document.createTextNode(content.substring(lastIndex, match.index)));

            if (originalMatch && originalMatch.includes('/s/')) { // Process link match (Group 1)
                foundMatch = true;
                const isFullUrl = originalMatch.startsWith('http');
                const cleanedOriginal = originalMatch.replace(/[.,!?;:]+$/, ''); // Trim trailing punctuation for display/linking

                if (isFullUrl) {
                    // Handle full URL: direct link, no cleaning/parsing needed
                    console.log(`[网盘助手] Found full URL: ${cleanedOriginal}`);
                    const a = document.createElement('a');
                    a.href = cleanedOriginal;
                    a.textContent = originalMatch; // Show the original text including punctuation if user wants to see context
                    a.className = fullUrlSelectorClass; // Use specific class for full URLs
                    a.title = `点击直接打开链接 (Click to open link directly)`;
                    a.target = '_blank'; // Open in new tab
                    a.rel = 'noopener noreferrer';
                    fragment.appendChild(a);
                } else {
                    // Handle partial URL: needs cleaning and parsing
                    console.log(`[网盘助手] Found partial link: ${originalMatch}`);
                    const cleaned = cleanLink(originalMatch); // Clean the partial link aggressively
                    console.log(`[网盘助手] Cleaned partial link: "${cleaned}"`);

                    if (cleaned) {
                        const { path: parsedPath, code: parsedCode, providerHint } = parseLink(cleaned);
                        console.log(`[网盘助手] Parsed partial link - Path: ${parsedPath}, Code: ${parsedCode}, Hint: ${providerHint}`);

                        if (parsedPath) {
                            const span = document.createElement('span');
                            span.className = linkSelectorClass;
                            span.textContent = originalMatch; // Show original messy text
                            span.title = `点击处理链接 (Click to process link): ${cleaned}`;

                            span.dataset.cleanedPath = parsedPath;
                            if (parsedCode) span.dataset.potentialCode = parsedCode;
                            // No hint is stored now, always prompt for partial links unless Baidu format detected in parseLink
                            span.dataset.originalText = originalMatch;

                            span.onclick = (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const path = e.target.dataset.cleanedPath;
                                const code = e.target.dataset.potentialCode;
                                const original = e.target.dataset.originalText;
                                console.log(`[网盘助手] Click event (Partial) - Path: ${path}, Code: ${code}`);

                                // Check if Baidu format was detected during parsing
                                if (parseLink(cleaned).providerHint === 'baidu') {
                                     handleSelection('baidu', path, code);
                                } else {
                                     // Always prompt for other partial links
                                     showProviderPrompt(path, code, original);
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
            } else if (standaloneCodeMatch) {
                 // Handle standalone code match (Group 2 & 3) - currently just skips, no special highlighting
                 // Future improvement: could highlight these and offer to copy code?
                 console.log(`[网盘助手] Found standalone code pattern, skipping highlighting for now:`, standaloneCodeMatch);
                 fragment.appendChild(document.createTextNode(originalMatch)); // Append the original text back
            }
             else {
                 // Append text that didn't match any pattern
                 fragment.appendChild(document.createTextNode(originalMatch));
            }

            lastIndex = potentialLinkRegex.lastIndex;
        }

        if (lastIndex < content.length) {
            fragment.appendChild(document.createTextNode(content.substring(lastIndex)));
        }

        if (foundMatch) {
            node.parentNode.replaceChild(fragment, node);
        }
    }

    // --- Main Execution ---
    console.log('[网盘助手] Script starting (v1.2)...');

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                const parent = node.parentNode;
                if (parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE' ||
                    parent.nodeName === 'TEXTAREA' || parent.nodeName === 'INPUT' ||
                    parent.isContentEditable || parent.closest('[contenteditable="true"]') ||
                    parent.closest(`.${linkSelectorClass}, .${fullUrlSelectorClass}`) // Avoid reprocessing
                   ) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Test if node contains '/s/' or common code keywords
                if (/\/s\/|提取码|密码|口令|code|pwd/i.test(node.nodeValue)) {
                     return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        }
    );

    const nodesToProcess = [];
    let currentNode;
    while (currentNode = walker.nextNode()) {
        nodesToProcess.push(currentNode);
    }

    console.log(`[网盘助手] Found ${nodesToProcess.length} potential text nodes to process.`);
    nodesToProcess.forEach(processNode);

    console.log('[网盘助手] Script finished processing (v1.2).');

})();
