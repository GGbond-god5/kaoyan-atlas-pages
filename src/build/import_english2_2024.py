"""Import 2024 English II from the user's local original and reference PDF."""
import json
import re
from pathlib import Path
import pymupdf
from import_english2_2025 import clean

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT.parent / 'kaoyan-atlas/bank/eng-zhenti'
TARGET = ROOT / 'src/bank/imported-eng2-2024.json'
IMAGES = ROOT / 'content/new-subjects'


def main():
    if TARGET.exists():
        raise ValueError('目标文件已存在，禁止覆盖人工修订。')
    with pymupdf.open(BANK / '2024年考研英语二.pdf') as doc:
        pages = [page.get_text() for page in doc]
        if len(pages) != 14 or '2024' not in pages[0]:
            raise ValueError('原卷年份或页数不符。')
        questions = []
        def add(n, kind, text, passage, page, score, topic):
            questions.append({'id': f'eng2-2024-{n}', 'subject':'english2', 'chapter':'eng2-2024',
                'chapterTitle':'英语二 2024 真题','kp':'','kpName':f'第{n}题（{kind}）','kind':kind,
                'difficulty':'中','year':'2024','source':'2024 年全国硕士研究生招生考试 英语（二）',
                'isReal':True,'isMock':False,'text':text,'passage':passage,'answer':'','steps':[],
                'maxScore':score,'sourcePdf':'bank/eng-zhenti/2024年考研英语二.pdf', 'sourcePage':page,
                'pageImage':f'content/new-subjects/eng2-2024-p{page}.png','topicChapter':topic,'topicTitle':kind,
                'reviewStatus':'needs_review','reviewReason':'原卷文字层提取；题干、答案及解析待复核。'})
        marker = re.search(r'\(10\s+points\)', pages[0], re.I)
        if not marker: raise ValueError('完形正文无法定位。')
        cloze = clean(pages[0][marker.end():])
        columns = {c:[clean(x) for x in re.findall(r'(?m)^\s*(?:\d{1,2}\.\s*)?'+c+r'\.\s*(.+?)\s*$', pages[1].split('Section')[0])] for c in 'ABCD'}
        if any(len(v)!=20 for v in columns.values()): raise ValueError('完形选项数量错误。')
        for n in range(1,21):
            add(n,'完形',f'第{n}空\n'+'\n'.join(f'{c}. {columns[c][n-1]}' for c in 'ABCD'),cloze,2,.5,'english-02')
        for i in range(4):
            passage=clean(re.sub(r'^.*?Text\s*'+str(i+1)+r'\s*','',pages[2+i*2],flags=re.S|re.I))
            raw=pages[3+i*2].split('Part  B',1)[0]
            matches=list(re.finditer(r'(?m)^\s*('+'|'.join(str(n) for n in range(21+i*5,26+i*5))+r')\.\s*',raw))
            if [int(m.group(1)) for m in matches]!=list(range(21+i*5,26+i*5)): raise ValueError('阅读题号错误。')
            for j,m in enumerate(matches):
                chunk=raw[m.end():matches[j+1].start() if j+1<len(matches) else len(raw)]
                opts=list(re.finditer(r'(?m)^\s*([A-D])\.\s*',chunk))
                if [x.group(1) for x in opts]!=list('ABCD'): raise ValueError(f'第 {m.group(1)} 题选项错误。')
                choices=[f'{x.group(1)}. {clean(chunk[x.end():opts[k+1].start() if k+1<len(opts) else len(chunk)])}' for k,x in enumerate(opts)]
                add(int(m.group(1)),'阅读',clean(chunk[:opts[0].start()])+'\n'+'\n'.join(choices),passage,4+i*2,2,'english-03')
        passage=clean(pages[10]+'\n'+pages[11].split('\nA.',1)[0])
        option_raw=pages[11][pages[11].index('\nA.'):]
        markers=list(re.finditer(r'(?m)^\s*([A-G])\.\s*',option_raw))
        if [m.group(1) for m in markers]!=list('ABCDEFG'): raise ValueError('匹配题选项不完整。')
        options=[]
        for i,m in enumerate(markers):
            text=option_raw[m.end():markers[i+1].start() if i+1<len(markers) else len(option_raw)]
            text=re.split(r'(?m)^\s*4[1-5]\.\s*',text)[0]
            options.append(f'{m.group(1)}. {clean(text)}')
        for n,name in enumerate(['Sue Rexford','Sara Harberson','Katie Kelley','Mayghin Levine','Erica Gwyn'],41):
            add(n,'新题型',f'将 {name} 的观点与选项匹配。\n'+'\n'.join(options),passage,12,2,'english-04')
        trans=re.split(r'\(15\s+points\)',pages[12],maxsplit=1,flags=re.I)
        if len(trans)!=2 or 'Section  IV' not in trans[1]: raise ValueError('翻译部分无法定位。')
        add(46,'翻译','请将下列英文段落译成中文。\n'+clean(trans[1].split('Section  IV',1)[0]),'',13,15,'english-05')
        small=pages[12].split('47. Directions:',1)[1]
        add(47,'小作文',clean(small),'',13,10,'english-06')
        large=pages[13].split('48. Directions:',1)[1]
        add(48,'大作文',clean(large)+'\n图表数据：提升了动手能力 84.80%；学习了相关知识 91.30%；提升了合作能力 32.60%；感觉到心情舒畅 54.40%。','',14,15,'english-07')
        if [x['id'] for x in questions]!=[f'eng2-2024-{n}' for n in range(1,49)]: raise ValueError('题号不完整。')
        with pymupdf.open(BANK/'2024年英语二真题解析.pdf') as reference:
            texts=[p.get_text() for p in reference]
        ranges=re.findall(r'(?:1-5|6-10|11-15|16-20)\s*[:：]\s*([A-D]{5})', texts[2])
        groups=[re.search(r'【参考答案】\s*([A-D]{5})',texts[i]) for i in [5,7,9,11]]
        match=re.search(r'【参考答案】\s*41-45\s*[:：]\s*([A-G]{5})',texts[14])
        if len(ranges)!=4 or any(not x for x in groups) or not match: raise ValueError('参考答案抽取不完整。')
        answers=''.join(ranges)+''.join(x.group(1) for x in groups)+match.group(1)
        for q,answer in zip(questions,answers):
            if not re.search(r'(?m)^'+answer+r'\. ',q['text']): raise ValueError(f'{q["id"]} 答案不在选项内。')
            q['answer']=answer; q['reviewReason']='答案取自本地非官方参考资料，题干、答案和解析待逐题复核。'
        IMAGES.mkdir(parents=True,exist_ok=True)
        for n in range(1,15): doc[n-1].get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(IMAGES/f'eng2-2024-p{n}.png')
        TARGET.write_text(json.dumps({'items':questions},ensure_ascii=False,indent=1)+'\n',encoding='utf8')
        print(f'导入 {len(questions)} 题；45 道附非官方参考答案，全部待核。')


if __name__=='__main__': main()
