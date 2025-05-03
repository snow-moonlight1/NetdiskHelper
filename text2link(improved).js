// ==UserScript==
// @name             Textlink to Hyperlink (Improved)
// @name:zh-CN       文本链接自动识别为超链接 (改进版)
// @version          0.2.1
// @description      Recognize links in text by regular expression, and convert to hyperlinks using safe DOM manipulation.
// @description:zh-CN 通过正则表达式识别文本中的链接，并使用安全的DOM操作转换为超链接。
// @author           DreamNya (Improved by Gemini)
// @match            *://*/*
// @grant            none
// @run-at           document-idle // Run after page is mostly loaded
// @license          MIT
// @namespace        https://greasyfork.org/users/809466
// @downloadURL      https://update.greasyfork.org/scripts/452150/Textlink%20to%20Hyperlink.user.js // Consider updating version in URL if re-uploading
// @updateURL        https://update.greasyfork.org/scripts/452150/Textlink%20to%20Hyperlink.meta.js // Consider updating version in URL if re-uploading
// ==/UserScript==

(function() {
    'use strict';

    // Text link recognition regex (slightly improved character set for path/query/fragment)
    // Allows more common characters found in URLs like Baidu Pan, Quark Pan links etc.
    const urlRegex = /https?:\/\/[\w.-]+\.\w+(?::\d{1,5})?(?:\/[#%&?./=\w\-@+,;!*'()]*)?/g;

    // Ignored tag names (uppercase) - Avoid processing links within these tags
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'A', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'TITLE', 'PRE', 'BUTTON', 'INPUT', 'SELECT']);

    // Keep track of processed text nodes within a mutation cycle to avoid potential loops with observers
    // Using a WeakSet helps with garbage collection if nodes are removed
    const processedNodes = new WeakSet();

    function createHyperlink(url) {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url; // Display the URL as the link text by default
        a.target = '_blank'; // Open in new tab
        a.style.wordBreak = 'break-all'; // Help prevent long URLs from breaking layout
        // Add rel="noopener noreferrer" for security when using target="_blank"
        a.rel = 'noopener noreferrer';

        // === 添加下面这行来设置颜色 ===
        a.style.color = '#55aaff'; // 设置为淡蓝色 (你可以根据喜好调整色值)
        // 或者使用名字: a.style.color = 'deepskyblue';

        return a;
    }

    function processTextNode(node) {
        // Skip if already processed in this cycle or not a text node
        if (processedNodes.has(node) || node.nodeType !== Node.TEXT_NODE) {
            return;
        }

        // Check parent hierarchy: ignore if inside ignored tags or contenteditable
        let parent = node.parentNode;
        if (!parent) return; // Node is detached

        while (parent && parent !== document.body) {
             // Check nodeName and if element is editable
            if (ignoredTags.has(parent.nodeName) || parent.isContentEditable) {
                return; // Skip this text node
            }
            parent = parent.parentNode;
        }
         // Ensure parent traversal completed successfully up to body or document root
        if (!parent) return;

        const text = node.nodeValue;
        urlRegex.lastIndex = 0; // Reset regex state before each use
        let match;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let foundLink = false;

        while ((match = urlRegex.exec(text)) !== null) {
            foundLink = true;
            const url = match[0];
            const matchIndex = match.index;

            // Add text before the match (if any)
            if (matchIndex > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
            }

            // Create and add the hyperlink
            fragment.appendChild(createHyperlink(url));

            lastIndex = urlRegex.lastIndex;
        }

        // If links were found, replace the original text node with the fragment
        if (foundLink) {
            // Add any remaining text after the last match
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }

            // Replace the original node with the fragment containing text and links
            node.parentNode.replaceChild(fragment, node);

            // Mark the original node as processed (though it's now removed, helps if observer picks it up before removal)
             processedNodes.add(node);

        } else {
            // Mark as processed even if no link found, to avoid re-checking static text frequently
            processedNodes.add(node);
        }
    }

    function scanForLinks(rootNode) {
        // Use TreeWalker for efficient iteration over text nodes only
        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT, // Only consider text nodes
            null, // No custom filter logic needed here
            false // Does not expand entity references
        );

        let node;
        // Collect nodes first, then process. Avoids issues if DOM changes during iteration.
        const nodesToProcess = [];
        while (node = walker.nextNode()) {
           nodesToProcess.push(node);
        }

        // Process collected nodes
        nodesToProcess.forEach(processTextNode);
    }

    // Initial scan when the document is idle
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        scanForLinks(document.body);
    } else {
        document.addEventListener('DOMContentLoaded', () => scanForLinks(document.body), { once: true });
    }


    // Observe mutations to handle dynamically added content
    const observer = new MutationObserver(mutations => {
        // Use a Set to efficiently track nodes needing scanning from this batch of mutations
        const nodesToScan = new Set();

        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(newNode => {
                    // If the new node itself is a text node, process it directly
                    if (newNode.nodeType === Node.TEXT_NODE) {
                       processTextNode(newNode); // Direct processing attempt
                    }
                    // If the new node is an element, add it to the set to scan its descendants
                    else if (newNode.nodeType === Node.ELEMENT_NODE) {
                       // Check if the element itself should be ignored
                        let tempParent = newNode;
                        let ignoreSubtree = false;
                        while(tempParent && tempParent !== document.body) {
                           if(ignoredTags.has(tempParent.nodeName) || tempParent.isContentEditable) {
                              ignoreSubtree = true;
                              break;
                           }
                           tempParent = tempParent.parentNode;
                        }
                        if (!ignoreSubtree && newNode.parentNode) { // Ensure it's connected and not ignored
                           nodesToScan.add(newNode);
                        }
                    }
                });
            }
            // Optional: Handle direct text changes if necessary
            // else if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
            //     processTextNode(mutation.target);
            // }
        });

        // Scan the unique elements that were added
        nodesToScan.forEach(node => scanForLinks(node));

        // Clear the processed set after each mutation batch handling is complete
        // Note: This WeakSet approach might need refinement depending on interaction complexity.
        // If issues persist, a different strategy (e.g., adding a data-attribute) might be needed.
        // For now, clearing per batch assumes nodes processed are stable until next mutation.
        // Re-introduce processedNodes clearing if needed, but start without it.
        // processedNodes = new WeakSet(); // Reset for next mutation cycle if causing issues
    });

    // Start observing the body for additions and subtree modifications
     if (document.body) {
      observer.observe(document.body, {
          childList: true, // Watch for added/removed nodes
          subtree: true// Watch descendants
          // characterData: true // Add if needed to detect changes within existing text nodes
      });
     } else {
       // Fallback if body isn't available yet (though document-idle should prevent this)
       document.addEventListener('DOMContentLoaded', () => {
         observer.observe(document.body, { childList: true, subtree: true });
       }, { once: true });
     }


    // Optional: Cleanup observer on page unload (useful in SPAs or if script needs manual stopping)
    // window.addEventListener('unload', () => observer.disconnect());

})();