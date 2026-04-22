#!/usr/bin/env python3
import urllib.request
import json
import random
from urllib.parse import quote

def download_json(url, filename):
    print(f"下载 {filename}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        data = json.loads(response.read().decode('utf-8'))
    return data

def process_words(data):
    """处理JSON数据，提取单词、音标、释义"""
    words = []
    for item in data:
        word = item.get('name', '')
        phonetic = item.get('usphone', '') or item.get('ukphone', '')  # 美式音标优先
        
        # 提取释义
        trans = item.get('trans', [])
        meanings = []
        for t in trans:
            if isinstance(t, str):
                meanings.append(t)
            elif isinstance(t, dict):
                pos = t.get('pos', '')
                meaning = t.get('tran', '')
                if pos and meaning:
                    meanings.append(f"{pos}. {meaning}")
                elif meaning:
                    meanings.append(meaning)
        
        if word and meanings:
            words.append({
                'word': word,
                'phonetic': phonetic,
                'meaning': '；'.join(meanings[:3])  # 最多取3个释义
            })
    return words

print("开始下载JSON词书...")

base_url = "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/"

# 下载四级
print("\n下载四级词汇...")
cet4_data = download_json(base_url + quote("3-CET4-顺序.json"), "cet4.json")
cet4_words = process_words(cet4_data)
random.shuffle(cet4_words)  # 乱序
print(f"  -> 四级: {len(cet4_words)} 词")

# 下载六级
print("\n下载六级词汇...")
cet6_data = download_json(base_url + quote("4-CET6-顺序.json"), "cet6.json")
cet6_words = process_words(cet6_data)
random.shuffle(cet6_words)
print(f"  -> 六级: {len(cet6_words)} 词")

# 下载考研
print("\n下载考研词汇...")
kaoyan_data = download_json(base_url + quote("5-考研-顺序.json"), "kaoyan.json")
kaoyan_words = process_words(kaoyan_data)
random.shuffle(kaoyan_words)
print(f"  -> 考研: {len(kaoyan_words)} 词")

# 保存
all_words = {
    "cet4": cet4_words,
    "cet6": cet6_words,
    "kaoyan": kaoyan_words
}

with open("word_books.json", "w", encoding="utf-8") as f:
    json.dump(all_words, f, ensure_ascii=False, indent=2)

print(f"\n✅ 词书已保存为 word_books.json")
print(f"总计: {len(cet4_words) + len(cet6_words) + len(kaoyan_words)} 词")

# 显示示例
print("\n示例单词:")
for w in cet4_words[:3]:
    print(f"  {w['word']} {w['phonetic']} - {w['meaning'][:50]}...")
