#!/usr/bin/env python3
import concurrent.futures
import json
import re
import time
import urllib.error
import urllib.request
import zipfile
from collections import OrderedDict
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parent
WORD_BOOKS_PATH = ROOT / "word_books.json"
BOOKS_DIR = ROOT / "books"
BOOKS_MANIFEST_PATH = ROOT / "books_manifest.json"
PHONETIC_DB_PATH = ROOT / "phonetic_db.js"
SOURCE_CACHE_DIR = ROOT / ".word_source_cache"

REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0"}
MAX_WORKERS = 12

CET4_SOURCE_URL = "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/3-CET4-顺序.json"
CET6_SUPPLEMENT_URL = "https://raw.githubusercontent.com/ismartcoding/endict/main/vocabulary/cet6.json"
KAOYAN_SOURCE_URL = "https://raw.githubusercontent.com/exam-data/NETEMVocabulary/master/netem_full_list.json"
ENDICT_ZIP_URL = "https://codeload.github.com/ismartcoding/endict/zip/refs/heads/main"

WORD_CORRECTIONS = {
    "reservior": "reservoir",
}
EXCLUDED_WORDS = {
    "a.",
}
MANUAL_PHONETICS = {
    "autobiographic": "/ˌɔː.təˌbaɪ.əˈɡræf.ɪk/",
    "certify": "/ˈsɝː.tə.faɪ/",
    "jeopardise": "/ˈdʒep.ər.daɪz/",
    "minimise": "/ˈmɪn.ə.maɪz/",
    "o'clock": "/əˈklɑːk/",
    "proceedings": "/prəˈsiː.dɪŋz/",
    "proximately": "/ˈprɑːk.sə.mət.li/",
    "scrutinise": "/ˈskruː.t̬ən.aɪz/",
    "subsidise": "/ˈsʌb.sə.daɪz/",
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


def fetch_bytes(url):
    req = urllib.request.Request(url, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch_bytes(url).decode("utf-8-sig"))


def cached_download(url, filename):
    SOURCE_CACHE_DIR.mkdir(exist_ok=True)
    path = SOURCE_CACHE_DIR / filename
    if path.exists() and path.stat().st_size > 0:
        if path.suffix.lower() != ".zip" or zipfile.is_zipfile(path):
            return path
        path.unlink()

    print(f"下载 {filename} ...")
    path.write_bytes(fetch_bytes(url))
    if path.suffix.lower() == ".zip" and not zipfile.is_zipfile(path):
        path.unlink(missing_ok=True)
        raise ValueError(f"{filename} 下载不完整或不是有效 zip")

    return path


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


def process_kylebing_words(data):
    words = []
    for item in data:
        word = str(item.get("word") or item.get("name") or "").strip()
        lowered_word = word.lower()
        if lowered_word in EXCLUDED_WORDS:
            continue
        word = WORD_CORRECTIONS.get(lowered_word, word)
        if not word:
            continue

        meanings = extract_meanings(item)
        if not meanings:
            continue

        entry = {
            "word": word,
            "meaning": "；".join(meanings[:3]),
        }
        phonetic = normalize_phonetic(
            item.get("phonetic")
            or item.get("usphone")
            or item.get("ukphone")
            or item.get("phone")
            or item.get("pronunciation")
        )
        if phonetic:
            entry["phonetic"] = phonetic
        words.append(entry)

    return deduplicate_words(words)


def split_meaning_segments(meaning):
    return [segment.strip() for segment in re.split(r"[；;]", meaning or "") if segment.strip()]


def word_entry_score(entry):
    meaning = entry.get("meaning", "")
    return (
        1 if entry.get("phonetic") else 0,
        len(split_meaning_segments(meaning)),
        len(meaning),
    )


def deduplicate_words(words):
    deduped = OrderedDict()
    duplicate_count = 0

    for entry in words:
        key = entry["word"].strip().lower()
        current = deduped.get(key)
        if not current:
            deduped[key] = entry
            continue

        duplicate_count += 1
        if word_entry_score(entry) > word_entry_score(current):
            deduped[key] = entry

    if duplicate_count:
        print(f"  -> 去重 {duplicate_count} 条重复词条")

    return list(deduped.values())


def load_existing_entries():
    entries = {}
    if not WORD_BOOKS_PATH.exists():
        return entries

    try:
        data = json.loads(WORD_BOOKS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return entries

    for book_words in data.values():
        for item in book_words:
            word = str(item.get("word") or "").strip()
            meaning = str(item.get("meaning") or "").strip()
            if word and meaning and word.lower() not in entries:
                entries[word.lower()] = {
                    "word": word,
                    "meaning": meaning,
                    **({"phonetic": item.get("phonetic")} if item.get("phonetic") else {}),
                }
    return entries


def load_existing_phonetics():
    return {
        word: normalize_phonetic(entry.get("phonetic"))
        for word, entry in load_existing_entries().items()
        if normalize_phonetic(entry.get("phonetic"))
    }


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


def load_endict_entries():
    zip_path = cached_download(ENDICT_ZIP_URL, "endict-main.zip")
    entries = {}

    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if not (name.startswith("endict-main/dict/") and name.endswith(".json")):
                continue

            for raw_line in zf.open(name):
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line.decode("utf-8"))
                except Exception:
                    continue

                word = str(item.get("word") or "").strip()
                if not word:
                    continue

                translations = []
                for translation in item.get("translation") or []:
                    text = str(translation).strip()
                    if text and not text.startswith("[网络]"):
                        translations.append(text)
                if not translations:
                    translations = [str(text).strip() for text in item.get("translation") or [] if str(text).strip()]
                if not translations:
                    continue

                key = word.lower()
                entry = {
                    "word": word,
                    "meaning": "；".join(translations[:3]),
                }
                phonetic = normalize_phonetic(item.get("phonetic"))
                if phonetic:
                    entry["phonetic"] = phonetic

                if key not in entries or word_entry_score(entry) > word_entry_score(entries[key]):
                    entries[key] = entry

    return entries


def apply_known_phonetic(entry, phonetic_map):
    phonetic = normalize_phonetic(entry.get("phonetic")) or phonetic_map.get(entry["word"].lower())
    if phonetic:
        entry["phonetic"] = phonetic
    else:
        entry.pop("phonetic", None)
    return entry


def add_unique(target, entry, phonetic_map):
    word = str(entry.get("word") or "").strip()
    meaning = str(entry.get("meaning") or "").strip()
    key = word.lower()
    if not word or not meaning or key in target:
        return

    target[key] = apply_known_phonetic(
        {
            "word": word,
            "meaning": meaning,
            **({"phonetic": entry.get("phonetic")} if entry.get("phonetic") else {}),
        },
        phonetic_map,
    )


def build_kaoyan_words(source_data, phonetic_map):
    rows = source_data.get("5530考研词汇词频排序表")
    if not isinstance(rows, list):
        raise ValueError("考研词表格式不符合预期")

    words = OrderedDict()
    for row in rows:
        word = str(row.get("单词") or "").strip()
        meaning = str(row.get("释义") or "").strip().replace("、", "；")
        add_unique(words, {"word": word, "meaning": meaning}, phonetic_map)

    return list(words.values())


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


def write_books(all_words):
    WORD_BOOKS_PATH.write_text(
        json.dumps(all_words, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    BOOKS_DIR.mkdir(exist_ok=True)
    manifest = {
        "version": "books-v2",
        "books": {}
    }

    for key, words in all_words.items():
        (BOOKS_DIR / f"{key}.json").write_text(
            json.dumps(words, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest["books"][key] = {
            "name": BOOK_DISPLAY_NAMES[key],
            "count": len(words),
            "path": f"books/{key}.json",
        }

    BOOKS_MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    print("开始下载并构建带音标词书...")

    existing_entries = load_existing_entries()
    local_db_phonetics = load_local_phonetic_db()
    existing_phonetics = {
        word: normalize_phonetic(entry.get("phonetic"))
        for word, entry in existing_entries.items()
        if normalize_phonetic(entry.get("phonetic"))
    }

    endict_entries = load_endict_entries()
    endict_phonetics = {
        word: normalize_phonetic(entry.get("phonetic"))
        for word, entry in endict_entries.items()
        if normalize_phonetic(entry.get("phonetic"))
    }
    phonetic_map = {**endict_phonetics, **local_db_phonetics, **existing_phonetics}
    phonetic_map.update({word.lower(): phonetic for word, phonetic in MANUAL_PHONETICS.items()})

    print("下载 CET4 整理版词表 ...")
    cet4 = process_kylebing_words(fetch_json(CET4_SOURCE_URL))
    cet4_map = OrderedDict()
    for entry in cet4:
        add_unique(cet4_map, entry, phonetic_map)
    all_words = {"cet4": list(cet4_map.values())}
    print(f"  -> cet4: {len(all_words['cet4'])} 词")

    print("下载 CET6 官方大纲增量词表 ...")
    cet6_map = OrderedDict(cet4_map)
    for word in fetch_json(CET6_SUPPLEMENT_URL):
        key = str(word).strip().lower()
        if key in cet6_map:
            continue
        entry = existing_entries.get(key) or endict_entries.get(key)
        if not entry:
            raise ValueError(f"CET6 词条缺少释义：{word}")
        add_unique(cet6_map, entry, phonetic_map)
    all_words["cet6"] = list(cet6_map.values())
    print(f"  -> cet6: {len(all_words['cet6'])} 词")

    print("下载 2024 考研英语大纲 5530 词频表 ...")
    all_words["kaoyan"] = build_kaoyan_words(fetch_json(KAOYAN_SOURCE_URL), phonetic_map)
    print(f"  -> kaoyan: {len(all_words['kaoyan'])} 词")

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

    write_books(all_words)

    print(f"词书已写入 {WORD_BOOKS_PATH.name}")
    print(f"词书清单已写入 {BOOKS_MANIFEST_PATH.name}")
    print(f"总计: {sum(len(words) for words in all_words.values())} 词")


if __name__ == "__main__":
    main()
