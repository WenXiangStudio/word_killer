#!/usr/bin/env python3
import concurrent.futures
import json
import random
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote


BASE_URL = "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/"
BOOK_SOURCES = {
    "cet4": "3-CET4-顺序.json",
    "cet6": "4-CET6-顺序.json",
    "kaoyan": "5-考研-顺序.json",
}
ROOT = Path(__file__).resolve().parent
WORD_BOOKS_PATH = ROOT / "word_books.json"
BOOKS_DIR = ROOT / "books"
BOOKS_MANIFEST_PATH = ROOT / "books_manifest.json"
PHONETIC_DB_PATH = ROOT / "phonetic_db.js"
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0"}
MAX_WORKERS = 12
RANDOM_SEED = 42
WORD_CORRECTIONS = {
    "reservior": "reservoir",
}
EXCLUDED_WORDS = {
    "a.",
}
MANUAL_PHONETICS = {
    "certify": "/ˈsɝː.tə.faɪ/",
    "proximately": "/ˈprɑːk.sə.mət.li/",
}
BOOK_DISPLAY_NAMES = {
    "cet4": "四级词汇",
    "cet6": "六级词汇",
    "kaoyan": "考研词汇",
}


def normalize_phonetic(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if (text.startswith("/") and text.endswith("/")) or (text.startswith("[") and text.endswith("]")):
        return text
    return f"/{text.strip('/')}/"


def fetch_json(url):
    req = urllib.request.Request(url, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def download_book(source_name):
    url = BASE_URL + quote(source_name)
    print(f"下载 {source_name} ...")
    return fetch_json(url)


def extract_meanings(item):
    meanings = []

    translations = item.get("translations", [])
    for translation in translations:
        if isinstance(translation, str):
            meanings.append(translation.strip())
            continue

        if isinstance(translation, dict):
            text = str(translation.get("translation", "")).strip()
            pos = str(translation.get("type", "")).strip()
            if text:
                meanings.append(f"{pos}. {text}" if pos else text)

    legacy_trans = item.get("trans", [])
    for translation in legacy_trans:
        if isinstance(translation, str):
            meanings.append(translation.strip())
            continue

        if isinstance(translation, dict):
            text = str(translation.get("tran", "")).strip()
            pos = str(translation.get("pos", "")).strip()
            if text:
                meanings.append(f"{pos}. {text}" if pos else text)

    return [meaning for meaning in meanings if meaning]


def process_words(data):
    words = []
    for item in data:
        word = str(item.get("word") or item.get("name") or "").strip()
        lowered_word = word.lower()
        if lowered_word in EXCLUDED_WORDS:
            continue
        word = WORD_CORRECTIONS.get(lowered_word, word)
        if not word:
            continue

        phonetic = normalize_phonetic(
            item.get("phonetic")
            or item.get("usphone")
            or item.get("ukphone")
            or item.get("phone")
            or item.get("pronunciation")
        )

        meanings = extract_meanings(item)
        if not meanings:
            continue

        entry = {
            "word": word,
            "meaning": "；".join(meanings[:3]),
        }
        if phonetic:
            entry["phonetic"] = phonetic
        words.append(entry)
    return words


def load_existing_phonetics():
    phonetics = {}
    if not WORD_BOOKS_PATH.exists():
        return phonetics

    try:
        data = json.loads(WORD_BOOKS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return phonetics

    for book_words in data.values():
        for item in book_words:
            word = str(item.get("word") or "").strip().lower()
            phonetic = normalize_phonetic(item.get("phonetic"))
            if word and phonetic:
                phonetics[word] = phonetic
    return phonetics


def load_local_phonetic_db():
    phonetics = {}
    if not PHONETIC_DB_PATH.exists():
        return phonetics

    content = PHONETIC_DB_PATH.read_text(encoding="utf-8")
    for word, phonetic in re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', content):
        normalized = normalize_phonetic(phonetic)
        if normalized:
            phonetics[word.lower()] = normalized
    return phonetics


def lookup_youdao(word):
    query = quote('{"count":1,"dicts":[["ec"]]}')
    url = f"https://dict.youdao.com/jsonapi?q={quote(word)}&le=eng&dicts={query}"

    try:
        data = fetch_json(url)
    except urllib.error.HTTPError:
        return ""
    except Exception:
        return ""

    word_data = data.get("ec", {}).get("word", [{}])[0]
    return normalize_phonetic(word_data.get("usphone") or word_data.get("ukphone") or word_data.get("phone"))


def lookup_dictionary_api(word):
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{quote(word)}"

    try:
        data = fetch_json(url)
    except urllib.error.HTTPError:
        return ""
    except Exception:
        return ""

    if not isinstance(data, list) or not data:
        return ""

    entry = data[0]
    if isinstance(entry, dict):
        phonetic = normalize_phonetic(entry.get("phonetic"))
        if phonetic:
            return phonetic

        for item in entry.get("phonetics", []):
            phonetic = normalize_phonetic(item.get("text"))
            if phonetic:
                return phonetic

    return ""


def lookup_phonetic(word):
    phonetic = lookup_youdao(word)
    if phonetic:
        return phonetic
    return lookup_dictionary_api(word)


def enrich_missing_phonetics(words, phonetic_map):
    missing_words = sorted({item["word"] for item in words if not phonetic_map.get(item["word"].lower())})
    total = len(missing_words)

    if total == 0:
        print("所有单词都已存在本地音标，无需联网补全。")
        return phonetic_map

    print(f"开始补全缺失音标：{total} 个唯一单词")
    completed = 0
    found = 0
    started_at = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_word = {executor.submit(lookup_phonetic, word): word for word in missing_words}

        for future in concurrent.futures.as_completed(future_to_word):
            word = future_to_word[future]
            try:
                phonetic = future.result()
            except Exception:
                phonetic = ""

            completed += 1
            if phonetic:
                phonetic_map[word.lower()] = phonetic
                found += 1

            if completed == total or completed % 200 == 0:
                elapsed = time.time() - started_at
                print(
                    f"  -> 已处理 {completed}/{total}，"
                    f"找到 {found}，未找到 {completed - found}，耗时 {elapsed:.1f}s"
                )

    return phonetic_map


def apply_phonetics(words, phonetic_map):
    missing_after_apply = []
    for item in words:
        phonetic = phonetic_map.get(item["word"].lower())
        if phonetic:
            item["phonetic"] = phonetic
        else:
            item.pop("phonetic", None)
            missing_after_apply.append(item["word"])
    return missing_after_apply


def main():
    print("开始下载并构建带音标词书...")

    rng = random.Random(RANDOM_SEED)
    all_words = {}

    for key, source_name in BOOK_SOURCES.items():
        data = download_book(source_name)
        words = process_words(data)
        rng.shuffle(words)
        all_words[key] = words
        print(f"  -> {key}: {len(words)} 词")

    existing_phonetics = load_existing_phonetics()
    local_db_phonetics = load_local_phonetic_db()
    phonetic_map = {**local_db_phonetics, **existing_phonetics}
    phonetic_map.update({word.lower(): phonetic for word, phonetic in MANUAL_PHONETICS.items()})

    all_entries = [entry for words in all_words.values() for entry in words]
    print(f"当前已有音标缓存: {len(phonetic_map)}")
    phonetic_map = enrich_missing_phonetics(all_entries, phonetic_map)

    missing_words = []
    for key in all_words:
        missing_words.extend(apply_phonetics(all_words[key], phonetic_map))

    unique_missing = sorted(set(missing_words))
    if unique_missing:
        print(f"仍缺少音标: {len(unique_missing)} 个唯一单词")
        print("示例:", ", ".join(unique_missing[:20]))
    else:
        print("所有单词均已补全音标。")

    WORD_BOOKS_PATH.write_text(
        json.dumps(all_words, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    BOOKS_DIR.mkdir(exist_ok=True)
    manifest = {
        "version": "books-v1",
        "books": {}
    }

    for key, words in all_words.items():
        (BOOKS_DIR / f"{key}.json").write_text(
            json.dumps(words, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        manifest["books"][key] = {
            "name": BOOK_DISPLAY_NAMES[key],
            "count": len(words),
            "path": f"books/{key}.json",
        }

    BOOKS_MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"词书已写入 {WORD_BOOKS_PATH.name}")
    print(f"词书清单已写入 {BOOKS_MANIFEST_PATH.name}")
    print(f"总计: {sum(len(words) for words in all_words.values())} 词")


if __name__ == "__main__":
    main()
