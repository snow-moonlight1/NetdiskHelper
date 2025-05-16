// ==UserScript==
// @name              网盘智能识别助手,文本链接自动识别为超链接
// @namespace         https://github.com/syhyz1990/panAI
// @version           2.2.3
// @author            YouXiaoHou,52fisher,DreamNya(Improved by Gemini)
// @description       智能识别选中文字中的🔗网盘链接和🔑提取码，通过正则表达式识别文本中的链接，并转换为超链接
// @license           AGPL-3.0-or-later
// @supportURL        https://github.com/syhyz1990/panAI
// @supportURL        https://greasyfork.org/zh-CN/scripts/452150-textlink-to-hyperlink
// @match             *://*/*
// @require           https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.min.js
// @require           https://unpkg.com/hotkeys-js@3.13.3/dist/hotkeys.min.js
// @resource          swalStyle https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.min.css
// @run-at            document-idle
// @grant             GM_openInTab
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_registerMenuCommand
// @grant             GM_getResourceText
// @grant             GM_info
// ==/UserScript==

(function () {
    'use strict';

    const customClass = {
        container: 'panai-container',
        popup: 'panai-popup',
    };

    
    let toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: false,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    let util = {
        clog(c) {
            console.group("%c %c [网盘智能识别助手]", `background:url(${GM_info.script.icon}) center center no-repeat;background-size:12px;padding:3px`, "");
            console.log(c);
            console.groupEnd();
        },

        parseQuery(name) {
            let reg = new RegExp(`(?<=(?:${name})\\=)(?:wss:[a-zA-Z0-9]+|[\\w-]+)`, "i")
            let pd = location.href.replace(/%3A/g, ":").match(reg);
            if (pd) {
                return pd[0];
            }
            return null;
        },

        getValue(name) {
            return GM_getValue(name);
        },

        setValue(name, value) {
            GM_setValue(name, value);
        },

        sleep(time) {
            return new Promise((resolve) => setTimeout(resolve, time));
        },

        addStyle(id, tag, css) {
            tag = tag || 'style';
            let doc = document, styleDom = doc.getElementById(id);
            if (styleDom) return;
            let style = doc.createElement(tag);
            style.rel = 'stylesheet';
            style.id = id;
            tag === 'style' ? style.innerHTML = css : style.href = css;
            document.head.appendChild(style);
        },

        isHidden(el) {
            try {
                return el.offsetParent === null;
            } catch (e) {
                return false;
            }
        },

        isMobile: (() => !!navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone|HarmonyOS|MicroMessenger)/i))(),

        query(selector) {
            if (Array.isArray(selector)) {
                let obj = null;
                for (let i = 0; i < selector.length; i++) {
                    let o = document.querySelector(selector[i]);
                    if (o) {
                        obj = o;
                        break;
                    }
                }
                return obj;
            }
            return document.querySelector(selector);
        }
    };

    let opt = {
        'baidu': {
            reg: /((?:https?:\/\/)?(?:e?yun|pan)\.baidu\.com\/(doc\/|enterprise\/)?(?:s\/[\w~]*(((-)?\w*)*)?|share\/\S{4,}))/,
            host: /(pan|e?yun)\.baidu\.com/,
            input: ['#accessCode', '.share-access-code', '#wpdoc-share-page > .u-dialog__wrapper .u-input__inner'],
            button: ['#submitBtn', '.share-access .g-button', '#wpdoc-share-page > .u-dialog__wrapper .u-btn--primary'],
            name: '百度网盘',
            storage: 'hash'
        },
        'aliyun': {
            reg: /((?:https?:\/\/)?(?:(?:www\.)?(?:aliyundrive|alipan)\.com\/s|alywp\.net)\/[a-zA-Z\d]+)/,
            host: /www\.(aliyundrive|alipan)\.com|alywp\.net/,
            input: ['form .ant-input', 'form input[type="text"]', 'input[name="pwd"]'],
            button: ['form .button--fep7l', 'form button[type="submit"]'],
            name: '阿里云盘',
            storage: 'hash'
        },
        'weiyun': {
            reg: /((?:https?:\/\/)?share\.weiyun\.com\/[a-zA-Z\d]+)/,
            host: /share\.weiyun\.com/,
            input: ['.mod-card-s input[type=password]', 'input.pw-input'],
            button: ['.mod-card-s .btn-main', ".pw-btn-wrap button.btn"],
            name: '微云',
            storage: 'hash'
        },
        'lanzou': {
            reg: /((?:https?:\/\/)?(?:[a-zA-Z0-9\-.]+)?(?:lanzou[a-z]|lanzn)\.com\/[a-zA-Z\d_\-]+(?:\/[\w-]+)?)/,
            host: /(?:[a-zA-Z\d-.]+)?(?:lanzou[a-z]|lanzn)\.com/,
            input: ['#pwd'],
            button: ['.passwddiv-btn', '#sub'],
            name: '蓝奏云',
            storage: 'hash'
        },
        'tianyi': {
            reg: /((?:https?:\/\/)?cloud\.189\.cn\/(?:t\/|web\/share\?code=)?[a-zA-Z\d]+)/,
            host: /cloud\.189\.cn/,
            input: ['.access-code-item #code_txt', "input.access-code-input"],
            button: ['.access-code-item .visit', ".button"],
            name: '天翼云盘',
            storage: (() => util.isMobile === true ? 'local' : 'hash')(),
            storagePwdName: 'tmp_tianyi_pwd'
        },
        'caiyun': {
            reg: /((?:https?:\/\/)?caiyun\.139\.com\/(?:m\/i|w\/i\/|web\/|front\/#\/detail)\??(?:linkID=)?[a-zA-Z\d]+)/,
            host: /(?:cai)?yun\.139\.com/,
            input: ['.token-form input[type=text]'],
            button: ['.token-form .btn-token'],
            name: '移动云盘',
            storage: 'local',
            storagePwdName: 'tmp_caiyun_pwd'
        },
        'xunlei': {
            reg: /((?:https?:\/\/)?pan\.xunlei\.com\/s\/[\w-]{10,})/,
            host: /pan\.xunlei\.com/,
            input: ['.pass-input-wrap .td-input__inner'],
            button: ['.pass-input-wrap .td-button'],
            name: '迅雷云盘',
            storage: 'hash'
        },
        '123pan': {
            reg: /((?:https?:\/\/)?www\.123pan\.com\/s\/[\w-]{6,})/,
            host: /www\.123pan\.com/,
            input: ['.ca-fot input', ".appinput .appinput"],
            button: ['.ca-fot button', ".appinput button"],
            name: '123云盘',
            storage: 'hash'
        },
        '360': {
            reg: /((?:https?:\/\/)?(?:[a-zA-Z\d\-.]+)?(?:yunpan\.360\.cn|yunpan\.com)(\/lk)?\/surl_\w{6,})/,
            host: /[\w.]+?yunpan\.com/,
            input: ['.pwd-input'],
            button: ['.submit-btn'],
            name: '360云盘',
            storage: 'local',
            storagePwdName: 'tmp_360_pwd'
        },
        '115': {
            reg: /((?:https?:\/\/)?115\.com\/s\/[a-zA-Z\d]+)/,
            host: /115\.com/,
            input: ['.form-decode input'],
            button: ['.form-decode .submit a'],
            name: '115网盘',
            storage: 'hash'
        },
        'cowtransfer': {
            reg: /((?:https?:\/\/)?(?:[a-zA-Z\d-.]+)?cowtransfer\.com\/s\/[a-zA-Z\d]+)/,
            host: /(?:[a-zA-Z\d-.]+)?cowtransfer\.com/,
            input: ['.receive-code-input input'],
            button: ['.open-button'],
            name: '奶牛快传',
            storage: 'hash'
        },
        'ctfile': {
            reg: /((?:https?:\/\/)?(?:[a-zA-Z\d-.]+)?(?:ctfile|545c|u062|ghpym)\.com\/\w+\/[a-zA-Z\d-]+)/,
            host: /(?:[a-zA-Z\d-.]+)?(?:ctfile|545c|u062)\.com/,
            input: ['#passcode'],
            button: ['.card-body button'],
            name: '城通网盘',
            storage: 'hash'
        },
        'quark': {
            reg: /((?:https?:\/\/)?pan\.quark\.cn\/s\/[a-zA-Z\d-]+)/,
            host: /pan\.quark\.cn/,
            input: ['.ant-input'],
            button: ['.ant-btn-primary'],
            name: '夸克网盘',
            storage: 'local',
            storagePwdName: 'tmp_quark_pwd'
        },
        'vdisk': {
            reg: /(?:https?:\/\/)?vdisk.weibo.com\/lc\/\w+/,
            host: /vdisk\.weibo\.com/,
            input: ['#keypass', "#access_code"],
            button: ['.search_btn_wrap a', "#linkcommon_btn"],
            name: '微盘',
            storage: 'hash',
        },
        'wenshushu': {
            reg: /((?:https?:\/\/)?(?:www\.wenshushu|ws28)\.cn\/(?:k|box|f)\/\w+)/,
            host: /www\.wenshushu\.cn/,
            input: ['.pwd-inp .ivu-input'],
            button: ['.pwd-inp .ivu-btn'],
            name: '文叔叔网盘',
            storage: 'hash'
        },
        'uc': {
            reg: /(?:https?:\/\/)?drive\.uc\.cn\/s\/[a-zA-Z\d]+/,
            host: /drive\.uc\.cn/,
            input: ["input[class*='ShareReceivePC--input']", '.input-wrap input'],
            button: ["button[class*='ShareReceivePC--submit-btn'", '.input-wrap button'],
            name: 'UC云盘',
            storage: 'hash'
        },
        'jianguoyun': {
            reg: /((?:https?:\/\/)?www\.jianguoyun\.com\/p\/[\w-]+)/,
            host: /www\.jianguoyun\.com/,
            input: ['input[type=password]'],
            button: ['.ok-button', '.confirm-button'],
            name: '坚果云',
            storage: 'hash'
        },
        'wo': {
            reg: /(?:https?:\/\/)?pan\.wo\.cn\/s\/[\w_]+/,
            host: /(pan\.wo\.cn|panservice\.mail\.wo\.cn)/,
            input: ['input.el-input__inner', ".van-field__control"],
            button: ['.s-button', ".share-code button"],
            name: '联通云盘',
            storage: (() => util.isMobile === true ? 'local' : 'hash')(),
            storagePwdName: 'tmp_wo_pwd'
        },
        'mega': {
            reg: /((?:https?:\/\/)?(?:mega\.nz|mega\.co\.nz)\/#F?![\w!-]+)/,
            host: /(?:mega\.nz|mega\.co\.nz)/,
            input: ['.dlkey-dialog input'],
            button: ['.dlkey-dialog .fm-dialog-new-folder-button'],
            name: 'Mega',
            storage: 'local'
        },
        '520vip': {
            reg: /((?:https?:\/\/)?www\.(?:520-vip|eos-53)\.com\/file-\d+\.html)/,
            host: /www\.520-vip\.com/,
            name: '520云盘',
        },
        '567pan': {
            reg: /((?:https?:\/\/)?www\.567(?:pan|yun|file|inc)\.(?:com|cn)\/file-\d+\.html)/,
            host: /www\.567inc\.cn/,
            name: '567盘',
            replaceHost: "www.567inc.com",
        },
        'ayunpan': {
            reg: /((?:https?:\/\/)?www\.ayunpan\.com\/file-\d+\.html)/,
            host: /www\.ayunpan\.com/,
            name: 'AYunPan',
        },
        'iycdn.com': {
            reg: /((?:https?:\/\/)?www\.iycdn\.com\/file-\d+\.html)/,
            host: /www\.iycdn\.com/,
            name: '爱优网盘',
        },
        'feimaoyun': {
            reg: /((?:https?:\/\/)?www\.feimaoyun\.com\/s\/[0-9a-zA-Z]+)/,
            host: /www\.feimaoyun\.com/,
            name: '飞猫盘',
        },
        'uyunp.com': {
            reg: /((?:https?:\/\/)?download\.uyunp\.com\/share\/s\/short\/\?surl=[0-9a-zA-Z]+)/,
            host: /download\.uyunp\.com/,
            name: '优云下载',
        },
        'dudujb': {
            reg: /(?:https?:\/\/)?www\.dudujb\.com\/file-\d+\.html/,
            host: /www\.dudujb\.com/,
            name: '贵族网盘',
        },
        'xunniu': {
            reg: /(?:https?:\/\/)?www\.xunniu(?:fxp|wp|fx)\.com\/file-\d+\.html/,
            host: /www\.xunniuwp\.com/,
            name: '迅牛网盘',
        },
        'xueqiupan': {
            reg: /(?:https?:\/\/)?www\.xueqiupan\.com\/file-\d+\.html/,
            host: /www\.xueqiupan\.com/,
            name: '雪球云盘',
        },
        '77file': {
            reg: /(?:https?:\/\/)?www\.77file\.com\/s\/[a-zA-Z\d]+/,
            host: /www\.77file\.com/,
            name: '77file',
        },
        'ownfile': {
            reg: /(?:https?:\/\/)?ownfile\.net\/files\/[a-zA-Z\d]+\.html/,
            host: /ownfile\.net/,
            name: 'OwnFile',
        },
        'feiyunfile': {
            reg: /(?:https?:\/\/)?www\.feiyunfile\.com\/file\/[\w=]+\.html/,
            host: /www\.feiyunfile\.com/,
            name: '飞云网盘',
        },
        'yifile': {
            reg: /(?:https?:\/\/)?www\.yifile\.com\/f\/\w+/,
            host: /www\.yifile\.com/,
            name: 'YiFile',
        },
        'dufile': {
            reg: /(?:https?:\/\/)?dufile\.com\/file\/\w+\.html/,
            host: /dufile\.com/,
            name: 'duFile',
        },
        'flowus': {
            reg: /((?:https?:\/\/)?flowus\.cn\/[\S ^\/]*\/?share\/[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12})/,
            host: /flowus\.cn/,
            name: 'FlowUs息流',
            storage: 'hash'
        },
        'chrome': {
            reg: /^https?:\/\/chrome.google.com\/webstore\/.+?\/([a-z]{32})(?=[\/#?]|$)/,
            host: /chrome\.google\.com/,
            replaceHost: "chrome.crxsoso.com",
            name: 'Chrome商店',
        },
        'edge': {
            reg: /^https?:\/\/microsoftedge.microsoft.com\/addons\/.+?\/([a-z]{32})(?=[\/#?]|$)/,
            host: /microsoftedge\.microsoft\.com/,
            replaceHost: "microsoftedge.crxsoso.com",
            name: 'Edge商店',
        },
        'firefox': {
            reg: /^https?:\/\/(reviewers\.)?(addons\.mozilla\.org|addons(?:-dev)?\.allizom\.org)\/.*?(?:addon|review)\/([^/<>"'?#]+)/,
            host: /addons\.mozilla\.org/,
            replaceHost: "addons.crxsoso.com",
            name: 'Firefox商店',
        },
        'microsoft': {
            reg: /^https?:\/\/(?:apps|www).microsoft.com\/(?:store|p)\/.+?\/([a-zA-Z\d]{10,})(?=[\/#?]|$)/,
            host: /(apps|www)\.microsoft\.com/,
            replaceHost: "apps.crxsoso.com",
            name: 'Windows商店',
        }
    };

    let main = {
        lastText: "lorem&",

        //初始化配置数据
        initValue() {
            let value = [{
                name: 'setting_success_times',
                value: 0
            }, {
                name: 'setting_auto_click_btn',
                value: true
            }, {
                name: 'setting_active_in_front',
                value: true
            }, {
                name: 'setting_timer_open',
                value: false
            }, {
                name: 'setting_timer',
                value: 5000
            }, {
                name: 'setting_hotkeys',
                value: 'F1'
            }];

            value.forEach((v) => {
                if (util.getValue(v.name) === undefined) {
                    util.setValue(v.name, v.value);
                }
            });
        },

        // 监听选择事件
        addPageListener() {
            document.addEventListener("mouseup", this.smartIdentify.bind(this), true);
            document.addEventListener("keydown", this.pressKey.bind(this), true);
        },

        // ⚠️可能会增加时间⚠️ 如果有需要可以增加选项
        // 获取选择内容的HTML和文本(增加兼容性) 或 DOM（节点遍历）
        getSelectionHTML(selection, isDOM = false) {
            const testDiv = document.createElement("div");
            if (!selection.isCollapsed) {
                // Range 转 DocumentFragment
                const docFragment = selection.getRangeAt(0).cloneContents();
                testDiv.appendChild(docFragment);
            }
            // 拼接选中文本，增加兼容
            return isDOM ? testDiv : selection.toString();
        },

        smartIdentify(event, str = '') {
            let selection = window.getSelection();
            let text = str || this.getSelectionHTML(selection);
            if (text !== this.lastText && text !== '') { //选择相同文字或空不识别
                let start = performance.now();
                this.lastText = text;
                //util.clog(`当前选中文字：${text}`);
                let linkObj = this.parseLink(text);
                let link = linkObj.link;
                let name = linkObj.name;
                let pwd = this.parsePwd(text);
                if (!link) {
                    linkObj = this.parseParentLink(selection);
                    link = linkObj.link;
                    name = linkObj.name;
                }
                if (link) {
                    if (!/https?:\/\//.test(link)) {
                        link = 'https://' + link;
                    }
                    let end = performance.now();
                    let time = (end - start).toFixed(3);
                    util.clog(`文本识别结果：${name} 链接：${link} 密码：${pwd} 耗时：${time}毫秒`);
                    let option = {
                        toast: true,
                        showCancelButton: true,
                        position: 'top',
                        title: `发现<span style="color: #2778c4;margin: 0 5px;">${name}</span>链接`,
                        html: `<span style="font-size: 0.8em;">${!!pwd ? '密码：' + pwd : '是否打开？'}</span>`,
                        confirmButtonText: '打开',
                        cancelButtonText: '关闭',
                        customClass
                    };
                    if (util.getValue('setting_timer_open')) {
                        option.timer = util.getValue('setting_timer');
                        option.timerProgressBar = true;
                    }
                    util.setValue('setting_success_times', util.getValue('setting_success_times') + 1);

                    Swal.fire(option).then((res) => {
                        this.lastText = 'lorem&';
                        selection.empty();
                        if (res.isConfirmed || res.dismiss === 'timer') {
                            // 保存本地密码逻辑 (如果需要)
                            if (linkObj.storage == "local" && pwd) { // 仅当 pwd 存在时才保存
                                util.setValue(linkObj.storagePwdName, pwd);
                            }
                            let active = util.getValue('setting_active_in_front');
                        
                            // --- URL 构建逻辑修正 ---
                            let finalUrl = link; // 从 parseLink 获取的基础链接
                        
                            if (pwd) { // 如果 parsePwd 提取到了密码
                                // 检查 link 是否已包含此密码 (query 或 hash)
                                const cleanLinkBase = link.split('#')[0]; // 获取不带 hash 的部分
                                const linkQuery = link.split('?')[1]?.split('#')[0] || ''; // 获取查询参数部分
                                const linkHash = link.split('#')[1] || ''; // 获取 hash 部分
                        
                                let pwdFoundInLink = false;
                                // 检查 query (宽松匹配 pwd=xxx 或 p=xxx)
                                if (linkQuery) {
                                    const queryParams = new URLSearchParams(linkQuery);
                                    if (queryParams.get('pwd') === pwd || queryParams.get('p') === pwd) {
                                        pwdFoundInLink = true;
                                    }
                                }
                                // 检查 hash
                                if (!pwdFoundInLink && linkHash === pwd) {
                                    pwdFoundInLink = true;
                                }
                        
                                // 只有当密码 *未* 在链接中找到时，才附加 #pwd
                                if (!pwdFoundInLink) {
                                    finalUrl = cleanLinkBase + "#" + pwd; // 附加为 hash
                                }
                                // else: 密码已在链接中，直接使用 parseLink 的结果 (finalUrl = link)
                            }
                            // 如果 pwd 为空，则 finalUrl 就是原始的 link
                        
                            console.log("[PanAI smartIdentify] Opening URL:", finalUrl); // 调试日志
                            GM_openInTab(finalUrl, { active }); // 使用修正后的 finalUrl 打开
                            // --- URL 构建逻辑修正结束 ---
                        }
                    });
                }
            }
        },

        pressKey(event) {
            if (event.key === 'Enter') {
                let confirmBtn = document.querySelector('.panai-container .swal2-confirm');
                confirmBtn && confirmBtn.click();
            }
            if (event.key === 'Escape') {
                let cancelBtn = document.querySelector('.panai-container .swal2-cancel');
                cancelBtn && cancelBtn.click();
            }
        },

        addHotKey() {
            //获取设置中的快捷键
            let hotkey = util.getValue('setting_hotkeys');
            hotkeys(hotkey, (event, handler) => {
                event.preventDefault();
                this.showIdentifyBox();
            });
        },

        //正则解析网盘链接
        parseLink(text = '') {
            let obj = {name: '', link: '', storage: '', storagePwdName: ''};
            if (text) {
                try {
                    text = decodeURIComponent(text);
                } catch {
                }
                text = text.replace(/[点點]/g, '.');
                text = text.replace(/[\u4e00-\u9fa5()（）,\u200B，\uD83C-\uDBFF\uDC00-\uDFFF]/g, '');
                text = text.replace(/lanzous/g, 'lanzouw'); //修正lanzous打不开的问题
                for (let name in opt) {
                    let val = opt[name];
                    if (val.reg.test(text)) {
                        let matches = text.match(val.reg);
                        obj.name = val.name;
                        obj.link = matches[0];
                        obj.storage = val.storage;
                        obj.storagePwdName = val.storagePwdName || null;
                        if (val.replaceHost) {
                            obj.link = obj.link.replace(val.host, val.replaceHost);
                        }
                        return obj;
                    }
                }
            }
            return obj;
        },

        //正则解析超链接类型网盘链接
        parseParentLink(selection) {
            const dom = this.getSelectionHTML(selection, true).querySelector('*[href]');
            return this.parseLink(dom ? dom.href : "");
        },

        //正则解析提取码
        parsePwd(text) {
            text = text.replace(/\u200B/g, '').replace('%3A', ":");
            text = text.replace(/(?:本帖)?隐藏的?内容[：:]?/, "");
            let reg = /wss:[a-zA-Z0-9]+|(?<=\s*(?:密|提取|访问|訪問|key|password|pwd|#|\?p=)\s*[码碼]?\s*[：:=]?\s*)[a-zA-Z0-9]{3,8}/i;
            if (reg.test(text)) {
                let match = text.match(reg);
                return match[0];
            }
            return '';
        },

        //根据域名检测网盘类型
        panDetect() {
            let hostname = location.hostname;
            for (let name in opt) {
                let val = opt[name];
                if (val.host.test(hostname)) {
                    return name;
                }
            }
            return '';
        },

        //自动填写密码
        autoFillPassword() {
            let query = util.parseQuery('pwd|p');
            let hash = location.hash.slice(1).replace(/\W/g, "") //hash中可能存在密码，需要过滤掉非密码字符
            let pwd = query || hash;
            let panType = this.panDetect();
            for (let name in opt) {
                let val = opt[name];
                if (panType === name) {
                    if (val.storage === 'local') {
                        //当前local存储的密码不一定是当前链接的密码，用户可能通过url直接访问或者恢复页面，这样取出来的密码可能是其他链接的
                        //如果能从url中获取到密码，则应该优先使用url中获取的密码
                        //util.getValue查询不到key时，默认返回undefined，已经形成逻辑短路，此处赋空值无效也无需赋空值.详见https://github.com/syhyz1990/panAI/commit/efb6ff0c77972920b26617bb836a2e19dd14a749
                        pwd = pwd || util.getValue(val.storagePwdName);
                        pwd && this.doFillAction(val.input, val.button, pwd);
                    }
                    if (val.storage === 'hash') {
                        if (!/^(?:wss:[a-zA-Z\d]+|[a-zA-Z0-9]{3,8})$/.test(pwd)) { //过滤掉不正常的Hash
                            return;
                        }
                        pwd && this.doFillAction(val.input, val.button, pwd);
                    }
                }
            }
        },

        doFillAction(inputSelector, buttonSelector, pwd) {
            let maxTime = 10;
            let ins = setInterval(async () => {
                maxTime--;
                let input = util.query(inputSelector);
                let button = util.query(buttonSelector);
                if (input && !util.isHidden(input)) {
                    clearInterval(ins);
                    Swal.fire({
                        toast: true,
                        position: 'top',
                        showCancelButton: false,
                        showConfirmButton: false,
                        title: 'AI已识别到密码！正自动帮您填写',
                        icon: 'success',
                        timer: 2000,
                        customClass
                    });

                    let lastValue = input.value;
                    input.value = pwd;
                    //Vue & React 触发 input 事件
                    let event = new Event('input', {bubbles: true});
                    let tracker = input._valueTracker;
                    if (tracker) {
                        tracker.setValue(lastValue);
                    }
                    input.dispatchEvent(event);

                    if (util.getValue('setting_auto_click_btn')) {
                        await util.sleep(1000); //1秒后点击按钮
                        button.click();
                    }
                } else {
                    maxTime === 0 && clearInterval(ins);
                }
            }, 800);
        },

        //重置识别次数
        clearIdentifyTimes() {
            let res = Swal.fire({
                showCancelButton: true,
                title: '确定要重置识别次数吗？',
                icon: 'warning',
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                customClass
            }).then(res => {
                this.lastText = 'lorem&';
                if (res.isConfirmed) {
                    util.setValue('setting_success_times', 0);
                    history.go(0);
                }
            });
        },

        //识别输入框中的内容
        showIdentifyBox() {
            Swal.fire({
                title: '识别剪切板中文字',
                input: 'textarea',
                inputPlaceholder: '若选方式一，请按 Ctrl+V 粘贴要识别的文字',
                html: `<div style="font-size: 12px;color: #999;margin-bottom: 8px;text-align: center;">提示：在任意网页按下 <span style="font-weight: 700;">${util.getValue("setting_hotkeys")}</span> 键可快速打开本窗口。</div><div style="font-size: 14px;line-height: 22px;padding: 10px 0 5px;text-align: left;"><div style="font-size: 16px;margin-bottom: 8px;font-weight: 700;">支持以下两种方式：</div><div><b>方式一：</b>直接粘贴文字到输入框，点击“识别方框内容”按钮。</div><div><b>方式二：</b>点击“读取剪切板”按钮。<span style="color: #d14529;font-size: 12px;">会弹出“授予网站读取剪切板”权限，同意后会自动识别剪切板中的文字。</span></div></div>`,
                showCloseButton: false,
                showDenyButton: true,
                confirmButtonText: '识别方框内容',
                denyButtonText: '读取剪切板',
                customClass
            }).then(res => {
                if (res.isConfirmed) {
                    this.smartIdentify(null, res.value);
                }
                if (res.isDenied) {
                    navigator.clipboard.readText().then(text => {
                        this.smartIdentify(null, text);
                    }).catch(() => {
                        toast.fire({title: '读取剪切板失败，请先授权或手动粘贴后识别！', icon: 'error'});
                    });
                }
            });
        },

        //显示设置
        showSettingBox() {
            let html = `<div style="font-size: 1em;">
                              <label class="panai-setting-label">填写密码后自动提交<input type="checkbox" id="S-Auto" ${util.getValue('setting_auto_click_btn') ? 'checked' : ''} class="panai-setting-checkbox"></label>
                              <label class="panai-setting-label">前台打开网盘标签页<input type="checkbox" id="S-Active" ${util.getValue('setting_active_in_front') ? 'checked' : ''}
                              class="panai-setting-checkbox"></label>
                              <label class="panai-setting-label">倒计时结束自动打开<input type="checkbox" id="S-Timer-Open" ${util.getValue('setting_timer_open') ? 'checked' : ''} class="panai-setting-checkbox"></label>
                              <label class="panai-setting-label" id="Panai-Range-Wrapper" style="${util.getValue('setting_timer_open') ? '' : 'display: none'}"><span>倒计时 <span id="Timer-Value">（${util.getValue('setting_timer') / 1000}秒）</span></span><input type="range" id="S-Timer" min="0" max="10000" step="500" value="${util.getValue('setting_timer')}" style="width: 200px;"></label>
                              <label class="panai-setting-label">快捷键设置<input type="text" id="S-hotkeys" value="${util.getValue('setting_hotkeys')}" style="width: 100px;"></label> 
                            </div>`;
            Swal.fire({
                title: '识别助手配置',
                html,
                icon: 'info',
                showCloseButton: true,
                confirmButtonText: '保存',
                footer: '<div style="text-align: center;font-size: 1em;">点击查看 <a href="https://www.youxiaohou.com/tool/install-panai.html" target="_blank">使用说明</a>，助手免费开源，Powered by <a href="https://www.youxiaohou.com">油小猴</a></div>',
                customClass
            }).then((res) => {
                res.isConfirmed && history.go(0);
            });

            document.getElementById('S-Auto').addEventListener('change', (e) => {
                util.setValue('setting_auto_click_btn', e.target.checked);
            });
            document.getElementById('S-Active').addEventListener('change', (e) => {
                util.setValue('setting_active_in_front', e.target.checked);
            });
            document.getElementById('S-Timer-Open').addEventListener('change', (e) => {
                let rangeWrapper = document.getElementById('Panai-Range-Wrapper');
                e.target.checked ? rangeWrapper.style.display = 'flex' : rangeWrapper.style.display = 'none';
                util.setValue('setting_timer_open', e.target.checked);
            });
            document.getElementById('S-Timer').addEventListener('change', (e) => {
                util.setValue('setting_timer', e.target.value);
                document.getElementById('Timer-Value').innerText = `（${e.target.value / 1000}秒）`;
            });
            document.getElementById('S-hotkeys').addEventListener('change', (e) => {
                util.setValue('setting_hotkeys', e.target.value);
            });
        },

        registerMenuCommand() {
            GM_registerMenuCommand('👀 已识别：' + util.getValue('setting_success_times') + '次', () => {
                this.clearIdentifyTimes();
            });
            GM_registerMenuCommand(`📋️ 识别剪切板中文字（快捷键 ${util.getValue('setting_hotkeys')}）`, () => {
                this.showIdentifyBox();
            });
            GM_registerMenuCommand('⚙️ 设置', () => {
                this.showSettingBox();
            });
        },

        addPluginStyle() {
            let style = `
                .panai-container { z-index: 99999!important }
                .panai-popup { font-size: 14px !important }
                .panai-setting-label { display: flex;align-items: center;justify-content: space-between;padding-top: 20px; }
                .panai-setting-checkbox { width: 16px;height: 16px; }
            `;

            if (document.head) {
                util.addStyle('swal-pub-style', 'style', GM_getResourceText('swalStyle'));
                util.addStyle('panai-style', 'style', style);
            }

            const headObserver = new MutationObserver(() => {
                util.addStyle('swal-pub-style', 'style', GM_getResourceText('swalStyle'));
                util.addStyle('panai-style', 'style', style);
            });
            headObserver.observe(document.head, {childList: true, subtree: true});
        },

        isTopWindow() {
            return window.self === window.top;
        },

        init() {
            this.initValue();
            this.addPluginStyle();
            this.addHotKey();
            this.autoFillPassword();
            this.addPageListener();
            this.isTopWindow() && this.registerMenuCommand();
        },
    };

    main.init();
})();

//Function2:识别助手
(function() {
    'use strict';

    // --- TLD Set ---
    // Extracted English TLDs from the provided list
    const validTlds = new Set([
        'ac', 'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'aq', 'ar', 
        'as', 'at', 'au', 'aw', 'ax', 'az', 'ba', 'bb', 'bd', 'be', 'bf', 
        'bg', 'bh', 'bi', 'bj', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 
        'bv', 'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 
        'ck', 'cl', 'cm', 'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 
        'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'edu', 
        'ee', 'eg', 'er', 'es', 'et', 'eu', 'fi', 'fj', 'fk', 'fm', 
        'fo', 'fr', 'ga', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 
        'gm', 'gn', 'gov', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 
        'gw', 'gy', 'hk', 'hm', 'hn', 'hr', 'ht', 'hu', 'ie', 
        'il', 'im', 'in', 'info', 'int', 'io', 'iq', 'ir', 'is', 
        'it', 'je', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'ki', 
        'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 
        'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 
        'me', 'mg', 'mh', 'mil', 'mk', 'ml', 'mm', 'mn', 'mo',  
        'mp', 'mq', 'mr', 'ms', 'mt', 'mu', ' mv', 'mw', 'mx', 
        'my', 'mz', 'na', 'nc', 'ne', 'net', 'nf', 'ng', 'ni', 
        'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'org', 'pa', 'pe', 
        'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'pro', 'ps', 
        'pt', 'pw', 'qa', 're', 'ro', 'rs', 'ru', 'rw', 'sa', 
        'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 
        'sn', 'so', 'sr', 'ss', 'st', 'su', 'sv', 'sx', 'sy', 'sz', 'tc', 
        'td', 'tel', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 
        'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'uk', 'us', 'uy', 'uz', 
        'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ye', 'yt', 'za', 
        'zm', 'zw', 'app','com', 'art', 'asia', 'auto', 'autos', 'biz', 'blog', 
        'buy', 'car', 'cars', 'cat', 'city', 'click', 'cloud', 'club', 'coop', 
        'design', 'dev', 'digital', 'games', 'global', 'group', 'guru', 
        'icu', 'ink', 'jobs', 'link', 'live', 'media', 'museum', 'network', 'news', 
        'ngo', 'one', 'online', 'ong', 'photo', 'photos', 'pics', 'post', 'sale', 
        'shop', 'site', 'space', 'store', 'tech', 'today', 'top', 'travel', 'vip', 
        , 'wiki', 'world', 'xxx', 'xyz', 'zone', 'aero', 'adult'
    ]);

    /**
     * Cleans specific noise (chars, bracketed text, emojis, invisible chars) from a URL part
     * AND ensures 'https://' protocol is prepended if missing and looks like a structurally valid URL (hostname.tld).
     * @param {string} urlPart - The URL string (potentially without protocol) possibly containing noise.
     * @returns {string | null} The cleaned URL string with 'https://' prepended if it was missing and valid. Returns null if input invalid or cleaning fails.
     */
    function cleanAndEnsureProtocol(urlPart) {
        if (typeof urlPart !== 'string' || !urlPart) {
            return null; // Return null if not a non-empty string
        }

        // 1. Basic Noise Cleaning (Keep it minimal here, TLD check is primary)
        let cleaned = urlPart.trim();
         // Remove specific problematic characters if needed, but be cautious not to break valid URLs
         // cleaned = cleaned.replace(/删/g, '');
         // cleaned = cleaned.replace(/\[[^\]]+?\]/g, '');
         // cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove invisible chars

        // 2. Ensure Protocol - Only if it looks like a valid domain structure
        //    This check is now less critical because TLD validation happens *before* calling this,
        //    but it's a good final sanity check.
        if (!/^https?:\/\//i.test(cleaned)) {
             // Basic structure check: contains a dot, doesn't start/end with dot/hyphen near TLD part
             if (cleaned.includes('.') && /^[\w.-]+\.[a-zA-Z]{2,}$/.test(cleaned.split(/[/?#:]/)[0])) {
                 cleaned = 'https://' + cleaned;
             } else {
                 // Doesn't look like a domain that needs a protocol prepended
                 // If it already passed TLD check, it might be something like an IP or a file path that shouldn't get https://
                 // Or maybe it was just the TLD itself. For safety, return null if we can't confidently add https.
                 // However, since we call this *after* TLD check, we assume it IS a domain.
                 cleaned = 'https://' + cleaned;
             }
        }

        // 3. Final Validation: Check if the result is a plausible URL format
        try {
            new URL(cleaned); // Try parsing it
            return cleaned;
        } catch (e) {
            // If adding https:// resulted in an invalid URL, reject it
            console.warn("[Linkifier] Post-cleaning URL invalid:", cleaned, e);
            return null;
        }
    }

        // URL 正则表达式：
    // 匹配：可选协议 + 主机名.顶级域名 + 可选端口 + 可选路径/查询/片段
    // 协议 (可选，非捕获组): (?:https?:\/\/)?
    // 主机名和顶级域名 (捕获组 1 的核心): [\w.-]*\w+\.[a-zA-Z]{2,}
    //   - \w 匹配字母、数字、下划线
    //   - . 匹配点
    //   - - 匹配连字符
    //   - *\w+ 确保域名部分以单词字符结尾（避免 example-.com）
    //   - \.[a-zA-Z]{2,} 确保顶级域名至少为2个字母
    // 可选端口: (?::\d{1,5})?
    // 可选路径/查询/片段 (改进部分):
    //   (?:                    -- 非捕获组包裹整个路径部分
    //     [/?#]                -- 必须以 / ? # 其中一个开始
    //     [a-zA-Z0-9\-_~.!*'();:@&=+$,/?%#[\]]*  -- 允许的字符集，重复零次或多次
    //                                         -- a-zA-Z0-9: 字母数字
    //                                         -- \-_~.: 基本非保留字符和点
    //                                         -- !*'();@&=+$,/?%#[]: 保留字符 (在路径中常用)
    //                                         -- 注意：百分号 % 是单独处理的，因为它可以是 %HH
    //                                         -- 我们这里简单包含它，假设后面跟的是合法编码
    //   )?                     -- 整个路径部分是可选的
    const urlRegex = /(?:https?:\/\/)?([\w.-]*\w+\.[a-zA-Z]{2,}(?::\d{1,5})?(?:[/?#][a-zA-Z0-9\-_~.!*'();:@&=+$,/?%#[\]]*)?)/gu;
    // Baidu Path Regex: Find potential Baidu paths starting with /s/
    const baiduPathRegex = /(\/?s\/[^\s<>"]+)/gu;

    // --- Original v2.1.0 Constants ---
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'A', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'TITLE', 'PRE', 'BUTTON', 'INPUT', 'SELECT']);
    const processedNodes = new WeakSet(); // Use WeakSet from original

    // --- Helper Functions (createBaseHyperlink, cleanNoise, cleanBaiduPath, extractPasswordFromText) ---
    // (These functions remain the same as in your provided code, ensure they are present)
    function createBaseHyperlink() {
        const a = document.createElement('a');
        a.target = '_blank';
        a.style.wordBreak = 'break-all';
        a.rel = 'noopener noreferrer';
        a.style.color = '#55aaff'; // Use the desired link color
        return a;
    }

    function cleanNoise(text) {
        if (typeof text !== 'string') return text;
        let cleaned = text
            .replace(/删/g, '')
            .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '') // Emoji
            .replace(/\[[^\]]*?\]|【[^】]*?】|（[^）]*?）|\([^)]*?\)/g, ''); // 括号
        cleaned = cleaned
            .replace(/[^\x00-\x7F]/g, '')  // Remove non-ASCII for cleaner matching (adjust if needed)
            .replace(/[^\w\-\.\/\?=&:#]/g, ''); // Whitelist relevant URL chars + : #
        return cleaned.trim(); // Trim whitespace
    }

    function cleanBaiduPath(pathPart) {
        if (typeof pathPart !== 'string') return null;
        // Simplified cleaning for Baidu path: remove noise AFTER finding pwd if needed
        // Basic noise removal first:
        let cleaned = pathPart.replace(/删|\[[^\]]*?\]|\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u200B-\u200D\uFEFF]/gu, '').trim();


        // Extract the core path part before query/fragment
        const corePathMatch = cleaned.match(/^(\/s\/[a-zA-Z0-9~_\-\.]+)/);
        if (!corePathMatch) return null; // Basic structure invalid

        let finalPath = corePathMatch[1];

        // Ensure it actually looks like a Baidu path
        if (/^\/s\/[a-zA-Z0-9~_\-\.]+/.test(finalPath)) {
             // Optionally, truncate at the first invalid char if strictness is needed
             // finalPath = finalPath.split(/[<>"'\s]/)[0];
            return finalPath;
        }
        return null;
    }

    function extractPasswordFromText(text) {
        const result = { password: null, type: null };
        if (typeof text !== 'string') return result;

        // Clean minimal noise that might interfere with keywords/params
        const preCleanedText = text.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove invisible chars

        let match;

        // Pattern 1: ?pwd=xxxx, &p=xxxx (Query Parameter style) - Allow space around '='
        // Match 3-8 alphanumeric characters
        match = preCleanedText.match(/[?&](?:pwd|p|password|passwd)\s*[=:]?\s*([a-zA-Z0-9]{3,8})(?:[\s,&<>"']|$)/i);
        if (match && match[1]) {
            result.password = match[1];
            result.type = 'query';
            return result;
        }

        // Pattern 2: Keyword based - Allow space around ':' or chinese colon '：'
        // Match 3-8 alphanumeric characters
        match = preCleanedText.match(/(?:提取码|密码|访问码|驗證碼|验证码|pass(?:word)?|key)\s*[：:]?\s*([a-zA-Z0-9]{3,8})(?:[\s,&<>"']|$)/i);
        if (match && match[1]) {
            result.password = match[1];
            result.type = 'keyword';
            return result;
        }
        return result; // No password found
    }

    /**
     * Extracts the potential TLD from a hostname string.
     * Handles basic hostnames and subdomains.
     * @param {string} hostname - The hostname part (e.g., "www.example.co.uk", "example.com").
     * @returns {string | null} The potential TLD in lowercase (e.g., "uk", "com") or null.
     */
    function extractTld(hostname) {
        if (!hostname || typeof hostname !== 'string') return null;
        const parts = hostname.split('.');
        if (parts.length < 2) return null; // Need at least domain.tld
        const potentialTld = parts[parts.length - 1];
        // Basic check: Ensure it's letters only and has a reasonable length
        if (/^[a-zA-Z]{2,}$/.test(potentialTld)) {
            return potentialTld.toLowerCase();
        }
        return null;
    }


    // --- Modified processTextNode (Core logic changes here) ---
    function processTextNode(node) {
        if (processedNodes.has(node) || node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) {
            return;
        }
        let parent = node.parentNode;
        if (!parent) return;
        let currentParent = parent;
        while (currentParent && currentParent !== document.body) {
            if (ignoredTags.has(currentParent.nodeName) || currentParent.isContentEditable || currentParent.nodeName === 'A') {
                return;
            }
            currentParent = currentParent.parentNode;
        }
        if (!currentParent) return;

        const text = node.nodeValue;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let foundAnyLink = false;

        // --- Main Processing Loop ---
        while (lastIndex < text.length) {
            // Reset lastIndex for regexes
            baiduPathRegex.lastIndex = lastIndex;
            urlRegex.lastIndex = lastIndex;

            const baiduMatch = baiduPathRegex.exec(text);
            const urlMatch = urlRegex.exec(text);

            let bestMatch = null;
            let matchType = null; // 'baidu' or 'url'

            if (baiduMatch && urlMatch) {
                bestMatch = baiduMatch.index <= urlMatch.index ? baiduMatch : urlMatch;
                matchType = baiduMatch.index <= urlMatch.index ? 'baidu' : 'url';
            } else if (baiduMatch) {
                bestMatch = baiduMatch;
                matchType = 'baidu';
            } else if (urlMatch) {
                bestMatch = urlMatch;
                matchType = 'url';
            }

            if (!bestMatch) {
                break; // No more matches
            }

            const matchIndex = bestMatch.index;
            const fullMatchedText = bestMatch[0]; // Use the raw matched text for display

            // Add text before this match
            if (matchIndex > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
            }

            let linkCreated = false;

            // --- Process Based on Match Type ---
            if (matchType === 'baidu') {
                 // --- Baidu Logic (Mostly Unchanged) ---
                const potentialPathPart = bestMatch[1]; // Captured /s/... part

                // 1. Extract password from the *full matched text* (might be around the path)
                const passwordResult = extractPasswordFromText(fullMatchedText);
                const password = passwordResult.password;
                const passwordType = passwordResult.type;

                // 2. Clean the path part itself
                const cleanedPath = cleanBaiduPath(potentialPathPart);

                if (cleanedPath) {
                    let href = "https://pan.baidu.com" + cleanedPath;
                    let titleText = `打开百度网盘链接`;

                    if (password) {
                        if (passwordType === 'query') {
                            // If pwd was found like ?pwd=, attempt to append cleanly
                             href += (href.includes('?') ? '&' : '?') + "pwd=" + password;
                             titleText += ` (密码内嵌)`;
                         } else { // Keyword type
                             href += "#" + password; // Use hash for keyword passwords
                             titleText += ` (密码: ${password})`;
                         }
                    }

                    const a = createBaseHyperlink();
                    a.href = href;
                    a.textContent = fullMatchedText; // Show original text
                    a.title = titleText;
                    fragment.appendChild(a);
                    linkCreated = true;
                } else {
                     console.warn("[Linkifier] Baidu path cleaning failed for:", potentialPathPart);
                 }


            } else if (matchType === 'url') {
                // --- URL Logic with TLD Validation ---
                const potentialUrlPart = bestMatch[1]; // The captured part (hostname.tld...)
                const originalFullMatch = bestMatch[0]; // The originally matched text including potential http://

                // 1. Extract Hostname: Get the part before the first path/query/fragment/port
                const hostAndPortMatch = potentialUrlPart.match(/^[\w.-]+/);
                const hostname = hostAndPortMatch ? hostAndPortMatch[0] : null;

                // 2. Extract TLD from Hostname
                const tld = hostname ? extractTld(hostname) : null;

                // 3. *** Validate TLD ***
                if (tld && validTlds.has(tld)) {
                    // 检查前面是否是 "@" 符号
                    // matchIndex 是 bestMatch 在原始文本 text 中的起始索引
                    if (matchIndex > 0 && text[matchIndex - 1] === '@') {
                        // 如果前面是 @, 那么这很可能是一个邮箱地址，不创建链接
                        // linkCreated 保持 false, 文本会在后续逻辑中作为普通文本添加
                        // console.log(`[Linkifier] Skipped linkifying potential email: @${originalFullMatch}`);
                    } else {
                        // 4. If TLD is valid AND not preceded by "@", clean and ensure protocol
                        const cleanedHref = cleanAndEnsureProtocol(potentialUrlPart); // Pass the captured part for cleaning

                        if (cleanedHref) { // Ensure cleaning and protocol addition was successful
                            const a = createBaseHyperlink();
                            a.href = cleanedHref;
                            // Display the text exactly as it was found in the page
                            a.textContent = originalFullMatch;
                            a.title = `打开链接 (TLD: .${tld})`; // Add TLD info to title
                            fragment.appendChild(a);
                            linkCreated = true;
                        } else {
                            console.warn("[Linkifier] URL cleaning/protocol failed after TLD check:", originalFullMatch);
                        }
                    }
                } else {
                    // TLD is invalid or not extracted, treat as plain text
                    // console.log(`[Linkifier] Invalid or no TLD found for "${hostname}", TLD extracted: "${tld}". Original match: "${originalFullMatch}"`);
                }
            }

            // --- Update Loop State ---
            if (linkCreated) {
                foundAnyLink = true;
                lastIndex = matchIndex + fullMatchedText.length; // Advance past the original matched text
            } else {
                // If no link was created (Baidu cleaning failed OR Invalid TLD)
                // Append the raw matched text as plain text and advance
                fragment.appendChild(document.createTextNode(fullMatchedText));
                lastIndex = matchIndex + fullMatchedText.length;
                 // Ensure progress even if length was 0 (unlikely but safe)
                 if (lastIndex <= matchIndex) {
                      lastIndex = matchIndex + 1;
                 }
            }
        } // End while loop

        // --- Append remaining text and replace node ---
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        if (foundAnyLink) {
            try {
                if (node.parentNode) {
                    // Replace the original text node with the fragment
                    node.parentNode.replaceChild(fragment, node);
                    // We don't add the *original* node to processedNodes anymore,
                    // because its content is gone. We rely on not re-processing
                    // the *new* text nodes and link nodes we just inserted.
                    // The TreeWalker filter should prevent descending into new 'A' tags.
                }
            } catch (e) {
                console.warn('[网盘智能识别助手] Error replacing text node:', e);
                 processedNodes.add(node); // Mark original node as processed if replacement failed
            }
        } else {
             // Mark as processed even if no links were found in this specific node
             // to prevent re-checking the exact same text content unnecessarily.
             processedNodes.add(node);
        }
    } // --- End of processTextNode Function Body ---


    // --- scanForLinks (Modified Filter) ---
    function scanForLinks(rootNode) {
        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            { // Filter function
                acceptNode: function(node) {
                    // 1. Skip if already processed
                    if (processedNodes.has(node)) return NodeFilter.FILTER_REJECT;

                    // 2. Check parent hierarchy for ignored tags, contentEditable, or existing links
                    let parent = node.parentNode;
                    while (parent && parent !== rootNode && parent !== document.body) {
                        if (ignoredTags.has(parent.nodeName) || parent.isContentEditable || parent.nodeName === 'A') {
                            return NodeFilter.FILTER_REJECT; // Reject node and its children if parent is bad
                        }
                        parent = parent.parentNode;
                    }
                     // Check rootNode itself if it's an element being scanned directly
                     if (rootNode.nodeType === Node.ELEMENT_NODE && (ignoredTags.has(rootNode.nodeName) || rootNode.isContentEditable)) {
                         return NodeFilter.FILTER_REJECT;
                     }

                    // 3. Accept non-empty text nodes that passed the checks
                    if (node.nodeValue?.trim()) {
                        return NodeFilter.FILTER_ACCEPT;
                    }

                    // 4. Skip empty text nodes
                    return NodeFilter.FILTER_SKIP;
                }
            },
            false // Set to false for compatibility, true might be slightly faster but requires browser support
        );

        let node;
        const nodesToProcess = [];
        while (node = walker.nextNode()) {
            // Check again right before adding, in case the DOM changed mid-walk
            if (!processedNodes.has(node) && node.parentNode && node.parentNode.nodeName !== 'A') {
               nodesToProcess.push(node);
            }
        }
        // Process collected nodes *after* the walk is complete
        nodesToProcess.forEach(n => {
            // Final check before processing
            if (!processedNodes.has(n) && n.parentNode && !ignoredTags.has(n.parentNode.nodeName) && n.parentNode.nodeName !== 'A' && !n.parentNode.isContentEditable) {
                 processTextNode(n);
            } else {
                 processedNodes.add(n); // Mark as processed if skipped here
            }
        });
    }

    // --- MutationObserver (Largely Unchanged, relies on scanForLinks filter) ---
    const observer = new MutationObserver(mutations => {
        // Use a Set to avoid scanning the same root multiple times per batch
        const rootsToScan = new Set();
        let requiresFullScan = false;

        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(newNode => {
                    // If a significant number of nodes are added, maybe do a full rescan?
                    // For now, scan the parent or the node itself if it's an element.
                    if (newNode.nodeType === Node.TEXT_NODE && newNode.parentNode) {
                        // Check parent validity before adding root
                        let parent = newNode.parentNode; let ignore = false;
                        while(parent && parent !== document.body) { if(ignoredTags.has(parent.nodeName) || parent.isContentEditable || parent.nodeName === 'A') { ignore = true; break; } parent = parent.parentNode; }
                        if (!ignore && newNode.parentNode.nodeType === Node.ELEMENT_NODE) rootsToScan.add(newNode.parentNode);

                    } else if (newNode.nodeType === Node.ELEMENT_NODE) {
                         // Check if the new element itself or its parents should be ignored
                         let ignoreSubtree = false; let checkNode = newNode;
                         while(checkNode && checkNode !== document.body) {
                             if (ignoredTags.has(checkNode.nodeName) || checkNode.isContentEditable) {
                                 ignoreSubtree = true; break;
                             }
                             checkNode = checkNode.parentNode;
                         }
                         if (!ignoreSubtree) rootsToScan.add(newNode); // Scan the added element subtree
                    }
                });
                 // Optional: If nodes were removed, potentially re-scan parent if needed (more complex)
                 // mutation.removedNodes.forEach(removedNode => { ... });

            } else if (mutation.type === 'characterData') {
                 // If text content changes, re-scan the parent element containing the text node
                 if (mutation.target && mutation.target.nodeType === Node.TEXT_NODE && mutation.target.parentNode) {
                     let parent = mutation.target.parentNode; let ignore = false;
                     while(parent && parent !== document.body) { if(ignoredTags.has(parent.nodeName) || parent.isContentEditable || parent.nodeName === 'A') { ignore = true; break; } parent = parent.parentNode; }
                     if (!ignore && mutation.target.parentNode.nodeType === Node.ELEMENT_NODE) {
                         // Mark the text node itself as needing reprocessing by removing from WeakSet
                         processedNodes.delete(mutation.target);
                         rootsToScan.add(mutation.target.parentNode);
                     }
                 }
            }
        });

        // Scan affected roots efficiently
        rootsToScan.forEach(node => {
            // Check if the node is still in the document before scanning
             if (document.body.contains(node)) {
                 scanForLinks(node);
             }
        });
    });

    // --- Debounce function ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Initialization ---
     const debouncedInitialScan = debounce(() => {
         if (document.body && !document.body.dataset.linkifierScanComplete) {
             console.log("[Linkifier] Starting initial scan...");
             scanForLinks(document.body);
             document.body.dataset.linkifierScanComplete = "true"; // Mark body scan as done
             // Start observing *after* the initial scan might have settled things
             observer.observe(document.body, {
                 childList: true,
                 subtree: true,
                 characterData: true // Observe text changes
             });
             console.log("[Linkifier] Initial scan complete, observer started.");
         } else if (!document.body) {
             console.warn("[Linkifier] Document body not ready for initial scan.");
         }
     }, 500); // Wait 500ms after idle/load before scanning

     // Try on idle, fallback to DOMContentLoaded
     if (document.readyState === 'complete' || document.readyState === 'interactive') {
         debouncedInitialScan();
     } else {
         document.addEventListener('DOMContentLoaded', debouncedInitialScan, { once: true });
     }


    // Optional: Cleanup observer on page unload
    window.addEventListener('unload', () => {
       if (observer) observer.disconnect();
       console.log("[Linkifier] Observer disconnected.");
    });

})();