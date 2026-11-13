"""Import 2025 English II from the local original paper; answers remain unverified."""
import json
import re
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / 'kaoyan-atlas/bank/eng-zhenti/2025年考研英语二.pdf'
TARGET = ROOT / 'src/bank/imported-eng2-2025.json'
IMAGES = ROOT / 'content/new-subjects'
REFERENCE = SOURCE.parent / '2025考研英语真题和答案【完整版】' / '2025考研英语二真题及答案' / '版本二' / '2025年全国硕士研究生招生考试英语（二）试题参考答案 （缺T1&T4）_20241221205349.pdf'


def clean(text):
    text = re.sub(r'https://\S+', '', text)
    return ' '.join(text.split())


def apply_reference(items):
    with pymupdf.open(REFERENCE) as doc:
        text = '\n'.join(page.get_text() for page in doc)
    answers = {int(n): letter for n, letter in re.findall(r'(\d+)[.、]\s*【答案】\s*\[([A-G])\]', text)}
    expected = set(range(1, 21)) | set(range(26, 36)) | set(range(41, 46))
    if set(answers) != expected:
        raise ValueError('参考答案题号不完整或超出已知范围。')
    for n, letter in answers.items():
        q = items[n-1]
        if not re.search(r'(?m)^' + letter + r'\. ', q['text']):
            raise ValueError(f'第 {n} 题参考答案不在选项内。')
        q['answer'] = letter
        q['reviewReason'] = '答案取自聚创考研参考答案，题干、选项及答案尚需逐题复核；解析缺失。'
    items[-1]['text'] += '\n图表数据：看电视 90.80%；散步 68.30%；养花 34.70%；阅读 31.80%；下棋 18.40%。'


def main():
    if TARGET.exists():
        raise ValueError('目标文件已存在，禁止覆盖人工修订。')
    doc = pymupdf.open(SOURCE)
    if len(doc) != 14 or '2025' not in doc[0].get_text():
        raise ValueError('原卷页数或年份不符。')
    pages = [p.get_text() for p in doc]
    items = []

    def add(n, kind, text, passage, page, score, topic):
        items.append({'id': f'eng2-2025-{n}', 'subject': 'english2', 'chapter': 'eng2-2025',
                      'chapterTitle': '英语二 2025 真题', 'kp': '', 'kpName': f'第{n}题（{kind}）',
                      'kind': kind, 'difficulty': '中', 'year': '2025', 'source': '2025 年全国硕士研究生招生考试 英语（二）',
                      'isReal': True, 'isMock': False, 'text': text, 'passage': passage,
                      'answer': '', 'steps': [], 'maxScore': score, 'sourcePdf': 'bank/eng-zhenti/2025年考研英语二.pdf',
                      'sourcePage': page, 'pageImage': f'content/new-subjects/eng2-2025-p{page}.png',
                      'topicChapter': topic, 'topicTitle': kind, 'reviewStatus': 'needs_review',
                      'reviewReason': '原卷文字层提取；题干和选项需与原页复核，答案和解析尚未核对。'})

    match = re.search(r'\(10\s+points\)', pages[0], re.I)
    if not match:
        raise ValueError('未找到完形填空正文。')
    cloze = clean(pages[0][match.end():])
    columns = {}
    for letter in 'ABCD':
        columns[letter] = [clean(x) for x in re.findall(r'(?m)^\s*(?:\d{1,2}\.\s*)?' + letter + r'\.\s*(.+?)\s*$', pages[1].split('Section')[0])]
        if len(columns[letter]) != 20:
            raise ValueError(f'{letter} 选项数不为 20。')
    for n in range(1, 21):
        add(n, '完形', f'第{n}空\n' + '\n'.join(f'{c}. {columns[c][n-1]}' for c in 'ABCD'), cloze, 2, .5, 'english-02')
    for i in range(4):
        passage = clean(re.sub(r'^.*?Text\s*' + str(i+1) + r'\s*', '', pages[2+i*2], flags=re.S | re.I))
        raw = pages[3+i*2]
        matches = list(re.finditer(r'(?m)^\s*(' + '|'.join(str(n) for n in range(21+i*5, 26+i*5)) + r')\.\s*', raw))
        if [int(m.group(1)) for m in matches] != list(range(21+i*5, 26+i*5)):
            raise ValueError(f'阅读 {i+1} 题号异常。')
        for j,m in enumerate(matches):
            chunk = raw[m.end():matches[j+1].start() if j+1<len(matches) else len(raw)]
            options = list(re.finditer(r'(?m)^\s*([A-D])\.\s*', chunk))
            if [o.group(1) for o in options] != list('ABCD'):
                raise ValueError(f'第 {m.group(1)} 题选项异常。')
            choices = [f'{o.group(1)}. {clean(chunk[o.end():options[k+1].start() if k+1<len(options) else len(chunk)])}' for k,o in enumerate(options)]
            add(int(m.group(1)), '阅读', clean(chunk[:options[0].start()]) + '\n' + '\n'.join(choices), passage, 4+i*2, 2, 'english-03')
    new_raw = pages[10] + '\n' + pages[11]
    new_passage = clean(new_raw)
    option_matches = list(re.finditer(r'(?m)^\s*([A-G])\.\s*(.+?)\s*$', pages[10]))
    if [m.group(1) for m in option_matches] != list('ABCDEFG'):
        raise ValueError('新题型选项不完整。')
    choices = '\n'.join(f'{m.group(1)}. {clean(m.group(2))}' for m in option_matches)
    for n in range(41, 46):
        add(n, '新题型', f'为第 {n} 处选择合适的小标题。\n{choices}', new_passage, 11 if n == 41 else 12, 2, 'english-04')
    translation = re.split(r'\(15\s+points\)', pages[12], maxsplit=1, flags=re.I)
    if len(translation) != 2:
        raise ValueError('翻译正文无法定位。')
    add(46, '翻译', '请将下列英文段落译成中文。\n' + clean(translation[1]), '', 13, 15, 'english-05')
    writing = pages[13]
    small = writing.split('47. Directions:', 1)[1].split('Part  B', 1)[0]
    large = writing.split('48. Directions:', 1)[1]
    add(47, '小作文', clean(small), '', 14, 10, 'english-06')
    add(48, '大作文', clean(large), '', 14, 15, 'english-07')
    if [q['id'] for q in items] != [f'eng2-2025-{n}' for n in range(1,49)]:
        raise ValueError('题目不完整。')
    apply_reference(items)
    IMAGES.mkdir(parents=True, exist_ok=True)
    for n in range(1,15):
        doc[n-1].get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(IMAGES / f'eng2-2025-p{n}.png')
    TARGET.write_text(json.dumps({'items':items}, ensure_ascii=False, indent=1)+'\n', encoding='utf8')
    print(f'已导入 {len(items)} 题；均需核对原页和答案解析。')


if __name__ == '__main__':
    main()
