#!/usr/bin/env python3
import urllib.request
import json
from urllib.parse import quote

def download_word_list(url, filename):
    print(f"下载 {filename}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as response:
        content = response.read().decode('utf-8')
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    return content

def parse_words(content):
    words = []
    for line in content.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 2:
            word = parts[0].strip()
            meaning = parts[1].strip()
            meaning = meaning.split('；')[0].split(';')[0].split(',')[0].split('。')[0].strip()
            if word and meaning:
                words.append({'word': word, 'meaning': meaning})
    return words

print("开始下载词书...")

base_url = "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/"

all_words = {}

# 下载四级
content = download_word_list(base_url + quote("3 四级-乱序.txt"), "cet4_raw.txt")
all_words["cet4"] = parse_words(content)
print(f"  -> 四级: {len(all_words['cet4'])} 词")

# 下载六级
content = download_word_list(base_url + quote("4 六级-乱序.txt"), "cet6_raw.txt")
all_words["cet6"] = parse_words(content)
print(f"  -> 六级: {len(all_words['cet6'])} 词")

# 下载考研
content = download_word_list(base_url + quote("5 考研-乱序.txt"), "kaoyan_raw.txt")
all_words["kaoyan"] = parse_words(content)
print(f"  -> 考研: {len(all_words['kaoyan'])} 词")

# 保存为JSON
with open("word_books.json", "w", encoding="utf-8") as f:
    json.dump(all_words, f, ensure_ascii=False, indent=2)

print(f"\n词书已保存为 word_books.json")
print(f"总计: {len(all_words['cet4']) + len(all_words['cet6']) + len(all_words['kaoyan'])} 词")