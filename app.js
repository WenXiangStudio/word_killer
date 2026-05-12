let app = {
    words: [],
    allLists: [],
    currentListIdx: 0,
    currentWordIdx: 0,
    wordsPerList: 50,
    mode: 'select',
    score: 0,
    wrongWords: [],
    choiceLocked: false,
    showAnswer: false,
    wordBooks: {},
    bookManifest: null,
    selectedListIdx: 0,
    previewWords: [],
    listPageIdx: 0,
    reviewReturnState: null,
    homeTab: 'study'
};

let currentBookKey = 'cet4';
const APP_VERSION = 'v2026.05.12-3';
const WORD_APP_STATE_KEY = 'wordAppState';
const WRONG_WORDS_COLLECTION_KEY = 'wrongWordsCollection:v1';
const FORGOTTEN_WORDS_COLLECTION_KEY = 'forgottenWordsCollection:v1';
const WORD_STATS_KEY = 'wordStats:v1';
const WORDS_PER_LIST_KEY = 'wordsPerList:v1';
const WORD_BOOKS_CACHE_KEY = 'wordBooksManifest:v1';
const SPEECH_VOICE_KEY = 'speechVoice:v1';
const LEGACY_WORD_BOOKS_CACHE_KEYS = ['wordBooksCache', 'wordBooksCache:v2', 'wordBooksCache:v3'];
const WORD_BOOKS_MANIFEST_PATH = 'books_manifest.json';
const BOOK_NAMES = {cet4: '四级词汇', cet6: '六级词汇', kaoyan: '考研词汇'};
let currentWordRenderToken = 0;
let phoneticCache = {};
let englishVoices = [];
let pronunciationAudio = null;
const LISTS_PER_PAGE = 24;

function getWordCollectionKey(word) {
    const bookKey = word.bookKey || currentBookKey;
    return `${bookKey}::${word.word}::${word.meaning}`;
}

function getWrongWordKey(word) {
    return getWordCollectionKey(word);
}

function getStoredCollection(storageKey) {
    try {
        const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
        return {};
    }
}

function saveStoredCollection(storageKey, collection) {
    localStorage.setItem(storageKey, JSON.stringify(collection));
}

function getWordStatsCollection() {
    return getStoredCollection(WORD_STATS_KEY);
}

function saveWordStatsCollection(collection) {
    saveStoredCollection(WORD_STATS_KEY, collection);
}

function getWordStats(word) {
    return getWordStatsCollection()[getWordCollectionKey(word)] || {};
}

function incrementWordStat(word, fieldName) {
    if (!word || !word.word || !word.meaning) return;
    const collection = getWordStatsCollection();
    const key = getWordCollectionKey(word);
    const existing = collection[key] || {};
    collection[key] = {
        word: word.word,
        meaning: word.meaning,
        phonetic: word.phonetic || existing.phonetic || '',
        bookKey: word.bookKey || currentBookKey,
        bookName: word.bookName || BOOK_NAMES[currentBookKey] || currentBookKey,
        wrongCount: existing.wrongCount || 0,
        forgottenCount: existing.forgottenCount || 0,
        updatedAt: Date.now()
    };
    collection[key][fieldName] = (collection[key][fieldName] || 0) + 1;
    saveWordStatsCollection(collection);
    updateLearningStatsInfo();
}

function updateLearningStatsInfo() {
    const stats = Object.values(getWordStatsCollection());
    const wrongTotal = stats.reduce((sum, item) => sum + (item.wrongCount || 0), 0);
    const forgottenTotal = stats.reduce((sum, item) => sum + (item.forgottenCount || 0), 0);
    const wrongEl = document.getElementById('stats-total-wrong');
    const forgottenEl = document.getElementById('stats-total-forgotten');
    const listEl = document.getElementById('stats-list');
    if (!wrongEl || !forgottenEl || !listEl) return;

    wrongEl.textContent = wrongTotal;
    forgottenEl.textContent = forgottenTotal;
    listEl.innerHTML = '';

    const rows = stats
        .filter(item => (item.wrongCount || 0) > 0 || (item.forgottenCount || 0) > 0)
        .sort((a, b) => ((b.wrongCount || 0) + (b.forgottenCount || 0)) - ((a.wrongCount || 0) + (a.forgottenCount || 0)));

    if (!rows.length) {
        listEl.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">暂无统计记录</p>';
        return;
    }

    rows.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stats-row';
        div.innerHTML = `
            <div class="stats-word">${item.word}</div>
            <div class="stats-meaning">${item.meaning}</div>
            <div class="stats-counts">累计错误 ${item.wrongCount || 0} 次 · 累计遗忘 ${item.forgottenCount || 0} 次</div>
        `;
        listEl.appendChild(div);
    });
}

function getWrongWordsCollection() {
    return getStoredCollection(WRONG_WORDS_COLLECTION_KEY);
}

function saveWrongWordsCollection(collection) {
    saveStoredCollection(WRONG_WORDS_COLLECTION_KEY, collection);
}

function getForgottenWordsCollection() {
    return getStoredCollection(FORGOTTEN_WORDS_COLLECTION_KEY);
}

function saveForgottenWordsCollection(collection) {
    saveStoredCollection(FORGOTTEN_WORDS_COLLECTION_KEY, collection);
}

function getCollectedForgottenWords() {
    return Object.values(getForgottenWordsCollection())
        .sort((a, b) => (b.markedAt || 0) - (a.markedAt || 0));
}

function updateForgottenCollectionInfo() {
    const words = getCollectedForgottenWords();
    const previewInfo = document.getElementById('forgot-preview-info');
    const homeInfo = document.getElementById('forgot-home-info');
    if (previewInfo) {
        previewInfo.textContent = `遗忘收录 ${words.length} 个`;
    }
    if (homeInfo) {
        homeInfo.textContent = words.length ? `已收录 ${words.length} 个遗忘单词` : '暂无遗忘单词收录';
    }
}

function togglePreviewMeaningMask(enabled) {
    document.querySelectorAll('#preview-words .preview-secret').forEach(el => {
        el.classList.toggle('masked', enabled && el.dataset.revealed !== 'true');
    });
}

function revealPreviewMeaning(el) {
    if (!el) return;
    el.dataset.revealed = 'true';
    el.classList.remove('masked');
}

function shuffledWords(words) {
    const result = [...words];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getStableIndex(text, max) {
    if (!max) return 0;
    const value = String(text || '');
    let total = 0;
    for (let i = 0; i < value.length; i++) {
        total = (total + value.charCodeAt(i) * (i + 1)) % 9973;
    }
    return total % max;
}

function getPrimaryMeaning(meaning) {
    const text = cleanImportedField(meaning)
        .replace(/\b(?:n|v|vt|vi|adj|adv|prep|pron|num|int|conj|art|aux|phr)\.\s*/gi, '')
        .replace(/[()（）【】[\]]/g, ' ')
        .trim();
    const parts = text
        .split(/[;；,，、\/]|(?:\s{2,})/)
        .map(part => part.trim())
        .filter(Boolean);
    const chinesePart = parts.find(part => /[一-鿿]/.test(part)) || text;
    return chinesePart.replace(/^[的地得\s]+|[的地得\s]+$/g, '').slice(0, 12) || '这个意思';
}

function getMeaningPartOfSpeech(meaning) {
    const match = cleanImportedField(meaning).match(/\b(n|v|vt|vi|adj|adv|prep|pron|num|int|conj|art|aux|phr)\./i);
    return match ? match[1].toLowerCase() : '';
}

function highlightText(text, target, className) {
    const source = String(text || '');
    const needle = String(target || '').trim();
    if (!needle) return escapeHtml(source);

    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const index = lowerSource.indexOf(lowerNeedle);
    if (index < 0) return escapeHtml(source);

    return [
        escapeHtml(source.slice(0, index)),
        `<mark class="${className}">`,
        escapeHtml(source.slice(index, index + needle.length)),
        '</mark>',
        escapeHtml(source.slice(index + needle.length))
    ].join('');
}

function createUsageExample(word) {
    const term = cleanImportedField(word.word);
    const meaning = getPrimaryMeaning(word.meaning);
    const pos = getMeaningPartOfSpeech(word.meaning);
    const lowerTerm = term.toLowerCase();
    let templates;

    if (/允许|准许|同意/.test(word.meaning)) {
        templates = [{
            en: `The teacher will ${term} students to discuss the answer in pairs.`,
            zh: `老师会允许学生两人一组讨论答案。`
        }];
    } else if (/关|闭|结束/.test(word.meaning) || lowerTerm === 'close') {
        templates = [{
            en: `Please ${term} the door before the meeting starts.`,
            zh: `会议开始前，请把门关上。`
        }];
    } else if (/^(vt|vi|v)$/.test(pos)) {
        templates = [
            {
                en: `At work, the team can ${term} this step before moving on.`,
                zh: `工作中，团队可以先${meaning}这一步，再继续。`
            },
            {
                en: `In a real conversation, people may ${term} when they need a clear result.`,
                zh: `真实对话里，人们需要明确结果时可能会${meaning}。`
            }
        ];
    } else if (pos === 'adj') {
        templates = [
            {
                en: `The plan felt ${term} after several rounds of changes.`,
                zh: `几轮修改后，这个方案显得有些${meaning}。`
            },
            {
                en: `A ${term} response can make the customer feel more confident.`,
                zh: `一个${meaning}的回应能让客户更有信心。`
            }
        ];
    } else if (pos === 'adv') {
        templates = [{
            en: `She answered ${term} during the customer call.`,
            zh: `客户来电时，她${meaning}地回答。`
        }];
    } else if (pos === 'pron' && lowerTerm === 'none') {
        templates = [{
            en: `None of the guests forgot to sign in at the front desk.`,
            zh: `在前台签到时，没有人忘记登记。`
        }];
    } else if (pos === 'n') {
        templates = [
            {
                en: `I noticed the ${term} on my way to work this morning.`,
                zh: `今天早上上班路上，我注意到了这个${meaning}。`
            },
            {
                en: `The ${term} became important during the team discussion.`,
                zh: `团队讨论时，这个${meaning}变得很重要。`
            }
        ];
    } else {
        templates = [{
            en: `In this situation, "${term}" is the key word to understand.`,
            zh: `在这个场景中，${meaning}是理解这个词的关键。`
        }];
    }

    return {
        ...templates[getStableIndex(term, templates.length)],
        meaning
    };
}

function renderHighlightedMeaning(meaning) {
    return highlightText(meaning, getPrimaryMeaning(meaning), 'meaning-highlight');
}

function isForgottenWord(word) {
    return Boolean(getForgottenWordsCollection()[getWordCollectionKey(word)]);
}

function setForgottenWord(word, isForgotten) {
    if (!word || !word.word || !word.meaning) return;
    const collection = getForgottenWordsCollection();
    const key = getWordCollectionKey(word);

    if (isForgotten) {
        const existing = collection[key] || {};
        if (!existing.word) {
            incrementWordStat(word, 'forgottenCount');
        }
        collection[key] = {
            word: word.word,
            meaning: word.meaning,
            phonetic: word.phonetic || existing.phonetic || '',
            bookKey: word.bookKey || currentBookKey,
            bookName: word.bookName || BOOK_NAMES[currentBookKey] || currentBookKey,
            markedAt: Date.now()
        };
    } else {
        delete collection[key];
    }

    saveForgottenWordsCollection(collection);
    updateForgottenCollectionInfo();
    updateLearningStatsInfo();
}

function getCollectedWrongWords() {
    return Object.values(getWrongWordsCollection())
        .sort((a, b) => (b.lastWrongAt || 0) - (a.lastWrongAt || 0));
}

function updateWrongCollectionInfo() {
    const info = document.getElementById('wrong-collection-info');
    if (!info) return;

    const words = getCollectedWrongWords();
    if (!words.length) {
        info.textContent = '暂无错题收录';
        return;
    }

    const totalWrongCount = words.reduce((sum, item) => sum + (item.wrongCount || 0), 0);
    info.textContent = `已收录 ${words.length} 个错题，累计错 ${totalWrongCount} 次`;
}

function recordWrongWord(word) {
    if (!word || !word.word || !word.meaning) return;
    incrementWordStat(word, 'wrongCount');

    if (!app.wrongWords.some(item => item.word === word.word && item.meaning === word.meaning)) {
        app.wrongWords.push(word);
    }

    const collection = getWrongWordsCollection();
    const key = getWrongWordKey(word);
    const existing = collection[key] || {};
    collection[key] = {
        word: word.word,
        meaning: word.meaning,
        phonetic: word.phonetic || existing.phonetic || '',
        bookKey: word.bookKey || currentBookKey,
        bookName: word.bookName || BOOK_NAMES[currentBookKey] || currentBookKey,
        wrongCount: (existing.wrongCount || 0) + 1,
        firstWrongAt: existing.firstWrongAt || Date.now(),
        lastWrongAt: Date.now()
    };
    saveWrongWordsCollection(collection);
    updateWrongCollectionInfo();
}

function clearForgottenRecords(words) {
    if (!Array.isArray(words) || words.length === 0) return;
    const collection = getForgottenWordsCollection();
    words.forEach(word => delete collection[getWordCollectionKey(word)]);
    saveForgottenWordsCollection(collection);
    updateForgottenCollectionInfo();
}
const bookLoadPromises = {};

function getWordKey(word) {
    return String(word || '').trim().toLowerCase();
}

function setCachedPhonetic(word, phonetic) {
    const key = getWordKey(word);
    const normalized = normalizePhonetic(phonetic);
    if (key && normalized) {
        phoneticCache[key] = normalized;
    }
    return normalized;
}

function getCachedPhonetic(word) {
    return phoneticCache[getWordKey(word)] || '';
}

function rebuildPhoneticCache() {
    phoneticCache = {};

    if (typeof PHONETIC_DB !== 'undefined') {
        Object.entries(PHONETIC_DB).forEach(([word, phonetic]) => {
            setCachedPhonetic(word, phonetic);
        });
    }

    if (app.wordBooks) {
        Object.values(app.wordBooks).forEach(words => {
            words.forEach(item => setCachedPhonetic(item.word, item.phonetic));
        });
    }

    if (app.words) {
        app.words.forEach(item => setCachedPhonetic(item.word, item.phonetic));
    }
}

function hydrateWordPhonetic(word) {
    if (!word) return '';
    if (word.phonetic) {
        return setCachedPhonetic(word.word, word.phonetic);
    }

    const phonetic = getCachedPhonetic(word.word);
    if (phonetic) {
        word.phonetic = phonetic;
        return phonetic;
    }

    return '';
}

function getBookManifestEntry(bookKey) {
    return app.bookManifest?.books?.[bookKey] || null;
}

function isValidBookManifest(manifest) {
    return ['cet4', 'cet6', 'kaoyan'].every(key => {
        const entry = manifest?.books?.[key];
        return entry && entry.path && Number(entry.count) > 0;
    });
}

function getCurrentBookWordCount() {
    if (app.words.length > 0) {
        return app.words.length;
    }

    const manifestEntry = getBookManifestEntry(currentBookKey);
    return manifestEntry?.count || 0;
}

function updateSelectedBookInfo(extraText = '') {
    const bookInfo = document.getElementById('book-info');
    if (!currentBookKey || !BOOK_NAMES[currentBookKey]) {
        bookInfo.textContent = '请选择词书';
        return;
    }

    const count = getCurrentBookWordCount();
    const suffix = extraText ? ` · ${extraText}` : '';
    bookInfo.textContent = `已选择：${BOOK_NAMES[currentBookKey]}（${count}词）${suffix}`;
}

async function ensureBookLoaded(bookKey) {
    const manifestEntry = getBookManifestEntry(bookKey);
    if (!manifestEntry) {
        throw new Error('词书清单不存在');
    }

    if (app.wordBooks[bookKey]) {
        return app.wordBooks[bookKey];
    }

    if (bookLoadPromises[bookKey]) {
        return bookLoadPromises[bookKey];
    }

    bookLoadPromises[bookKey] = (async () => {
        const response = await fetch(manifestEntry.path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`词书加载失败：${response.status}`);
        }

        const words = await response.json();
        hydrateWordListPhonetics(words);
        app.wordBooks[bookKey] = words;
        rebuildPhoneticCache();

        return words;
    })();

    try {
        return await bookLoadPromises[bookKey];
    } finally {
        delete bookLoadPromises[bookKey];
    }
}

function refreshEnglishVoices() {
    if (!('speechSynthesis' in window)) {
        englishVoices = [];
        renderVoiceOptions();
        return englishVoices;
    }

    const voices = window.speechSynthesis.getVoices();
    englishVoices = voices
        .filter(voice => /^en([-_]|$)/i.test(voice.lang))
        .sort((a, b) => {
            const score = voice => {
                let result = 0;
                if (voice.default) result += 100;
                if (/en-us/i.test(voice.lang)) result += 20;
                if (/premium|enhanced/i.test(voice.name)) result += 30;
                if (/samantha|alex|daniel|serena|victoria|ava|allison|karen|moira|tessa/i.test(voice.name)) result += 16;
                if (/compact|novelty/i.test(voice.name)) result -= 12;
                return result;
            };
            return score(b) - score(a);
        });
    renderVoiceOptions();
    return englishVoices;
}

function getVoiceId(voice) {
    return voice ? `${voice.name}::${voice.lang}::${voice.voiceURI}` : '';
}

function getSelectedSpeechVoiceId() {
    return localStorage.getItem(SPEECH_VOICE_KEY) || '';
}

function getPreferredEnglishVoice() {
    if (!englishVoices.length) {
        refreshEnglishVoices();
    }
    const selectedId = getSelectedSpeechVoiceId();
    if (selectedId) {
        const selectedVoice = englishVoices.find(voice => getVoiceId(voice) === selectedId);
        if (selectedVoice) return selectedVoice;
    }
    return englishVoices[0] || null;
}

function selectSpeechVoice(voiceId) {
    if (voiceId) {
        localStorage.setItem(SPEECH_VOICE_KEY, voiceId);
    } else {
        localStorage.removeItem(SPEECH_VOICE_KEY);
    }
    renderVoiceOptions();
}

function renderVoiceOptions() {
    const select = document.getElementById('voice-select');
    const info = document.getElementById('voice-info');
    if (!select || !info) return;

    const selectedId = getSelectedSpeechVoiceId();
    select.innerHTML = '<option value="">自动选择</option>';

    if (!('speechSynthesis' in window)) {
        info.textContent = '当前浏览器不支持系统朗读。';
        return;
    }

    if (!englishVoices.length) {
        info.textContent = '暂未读取到英文声音，稍后再打开此页或点试听。';
        return;
    }

    englishVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = getVoiceId(voice);
        option.textContent = `${voice.name} · ${voice.lang}${voice.default ? ' · 默认' : ''}`;
        select.appendChild(option);
    });

    if (selectedId && englishVoices.some(voice => getVoiceId(voice) === selectedId)) {
        select.value = selectedId;
    } else {
        select.value = '';
    }

    const activeVoice = getPreferredEnglishVoice();
    info.textContent = activeVoice
        ? `当前使用：${activeVoice.name} · ${activeVoice.lang}`
        : `已读取 ${englishVoices.length} 个英文声音`;
}

function previewSelectedVoice() {
    refreshEnglishVoices();
    speakWithBrowserTTS('This is a natural English sentence for your word list preview.', {
        rate: 0.9,
        pitch: 1
    });
}

function speakWithBrowserTTS(text, options = {}) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        return false;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getPreferredEnglishVoice();

    utterance.lang = voice?.lang || 'en-US';
    if (voice) {
        utterance.voice = voice;
    }
    utterance.rate = options.rate || 0.92;
    utterance.pitch = options.pitch || 1;
    utterance.volume = 1;

    synth.cancel();
    window.setTimeout(() => {
        synth.speak(utterance);
        if (synth.paused) {
            synth.resume();
        }
    }, 0);

    return true;
}

function stopCurrentPronunciation() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    if (pronunciationAudio) {
        pronunciationAudio.pause();
        pronunciationAudio.removeAttribute('src');
        pronunciationAudio.load();
    }

    const player = getPronunciationPlayer();
    if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
    }
}

function getPronunciationAudioUrl(word) {
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
}

function getPronunciationPlayer() {
    return document.getElementById('pronunciation-player');
}

function showPronunciationFallback(audioUrl) {
    const container = document.getElementById('pronunciation-fallback');
    const player = getPronunciationPlayer();
    if (!container || !player) return;

    player.src = audioUrl;
    player.volume = 1;
    player.muted = false;
    container.classList.remove('hidden');
}

function hidePronunciationFallback() {
    const player = getPronunciationPlayer();
    if (player) {
        player.removeAttribute('src');
        player.load();
    }
}

function updateVersionBadge() {
    const badge = document.getElementById('version-badge');
    if (badge) {
        badge.textContent = `版本 ${APP_VERSION}`;
    }
}

function hydrateWordListPhonetics(words) {
    if (!Array.isArray(words)) return;
    words.forEach(word => {
        hydrateWordPhonetic(word);
    });
}

function updateBookButtons(activeBookKey) {
    ['cet4', 'cet6', 'kaoyan'].forEach(key => {
        const btn = document.getElementById('btn-' + key);
        if (key === activeBookKey) {
            btn.className = 'btn btn-primary';
        } else {
            btn.className = 'btn btn-secondary';
        }
        btn.style.flex = '1';
    });
}

function setCustomWords(words, label = '') {
    currentBookKey = null;
    app.words = words;
    hydrateWordListPhonetics(app.words);
    updateBookButtons(null);
    document.getElementById('book-info').textContent = `已导入自定义词书（${app.words.length}词）`;
    document.getElementById('file-info').textContent = label || `已加载 ${app.words.length} 个单词`;
    updateListCount();
    switchHomeTab('study');
}

function persistAppState() {
    if (!app.words.length) return;
    localStorage.setItem(WORD_APP_STATE_KEY, JSON.stringify({
        words: app.words,
        wordsPerList: app.wordsPerList,
        currentBook: currentBookKey,
        currentListIdx: app.currentListIdx,
        currentWordIdx: app.currentWordIdx,
        score: app.score,
        wrongWords: app.wrongWords,
        mode: app.mode,
        updatedAt: Date.now()
    }));
    updateResumeButton();
}

function clearAppState() {
    localStorage.removeItem(WORD_APP_STATE_KEY);
    updateResumeButton();
}

function updateResumeButton() {
    const continueBtn = document.getElementById('continue-btn');
    const resumeInfo = document.getElementById('resume-info');
    const saved = localStorage.getItem(WORD_APP_STATE_KEY);

    if (!saved) {
        continueBtn.disabled = true;
        resumeInfo.textContent = '暂无可继续的学习记录';
        return;
    }

    try {
        const state = JSON.parse(saved);
        if (!Array.isArray(state.words) || state.words.length === 0) {
            throw new Error('invalid state');
        }

        const sourceLabel = state.currentBook && BOOK_NAMES[state.currentBook]
            ? BOOK_NAMES[state.currentBook]
            : '自定义词书';
        const listNo = (state.currentListIdx || 0) + 1;
        const wordNo = (state.currentWordIdx || 0) + 1;
        continueBtn.disabled = false;
        resumeInfo.textContent = `上次进度：${sourceLabel} · List ${listNo} · 第 ${wordNo} 词`;
    } catch (error) {
        continueBtn.disabled = true;
        resumeInfo.textContent = '学习记录不可用，继续学习功能已停用';
    }
}

function cleanImportedField(value) {
    return String(value || '')
        .replace(/^﻿/, '')
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();
}

function normalizePhonetic(phonetic) {
    const value = cleanImportedField(phonetic);
    if (!value) return '';
    if (
        (value.startsWith('/') && value.endsWith('/')) ||
        (value.startsWith('[') && value.endsWith(']'))
    ) {
        return value;
    }
    return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

function looksLikePhonetic(value) {
    const text = cleanImportedField(value);
    if (!text) return false;
    return (
        /^\/[^/]+\/$/.test(text) ||
        /^\[[^\]]+\]$/.test(text) ||
        /[ˈˌəɪʊɛæɑɔθðŋʃʒʧʤ]/.test(text)
    );
}

function looksLikeMeaning(value) {
    const text = cleanImportedField(value);
    if (!text) return false;
    return (
        /[一-鿿]/.test(text) ||
        /\b(?:n|v|vt|vi|adj|adv|prep|pron|num|int|conj|art|aux|phr)\./i.test(text)
    );
}

function isHeaderRow(fields) {
    const headerTokens = new Set([
        'word', 'words', 'term', 'name', 'english', 'en',
        'meaning', 'meanings', 'definition', 'definitions', 'translation',
        'phonetic', 'pronunciation', 'sound',
        '单词', '英文', '释义', '含义', '中文', '翻译', '音标'
    ]);
    return fields.every(field => headerTokens.has(field.toLowerCase()));
}

function createImportedWord(word, meaning, phonetic = '') {
    const normalizedWord = cleanImportedField(word);
    const normalizedMeaning = cleanImportedField(meaning);
    const normalizedPhonetic = normalizePhonetic(phonetic);
    if (!normalizedWord || !normalizedMeaning) return null;
    return normalizedPhonetic
        ? {word: normalizedWord, phonetic: normalizedPhonetic, meaning: normalizedMeaning}
        : {word: normalizedWord, meaning: normalizedMeaning};
}

function parseDelimitedFields(line, delimiter) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === delimiter && !inQuotes) {
            fields.push(current);
            current = '';
            continue;
        }
        current += char;
    }

    fields.push(current);
    return fields.map(cleanImportedField);
}

function createWordFromFields(fields) {
    const cleanedFields = fields.map(cleanImportedField).filter(Boolean);
    if (cleanedFields.length === 0) return {entry: null, ignored: true};
    if (isHeaderRow(cleanedFields)) return {entry: null, ignored: true};
    if (cleanedFields.length < 2) return {entry: null, ignored: false};

    const [word, second, ...rest] = cleanedFields;
    if (rest.length === 0) {
        return {entry: createImportedWord(word, second), ignored: false};
    }

    const third = rest[0];
    if (looksLikePhonetic(second)) {
        return {
            entry: createImportedWord(word, rest.join(' '), second),
            ignored: false
        };
    }

    if (looksLikePhonetic(third)) {
        return {
            entry: createImportedWord(word, second, third),
            ignored: false
        };
    }

    return {
        entry: createImportedWord(word, [second, ...rest].join(' ')),
        ignored: false
    };
}

function tryParseDelimitedLine(line) {
    if (/^\|?(?:\s*[-:]+\s*\|)+\s*[-:]+\s*\|?$/.test(line)) {
        return {entry: null, ignored: true};
    }

    if (line.includes('\t')) {
        return createWordFromFields(parseDelimitedFields(line, '\t'));
    }

    if (line.startsWith('|') || /\s\|\s/.test(line)) {
        const fields = line
            .split('|')
            .map(cleanImportedField)
            .filter(Boolean);
        return createWordFromFields(fields);
    }

    if (line.includes(',')) {
        return createWordFromFields(parseDelimitedFields(line, ','));
    }

    if (line.includes('，')) {
        return createWordFromFields(line.split('，'));
    }

    if (/[：:]/.test(line)) {
        const match = line.match(/^(.+?)\s*[：:]\s*(.+)$/);
        if (match) {
            return {
                entry: createImportedWord(match[1], match[2]),
                ignored: false
            };
        }
    }

    if (/\s[-–—]\s/.test(line)) {
        const match = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
        if (match) {
            return {
                entry: createImportedWord(match[1], match[2]),
                ignored: false
            };
        }
    }

    return null;
}

function parseLooseWordLine(line) {
    const phoneticMatch = line.match(/^(.+?)\s+(\/[^/]+\/|\[[^\]]+\])\s+(.+)$/);
    if (phoneticMatch) {
        return createImportedWord(phoneticMatch[1], phoneticMatch[3], phoneticMatch[2]);
    }

    const posMatch = line.match(/^([A-Za-z][A-Za-z0-9'().\-/ ]{0,80})\s+((?:n|v|vt|vi|adj|adv|prep|pron|num|int|conj|art|aux|phr)\..+)$/i);
    if (posMatch) {
        return createImportedWord(posMatch[1], posMatch[2]);
    }

    const chineseMeaningMatch = line.match(/^([A-Za-z][A-Za-z0-9'().\-/ ]{0,80})\s+(.+)$/);
    if (chineseMeaningMatch && looksLikeMeaning(chineseMeaningMatch[2])) {
        return createImportedWord(chineseMeaningMatch[1], chineseMeaningMatch[2]);
    }

    return null;
}

function parseTextWordLine(rawLine) {
    let line = String(rawLine || '').replace(/^﻿/, '').trim();
    if (!line) return {entry: null, ignored: true};

    if (/^(#|\/\/|;)/.test(line)) {
        return {entry: null, ignored: true};
    }

    line = line.replace(/^\d+\s*[.)、]\s*/, '').trim();
    line = line.replace(/^[*•·]\s+/, '').trim();
    if (!line) return {entry: null, ignored: true};

    const delimitedResult = tryParseDelimitedLine(line);
    if (delimitedResult) return delimitedResult;

    return {
        entry: parseLooseWordLine(line),
        ignored: false
    };
}

function dedupeImportedWords(words) {
    const mergedWords = [];
    const seen = new Map();
    let duplicateCount = 0;

    words.forEach(word => {
        const key = `${word.word.toLowerCase()}__${word.meaning}`;
        if (seen.has(key)) {
            duplicateCount++;
            const existing = mergedWords[seen.get(key)];
            if (!existing.phonetic && word.phonetic) {
                existing.phonetic = word.phonetic;
            }
            return;
        }
        seen.set(key, mergedWords.length);
        mergedWords.push({...word});
    });

    return {words: mergedWords, duplicateCount};
}

function parseTextWordBook(text) {
    const words = [];
    const skippedLines = [];
    let skippedCount = 0;

    text.split(/\r?\n/).forEach(rawLine => {
        const result = parseTextWordLine(rawLine);
        if (result.entry) {
            words.push(result.entry);
            return;
        }
        if (!result.ignored) {
            skippedCount++;
            if (skippedLines.length < 5) {
                skippedLines.push(rawLine.trim());
            }
        }
    });

    const deduped = dedupeImportedWords(words);
    return {
        words: deduped.words,
        skippedCount,
        skippedLines,
        duplicateCount: deduped.duplicateCount
    };
}

function parseJsonWordBook(text) {
    const words = [];
    const skippedLines = [];
    let skippedCount = 0;
    const parsed = JSON.parse(text);

    let source = parsed;
    if (!Array.isArray(source) && Array.isArray(parsed.words)) source = parsed.words;
    if (!Array.isArray(source) && Array.isArray(parsed.data)) source = parsed.data;

    if (Array.isArray(source)) {
        source.forEach(item => {
            let entry = null;
            if (typeof item === 'string') {
                entry = parseTextWordLine(item).entry;
            } else if (item && typeof item === 'object') {
                const meaningValue = Array.isArray(item.meanings)
                    ? item.meanings.join('；')
                    : item.meaning || item.definition || item.translation || item.cn || item.zh;
                entry = createImportedWord(
                    item.word || item.name || item.term || item.english || item.en,
                    meaningValue,
                    item.phonetic || item.usphone || item.ukphone || item.pronunciation
                );
            }

            if (entry) {
                words.push(entry);
            } else {
                skippedCount++;
                if (skippedLines.length < 5) {
                    skippedLines.push(JSON.stringify(item));
                }
            }
        });
    } else if (source && typeof source === 'object') {
        Object.entries(source).forEach(([word, value]) => {
            let entry = null;
            if (typeof value === 'string') {
                entry = createImportedWord(word, value);
            } else if (value && typeof value === 'object') {
                entry = createImportedWord(
                    word,
                    value.meaning || value.definition || value.translation || value.cn || value.zh,
                    value.phonetic || value.usphone || value.ukphone || value.pronunciation
                );
            }

            if (entry) {
                words.push(entry);
            } else {
                skippedCount++;
                if (skippedLines.length < 5) {
                    skippedLines.push(`${word}: ${JSON.stringify(value)}`);
                }
            }
        });
    }

    const deduped = dedupeImportedWords(words);
    return {
        words: deduped.words,
        skippedCount,
        skippedLines,
        duplicateCount: deduped.duplicateCount
    };
}

async function parseImportedFile(file) {
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const text = await file.text();
    if (ext === 'json') {
        return parseJsonWordBook(text);
    }
    return parseTextWordBook(text);
}

async function loadWordBooks() {
    const cached = localStorage.getItem(WORD_BOOKS_CACHE_KEY);
    if (cached) {
        try {
            const cachedManifest = JSON.parse(cached);
            if (isValidBookManifest(cachedManifest)) {
                app.bookManifest = cachedManifest;
                rebuildPhoneticCache();
                console.log('从缓存加载词书');
                showBookSelection();
                updateResumeButton();
                ensureBookLoaded('cet4').catch(() => {});
                return;
            }
            localStorage.removeItem(WORD_BOOKS_CACHE_KEY);
        } catch (e) {
            console.error('缓存解析失败');
            localStorage.removeItem(WORD_BOOKS_CACHE_KEY);
        }
    }

    try {
        const response = await fetch(WORD_BOOKS_MANIFEST_PATH, { cache: 'no-store' });
        app.bookManifest = await response.json();
        if (!isValidBookManifest(app.bookManifest)) {
            throw new Error('词书清单不完整');
        }
        LEGACY_WORD_BOOKS_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
        localStorage.setItem(WORD_BOOKS_CACHE_KEY, JSON.stringify(app.bookManifest));
        rebuildPhoneticCache();
        console.log('从网络加载词书清单并缓存');
        showBookSelection();
        updateResumeButton();
        ensureBookLoaded('cet4').catch(() => {});
    } catch (error) {
        console.error('加载词书失败:', error);
        document.getElementById('loading-area').innerHTML = '<p style="color:#d9534f;">加载词书失败，请刷新重试</p>';
    }
}

function showBookSelection() {
    document.getElementById('loading-area').classList.add('hidden');
    document.getElementById('book-selection').classList.remove('hidden');
    updateWrongCollectionInfo();
    updateForgottenCollectionInfo();
    switchHomeTab(app.homeTab || 'study');
    selectBook('cet4');
}

function switchHomeTab(tabName) {
    app.homeTab = tabName;
    document.querySelectorAll('.home-section').forEach(section => {
        section.classList.toggle('active', section.id === `home-tab-${tabName}`);
    });
    document.querySelectorAll('[data-home-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.homeTab === tabName);
    });
}

function clampWordsPerList(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(200, Math.max(5, parsed));
}

function getWordsPerListInputValue() {
    return clampWordsPerList(document.getElementById('words-per-list').value);
}

function saveWordsPerListPreference(value) {
    localStorage.setItem(WORDS_PER_LIST_KEY, String(clampWordsPerList(value)));
}

function loadWordsPerListPreference() {
    const storedValue = localStorage.getItem(WORDS_PER_LIST_KEY);
    if (!storedValue) return;

    app.wordsPerList = clampWordsPerList(storedValue);
    document.getElementById('words-per-list').value = app.wordsPerList;
}

function updateListCount(options = {}) {
    app.wordsPerList = getWordsPerListInputValue();
    if (options.persist) {
        saveWordsPerListPreference(app.wordsPerList);
    }
    const count = Math.ceil(getCurrentBookWordCount() / app.wordsPerList) || 0;
    document.getElementById('list-count').textContent = `将分为 ${count} 个List`;
}

document.getElementById('words-per-list').addEventListener('input', () => updateListCount({persist: true}));

document.getElementById('file-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const parsed = await parseImportedFile(file);
        if (parsed.words.length === 0) {
            const details = parsed.skippedLines.length
                ? `\n示例未识别行：\n${parsed.skippedLines.join('\n')}`
                : '';
            alert(`没有识别到可导入的单词。${details}`);
            return;
        }

        const summaryParts = [
            `已加载 ${parsed.words.length} 个单词：${file.name}`
        ];
        if (parsed.duplicateCount > 0) {
            summaryParts.push(`去重 ${parsed.duplicateCount} 条`);
        }
        if (parsed.skippedCount > 0) {
            summaryParts.push(`跳过 ${parsed.skippedCount} 行`);
        }

        setCustomWords(parsed.words, summaryParts.join('，'));

        if (parsed.skippedCount > 0) {
            console.log('导入时跳过的示例行:', parsed.skippedLines);
        }
    } catch (error) {
        console.error('导入词书失败:', error);
        alert(`导入失败：${error.message || '文件格式无法识别'}`);
    }
    e.target.value = '';
});

function selectBook(bookKey) {
    currentBookKey = bookKey;
    updateBookButtons(bookKey);
    document.getElementById('file-info').textContent = '';
    if (app.wordBooks[bookKey]) {
        app.words = [...app.wordBooks[bookKey]];
        hydrateWordListPhonetics(app.words);
        updateSelectedBookInfo();
    } else {
        app.words = [];
        updateSelectedBookInfo('加载中');
        ensureBookLoaded(bookKey)
            .then(words => {
                if (currentBookKey !== bookKey) return;
                app.words = [...words];
                hydrateWordListPhonetics(app.words);
                updateSelectedBookInfo();
                updateListCount();
            })
            .catch(error => {
                console.error('词书加载失败:', error);
                if (currentBookKey === bookKey) {
                    updateSelectedBookInfo('加载失败');
                }
            });
    }
    updateListCount();
}

function splitToLists() {
    app.allLists = [];
    for (let i = 0; i < app.words.length; i += app.wordsPerList) {
        app.allLists.push(app.words.slice(i, i + app.wordsPerList));
    }
}

function renderListPage() {
    const totalPages = Math.max(1, Math.ceil(app.allLists.length / LISTS_PER_PAGE));
    app.listPageIdx = Math.min(Math.max(app.listPageIdx, 0), totalPages - 1);

    const select = document.getElementById('list-page-select');
    select.innerHTML = '';
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const start = pageIdx * LISTS_PER_PAGE + 1;
        const end = Math.min((pageIdx + 1) * LISTS_PER_PAGE, app.allLists.length);
        const option = document.createElement('option');
        option.value = pageIdx;
        option.textContent = `第 ${pageIdx + 1}/${totalPages} 页 · List ${start}-${end}`;
        select.appendChild(option);
    }
    select.value = app.listPageIdx;

    document.getElementById('list-prev-btn').disabled = app.listPageIdx === 0;
    document.getElementById('list-next-btn').disabled = app.listPageIdx >= totalPages - 1;

    const startIdx = app.listPageIdx * LISTS_PER_PAGE;
    const endIdx = Math.min(startIdx + LISTS_PER_PAGE, app.allLists.length);
    document.getElementById('list-page-info').textContent = `当前显示 List ${startIdx + 1}-${endIdx}，共 ${app.allLists.length} 个List`;

    const grid = document.getElementById('list-grid');
    grid.innerHTML = '';
    app.allLists.slice(startIdx, endIdx).forEach((list, offset) => {
        const idx = startIdx + offset;
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `<div class="list-num">List ${idx + 1}</div><div class="list-count">${list.length}词</div>`;
        div.onclick = () => showListPreview(idx);
        grid.appendChild(div);
    });
}

function changeListPage(delta) {
    goToListPage(app.listPageIdx + delta);
}

function goToListPage(pageIdx) {
    app.listPageIdx = pageIdx;
    renderListPage();
}

async function showListSelection() {
    if (currentBookKey && getBookManifestEntry(currentBookKey) && !app.wordBooks[currentBookKey]) {
        try {
            updateSelectedBookInfo('加载中');
            const words = await ensureBookLoaded(currentBookKey);
            app.words = [...words];
            hydrateWordListPhonetics(app.words);
            updateSelectedBookInfo();
        } catch (error) {
            console.error('词书加载失败:', error);
            updateSelectedBookInfo('加载失败');
            alert('词书加载失败，请检查网络后重试');
            return;
        }
    }

    if (app.words.length === 0) {
        alert('请先选择或导入词书');
        return;
    }
    app.wordsPerList = getWordsPerListInputValue();
    saveWordsPerListPreference(app.wordsPerList);
    splitToLists();
    app.listPageIdx = Math.floor((app.selectedListIdx || 0) / LISTS_PER_PAGE);

    document.getElementById('setup-page').classList.add('hidden');
    document.getElementById('list-page').classList.remove('hidden');
    renderListPage();
}

async function showListPreview(listIdx) {
    app.selectedListIdx = listIdx;
    const list = shuffledWords(app.allLists[listIdx] || []);
    app.previewWords = list;
    const shouldMaskMeanings = document.getElementById('meaning-mask-toggle').checked;

    document.getElementById('list-page').classList.add('hidden');
    document.getElementById('preview-page').classList.remove('hidden');
    document.getElementById('preview-title').textContent = `List ${listIdx + 1} 预览`;
    updateForgottenCollectionInfo();

    const container = document.getElementById('preview-words');
    container.innerHTML = '';

    list.forEach((word, idx) => {
        const phoneticId = `ph-${listIdx}-${idx}`;
        const phonetic = hydrateWordPhonetic(word);
        const example = createUsageExample(word);
        const div = document.createElement('div');
        div.className = 'preview-word';
        div.innerHTML = `
            <div class="preview-main">
                <button class="preview-speak-btn" type="button" aria-label="播放 ${escapeHtml(word.word)} 的读音">🔊</button>
                <div>
                    <div class="pw-en">${escapeHtml(word.word)}</div>
                    <div class="pw-phonetic" id="${phoneticId}">${escapeHtml(phonetic || '...')}</div>
                </div>
            </div>
            <button class="forgot-toggle" type="button"></button>
            <div class="pw-cn preview-secret${shouldMaskMeanings ? ' masked' : ''}">${renderHighlightedMeaning(word.meaning)}</div>
            <div class="pw-example">
                <div class="pw-example-head">
                    <div class="pw-example-label">场景例句</div>
                    <button class="example-speak-btn" type="button" aria-label="朗读 ${escapeHtml(word.word)} 的例句">🔊</button>
                </div>
                <div class="pw-example-en">${highlightText(example.en, word.word, 'word-highlight')}</div>
                <div class="pw-example-zh preview-secret${shouldMaskMeanings ? ' masked' : ''}">${highlightText(example.zh, example.meaning, 'meaning-highlight')}</div>
            </div>
        `;
        div.querySelector('.preview-speak-btn').onclick = () => speakSpecificWord(word);
        div.querySelector('.example-speak-btn').onclick = () => speakWithBrowserTTS(example.en);
        const forgotButton = div.querySelector('.forgot-toggle');
        const renderForgotButton = () => {
            const forgotten = isForgottenWord(word);
            forgotButton.classList.toggle('active', forgotten);
            forgotButton.textContent = forgotten ? '已遗忘' : '未遗忘';
            forgotButton.setAttribute('aria-pressed', String(forgotten));
            forgotButton.disabled = forgotten;
        };
        forgotButton.onclick = () => {
            if (!isForgottenWord(word)) {
                setForgottenWord(word, true);
                renderForgotButton();
            }
        };
        renderForgotButton();
        div.querySelectorAll('.preview-secret').forEach(el => {
            el.onclick = event => revealPreviewMeaning(event.currentTarget);
        });
        container.appendChild(div);
    });

    const pendingLoads = list.map(async (word, idx) => {
        if (hydrateWordPhonetic(word)) return;
        const phonetic = await fetchPhonetic(word.word);
        if (phonetic) {
            word.phonetic = phonetic;
        }
        const phEl = document.getElementById(`ph-${listIdx}-${idx}`);
        if (phEl) {
            phEl.textContent = phonetic || '';
        }
    });
    Promise.allSettled(pendingLoads);
}

function startListLearning() {
    app.currentListIdx = app.selectedListIdx;
    app.currentWordIdx = 0;
    app.allLists[app.currentListIdx] = shuffledWords(app.allLists[app.currentListIdx] || []);
    app.score = 0;
    app.wrongWords = [];
    app.choiceLocked = false;
    persistAppState();
    showLearnPage();
}

function continueLearning() {
    const saved = localStorage.getItem(WORD_APP_STATE_KEY);
    if (saved) {
        try {
            const state = JSON.parse(saved);
            app.wordsPerList = clampWordsPerList(state.wordsPerList || 50);
            document.getElementById('words-per-list').value = app.wordsPerList;
            saveWordsPerListPreference(app.wordsPerList);
            app.words = Array.isArray(state.words) ? state.words : [];
            currentBookKey = state.currentBook || null;
            hydrateWordListPhonetics(app.words);

            if (!app.words.length) {
                throw new Error('学习记录缺少词书数据');
            }

            if (currentBookKey && BOOK_NAMES[currentBookKey]) {
                updateBookButtons(currentBookKey);
                document.getElementById('book-info').textContent = `继续学习：${BOOK_NAMES[currentBookKey]}（${app.words.length}词）`;
                document.getElementById('file-info').textContent = '';
                updateListCount();
            } else {
                setCustomWords(app.words, `继续学习：自定义词书（${app.words.length}词）`);
            }

            splitToLists();
            app.currentListIdx = state.currentListIdx || 0;
            app.currentWordIdx = state.currentWordIdx || 0;
            app.score = state.score || 0;
            app.wrongWords = Array.isArray(state.wrongWords) ? state.wrongWords : [];
            app.mode = state.mode === 'input' ? 'input' : 'select';
            app.choiceLocked = false;
            showLearnPage();
        } catch (error) {
            console.error('恢复学习记录失败:', error);
            clearAppState();
            alert('学习记录已损坏，已清除旧记录');
        }
    } else {
        alert('没有可继续的学习记录');
    }
}

function showLearnPage() {
    document.getElementById('setup-page').classList.add('hidden');
    document.getElementById('list-page').classList.add('hidden');
    document.getElementById('preview-page').classList.add('hidden');
    document.getElementById('result-page').classList.add('hidden');
    document.getElementById('stats-page').classList.add('hidden');
    document.getElementById('learn-page').classList.remove('hidden');
    showWord();
}

function showLearningStats() {
    document.getElementById('setup-page').classList.add('hidden');
    document.getElementById('list-page').classList.add('hidden');
    document.getElementById('preview-page').classList.add('hidden');
    document.getElementById('learn-page').classList.add('hidden');
    document.getElementById('result-page').classList.add('hidden');
    document.getElementById('stats-page').classList.remove('hidden');
    updateLearningStatsInfo();
}

function captureReviewReturnState(returnTarget = 'list') {
    if (currentBookKey === 'forgotten-review' || currentBookKey === 'wrong-collection') {
        return;
    }
    app.reviewReturnState = {
        returnTarget,
        bookKey: currentBookKey,
        words: [...app.words],
        wordsPerList: app.wordsPerList,
        selectedListIdx: app.selectedListIdx,
        listPageIdx: app.listPageIdx
    };
}

function restoreReviewReturnState() {
    if (!app.reviewReturnState) return false;
    const state = app.reviewReturnState;
    const returnTarget = state.returnTarget || 'list';
    currentBookKey = state.bookKey;
    app.words = Array.isArray(state.words) ? [...state.words] : [];
    app.wordsPerList = clampWordsPerList(state.wordsPerList || app.wordsPerList);
    app.selectedListIdx = state.selectedListIdx || 0;
    app.listPageIdx = state.listPageIdx || 0;
    document.getElementById('words-per-list').value = app.wordsPerList;
    hydrateWordListPhonetics(app.words);
    splitToLists();
    if (BOOK_NAMES[currentBookKey]) {
        updateBookButtons(currentBookKey);
        updateSelectedBookInfo();
    }
    updateListCount();
    app.reviewReturnState = null;
    return returnTarget;
}

function showSetup() {
    const reviewReturnTarget = (currentBookKey === 'forgotten-review' || currentBookKey === 'wrong-collection')
        ? restoreReviewReturnState()
        : false;

    if (reviewReturnTarget) {
        document.getElementById('learn-page').classList.add('hidden');
        document.getElementById('list-page').classList.add('hidden');
        document.getElementById('preview-page').classList.add('hidden');
        document.getElementById('result-page').classList.add('hidden');
        document.getElementById('stats-page').classList.add('hidden');

        if (reviewReturnTarget === 'review-home') {
            document.getElementById('setup-page').classList.remove('hidden');
            switchHomeTab('review');
            updateWrongCollectionInfo();
            updateForgottenCollectionInfo();
            return;
        }

        showListSelection();
        return;
    }
    document.getElementById('learn-page').classList.add('hidden');
    document.getElementById('list-page').classList.add('hidden');
    document.getElementById('preview-page').classList.add('hidden');
    document.getElementById('result-page').classList.add('hidden');
    document.getElementById('stats-page').classList.add('hidden');
    document.getElementById('setup-page').classList.remove('hidden');
    updateWrongCollectionInfo();
    updateForgottenCollectionInfo();
}

async function showWord() {
    if (app.currentListIdx >= app.allLists.length) {
        showResult();
        return;
    }
    const list = app.allLists[app.currentListIdx];
    if (app.currentWordIdx >= list.length) {
        showResult();
        return;
    }
    const word = app.allLists[app.currentListIdx][app.currentWordIdx];
    document.getElementById('list-progress').textContent = `List ${app.currentListIdx + 1}/${app.allLists.length}`;
    document.getElementById('word-progress').textContent = `${app.currentWordIdx + 1}/${app.allLists[app.currentListIdx].length}`;
    document.getElementById('score-display').textContent = `正确: ${app.score}`;
    document.getElementById('previous-word-btn').disabled = app.currentWordIdx <= 0;
    document.getElementById('word-text').textContent = word.word;
    showPronunciationFallback(getPronunciationAudioUrl(word.word));

    const renderToken = ++currentWordRenderToken;
    const phonetic = hydrateWordPhonetic(word);
    document.getElementById('word-phonetic').textContent = phonetic || '...';

    app.choiceLocked = false;
    document.getElementById('feedback-area').innerHTML = '';
    document.getElementById('answer-input').value = '';
    if (app.mode === 'select') {
        document.getElementById('choices-area').classList.remove('hidden');
        document.getElementById('input-area').classList.add('hidden');
        showChoices(word);
    } else {
        document.getElementById('choices-area').classList.add('hidden');
        document.getElementById('input-area').classList.remove('hidden');
    }
    updateModeButtons();
    persistAppState();

    if (!phonetic) {
        fetchPhonetic(word.word).then(fetchedPhonetic => {
            if (renderToken !== currentWordRenderToken) return;
            if (fetchedPhonetic) {
                word.phonetic = fetchedPhonetic;
            }
            document.getElementById('word-phonetic').textContent = fetchedPhonetic || '';
            persistAppState();
        });
    }
}

async function fetchPhonetic(word) {
    const cachedPhonetic = getCachedPhonetic(word);
    if (cachedPhonetic) return cachedPhonetic;

    if (typeof PHONETIC_DB !== 'undefined' && PHONETIC_DB[word]) {
        return setCachedPhonetic(word, PHONETIC_DB[word]);
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const proxyUrl = 'https://api.allorigins.win/get?url=';
        const youdaoUrl = encodeURIComponent(`https://dict.youdao.com/jsonapi?q=${word}&le=eng&dicts={"count":1,"dicts":[["ec"]]}`);

        const response = await fetch(proxyUrl + youdaoUrl, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();
        if (result.contents) {
            const data = JSON.parse(result.contents);
            if (data && data.ec && data.ec.word && data.ec.word[0]) {
                const w = data.ec.word[0];
                const usphone = w.usphone || w.phone;
                if (usphone) {
                    return setCachedPhonetic(word, `/${usphone}/`);
                }
            }
        }
    } catch (e) {
        console.log('有道API失败:', word, e.message);
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        if (data && data[0] && data[0].phonetics) {
            for (const p of data[0].phonetics) {
                if (p.text) {
                    return setCachedPhonetic(word, p.text);
                }
            }
        }
    } catch (e) {
        console.log('Free Dictionary API失败:', word);
    }

    return '';
}

function speakSpecificWord(word) {
    if (!word || !word.word) {
        return;
    }
    stopCurrentPronunciation();
    hidePronunciationFallback();

    if (!pronunciationAudio) {
        pronunciationAudio = new Audio();
        pronunciationAudio.preload = 'auto';
        pronunciationAudio.setAttribute('playsinline', '');
        pronunciationAudio.setAttribute('webkit-playsinline', '');
    }

    const audio = pronunciationAudio;
    const audioUrl = getPronunciationAudioUrl(word.word);
    const fallback = () => {
        cleanup();
        showPronunciationFallback(audioUrl);
        speakWithBrowserTTS(word.word);
    };

    const markStarted = () => {
        cleanup();
        hidePronunciationFallback();
    };

    const cleanup = () => {
        audio.onerror = null;
        audio.onplaying = null;
        window.clearTimeout(startTimeoutId);
    };

    const startTimeoutId = window.setTimeout(fallback, 1500);

    audio.onerror = fallback;
    audio.onplaying = markStarted;
    audio.volume = 1;
    audio.muted = false;
    audio.src = audioUrl;

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(fallback);
    }
}

function speakWord() {
    const currentList = app.allLists[app.currentListIdx];
    if (!currentList || !currentList[app.currentWordIdx]) {
        return;
    }
    speakSpecificWord(currentList[app.currentWordIdx]);
}

function updateModeButtons() {
    document.getElementById('mode-select').classList.toggle('active', app.mode === 'select');
    document.getElementById('mode-input').classList.toggle('active', app.mode === 'input');
}

function switchMode(mode) {
    app.mode = mode;
    persistAppState();
    showWord();
}

function showChoices(word) {
    const container = document.getElementById('choices-area');
    container.innerHTML = '';
    const choices = generateChoices(word);
    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'btn choice-btn';
        btn.textContent = choice;
        btn.disabled = app.choiceLocked;
        btn.onclick = () => checkChoice(choice, word);
        container.appendChild(btn);
    });
}

function generateChoices(word) {
    const choices = [word.meaning];
    const otherMeanings = app.words.filter(w => w.meaning !== word.meaning).map(w => w.meaning);
    while (choices.length < 5 && otherMeanings.length > 0) {
        const idx = Math.floor(Math.random() * otherMeanings.length);
        const m = otherMeanings.splice(idx, 1)[0];
        if (!choices.includes(m)) choices.push(m);
    }
    return choices.sort(() => Math.random() - 0.5);
}

function renderCorrectFeedback(word) {
    return `<p style="color:#5cb85c;font-size:18px;">✓ 正确！</p><p style="color:#666;font-size:14px;line-height:1.5;">完整意思：${word.meaning}</p>`;
}

function checkChoice(choice, word) {
    if (app.choiceLocked) return;
    const feedback = document.getElementById('feedback-area');
    if (choice === word.meaning) {
        app.score++;
        app.currentWordIdx++;
        persistAppState();
        feedback.innerHTML = renderCorrectFeedback(word);
        setTimeout(showWord, 1200);
    } else {
        app.choiceLocked = true;
        recordWrongWord(word);
        persistAppState();
        document.querySelectorAll('#choices-area .choice-btn').forEach(btn => {
            btn.disabled = true;
            if (btn.textContent === word.meaning) {
                btn.style.borderColor = '#5cb85c';
                btn.style.background = '#f1fbf1';
            }
        });
        feedback.innerHTML = `<p style="color:#d9534f;font-size:16px;">✗ 错误！正确意思：${word.meaning}</p><button class="btn btn-secondary" onclick="nextWord()">下一个</button>`;
    }
}

function checkInput() {
    const input = document.getElementById('answer-input').value.trim();
    const word = app.allLists[app.currentListIdx][app.currentWordIdx];
    const feedback = document.getElementById('feedback-area');

    const isCorrect = validateAnswer(input, word.meaning);

    if (isCorrect) {
        app.score++;
        app.currentWordIdx++;
        persistAppState();
        feedback.innerHTML = renderCorrectFeedback(word);
        setTimeout(showWord, 1200);
    } else {
        recordWrongWord(word);
        persistAppState();
        feedback.innerHTML = `<p style="color:#d9534f;font-size:16px;">✗ 错误！正确意思：${word.meaning}</p><button class="btn btn-secondary" onclick="nextWord()">下一个</button>`;
    }
}

function validateAnswer(userInput, correctMeaning) {
    if (!userInput) return false;

    const cleanAnswer = (str) => str.replace(/^(?:n|v|vt|vi|adj|adv|prep|pron|num|int|conj|art|aux|phr)\.(\s*)/i, '').trim();

    const answers = correctMeaning.split(/[，,、;；]/)
        .map(a => cleanAnswer(a))
        .filter(a => a);
    const inputs = userInput.split(/[，,、;；]/)
        .map(a => a.trim())
        .filter(a => a);

    if (inputs.length === 0) return false;

    if (inputs.length === 1) {
        return answers.some(a => a === inputs[0]);
    }

    return inputs.every(input => answers.includes(input));
}

function nextWord() {
    app.choiceLocked = false;
    app.currentWordIdx++;
    persistAppState();
    showWord();
}

function previousWord() {
    if (app.currentWordIdx <= 0) {
        return;
    }
    app.choiceLocked = false;
    app.currentWordIdx--;
    persistAppState();
    showWord();
}

function showResult() {
    clearAppState();
    if (currentBookKey === 'forgotten-review' && app.wrongWords.length === 0) {
        clearForgottenRecords(app.words);
    }
    document.getElementById('learn-page').classList.add('hidden');
    document.getElementById('result-page').classList.remove('hidden');
    document.getElementById('stats-page').classList.add('hidden');
    updateWrongCollectionInfo();
    updateForgottenCollectionInfo();
    const total = app.score + app.wrongWords.length;
    const accuracy = total > 0 ? ((app.score / total) * 100).toFixed(1) : 0;
    document.getElementById('accuracy').textContent = accuracy + '%';
    document.getElementById('score-text').textContent = `正确: ${app.score}  错误: ${app.wrongWords.length}`;
    const list = document.getElementById('wrong-words-list');
    list.innerHTML = '';
    app.wrongWords.slice(0, 20).forEach(w => {
        const div = document.createElement('div');
        div.className = 'wrong-word';
        div.textContent = `${w.word} - ${w.meaning}`;
        list.appendChild(div);
    });
    if (app.wrongWords.length === 0) {
        list.innerHTML = '<p style="color:#5cb85c;text-align:center;padding:20px;">太棒了，全部正确！🎉</p>';
    }
}

function reviewWrongWords() {
    if (app.wrongWords.length === 0) return;
    app.words = app.wrongWords;
    app.wrongWords = [];
    splitToLists();
    app.currentListIdx = 0;
    app.currentWordIdx = 0;
    app.score = 0;
    app.choiceLocked = false;
    persistAppState();
    showLearnPage();
}

function reviewCollectedWrongWords(returnTarget = 'list') {
    const words = getCollectedWrongWords();
    if (words.length === 0) {
        alert('暂无错题收录');
        return;
    }

    captureReviewReturnState(returnTarget);
    currentBookKey = 'wrong-collection';
    app.words = words.map(item => ({
        word: item.word,
        meaning: item.meaning,
        phonetic: item.phonetic || '',
        bookKey: item.bookKey,
        bookName: item.bookName
    }));
    app.wordsPerList = getWordsPerListInputValue();
    saveWordsPerListPreference(app.wordsPerList);
    hydrateWordListPhonetics(app.words);
    splitToLists();
    app.currentListIdx = 0;
    app.currentWordIdx = 0;
    app.score = 0;
    app.wrongWords = [];
    app.choiceLocked = false;
    persistAppState();
    showLearnPage();
}

function reviewForgottenWords(returnTarget = 'list') {
    const words = getCollectedForgottenWords();
    if (words.length === 0) {
        alert('暂无遗忘单词收录');
        return;
    }

    captureReviewReturnState(returnTarget);
    currentBookKey = 'forgotten-review';
    app.words = words.map(item => ({
        word: item.word,
        meaning: item.meaning,
        phonetic: item.phonetic || '',
        bookKey: item.bookKey,
        bookName: item.bookName
    }));
    app.wordsPerList = getWordsPerListInputValue();
    saveWordsPerListPreference(app.wordsPerList);
    hydrateWordListPhonetics(app.words);
    splitToLists();
    app.currentListIdx = 0;
    app.currentWordIdx = 0;
    app.score = 0;
    app.wrongWords = [];
    app.choiceLocked = false;
    persistAppState();
    showLearnPage();
}

document.getElementById('answer-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && app.mode === 'input') {
        checkInput();
    }
});

window.addEventListener('load', () => {
    updateVersionBadge();
    loadWordsPerListPreference();
    if ('speechSynthesis' in window) {
        refreshEnglishVoices();
        window.speechSynthesis.onvoiceschanged = refreshEnglishVoices;
        window.setTimeout(refreshEnglishVoices, 400);
        window.setTimeout(refreshEnglishVoices, 1200);
    }
    loadWordBooks();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
