"""Import 2010–2023 English II papers, leaving all answers and text for review."""
import json,re,sys
from pathlib import Path
import pymupdf
from import_english2_2025 import clean
ROOT=Path(__file__).resolve().parents[2]
BANK=ROOT.parent/'kaoyan-atlas/bank/eng-zhenti'
IMAGES=ROOT/'content/new-subjects'
MATCHING={2011,2012,2014,2017,2019,2023}


def import_year(year):
    target=ROOT/f'src/bank/imported-eng2-{year}.json'
    if target.exists(): raise ValueError(f'{year}: 目标文件已存在，不覆盖。')
    with pymupdf.open(BANK/f'{year}年考研英语二.pdf') as doc:
        pages=[p.get_text() for p in doc]
        if len(pages)!=14 or str(year) not in pages[0]: raise ValueError(f'{year}: 年份或页数错误。')
        items=[]
        def add(n,kind,text,passage,page,score,topic):
            items.append({'id':f'eng2-{year}-{n}','subject':'english2','chapter':f'eng2-{year}',
                'chapterTitle':f'英语二 {year} 真题（整理版）','kp':'','kpName':f'第{n}题（{kind}）','kind':kind,
                'difficulty':'中','year':str(year),'source':f'{year} 年全国硕士研究生招生考试 英语（二）题目整理版',
                'isReal':True,'isMock':False,'text':text,'passage':passage,'answer':'','steps':[],
                'maxScore':score,'sourcePdf':f'bank/eng-zhenti/{year}年考研英语二.pdf','sourcePage':page,
                'pageImage':f'content/new-subjects/eng2-{year}-p{page}.png','topicChapter':topic,'topicTitle':kind,
                'reviewStatus':'needs_review','reviewReason':'原卷文字层自动提取，题干、选项、答案及解析均待对照原页复核。'})
        start=re.search(r'\(10\s+points\)',pages[0],re.I)
        if not start: raise ValueError(f'{year}: 完形正文未定位。')
        passage=clean(pages[0][start.end():]); opttext=pages[1].split('Section')[0]
        first_option=re.search(r'(?m)^\s*1\.\s*A\.',opttext)
        if not first_option: raise ValueError(f'{year}: 第1题选项未定位。')
        continuation=clean(re.sub(r'^\s*\d{1,2}\s*','',opttext[:first_option.start()]))
        if continuation: passage+=' '+continuation
        cols={c:[clean(x) for x in re.findall(r'(?m)^\s*(?:\d{1,2}\.\s*)?'+c+r'\.\s*(.+?)\s*$',opttext)] for c in 'ABCD'}
        if any(len(v)!=20 for v in cols.values()): raise ValueError(f'{year}: 完形选项不全。')
        for n in range(1,21):add(n,'完形',f'第{n}空\n'+'\n'.join(f'{c}. {cols[c][n-1]}' for c in 'ABCD'),passage,2,.5,'english-02')
        for i in range(4):
            passage=clean(re.sub(r'^.*?Text\s*'+str(i+1)+r'\s*','',pages[2+i*2],flags=re.S|re.I))
            raw=re.split(r'(?i)Part\s+B',pages[3+i*2],maxsplit=1)[0]
            ms=list(re.finditer(r'(?m)^\s*('+'|'.join(str(n) for n in range(21+i*5,26+i*5))+r')\.\s*',raw))
            if [int(m.group(1)) for m in ms]!=list(range(21+i*5,26+i*5)): raise ValueError(f'{year}: 阅读题号错误。')
            continuation=re.sub(r'^\s*\d{1,2}\s*','',raw[:ms[0].start()])
            continuation=clean(continuation)
            if continuation: passage+=' '+continuation
            for j,m in enumerate(ms):
                chunk=raw[m.end():ms[j+1].start() if j+1<len(ms) else len(raw)]
                opts=list(re.finditer(r'(?m)^\s*([A-D])\.\s*',chunk))
                if [x.group(1) for x in opts]!=list('ABCD'):raise ValueError(f'{year}: 第{m.group(1)}题选项错误。')
                choices=[f'{x.group(1)}. {clean(chunk[x.end():opts[k+1].start() if k+1<len(opts) else len(chunk)])}' for k,x in enumerate(opts)]
                add(int(m.group(1)),'阅读',clean(chunk[:opts[0].start()])+'\n'+'\n'.join(choices),passage,4+i*2,2,'english-03')
        raw=pages[10]+'\n'+pages[11]
        markers=list(re.finditer(r'(?m)^\s*(4[1-5])\.\s*',raw))
        if [int(m.group(1)) for m in markers]!=list(range(41,46)):raise ValueError(f'{year}: 新题型题号异常。')
        if year==2010:
            passage=clean(raw[:markers[0].start()]); choices='A. True\nB. False'
            for i,m in enumerate(markers):
                text=clean(raw[m.end():markers[i+1].start() if i+1<len(markers) else len(raw)])
                add(41+i,'新题型',f'判断下列陈述是否符合原文。\n{text}\n{choices}',passage,12,2,'english-04')
        else:
            oms=list(re.finditer(r'(?m)^\s*([A-G])\.\s*',raw))
            if [m.group(1) for m in oms]!=list('ABCDEFG'):raise ValueError(f'{year}: 新题型选项异常。')
            if year in MATCHING:
                passage=clean(raw[:oms[0].start()]); options=[]
                for i,m in enumerate(oms):
                    chunk=raw[m.end():oms[i+1].start() if i+1<len(oms) else len(raw)]
                    chunk=re.split(r'(?m)^\s*4[1-5]\.\s*',chunk)[0]
                    options.append(f'{m.group(1)}. {clean(chunk)}')
                choices='\n'.join(options)
                for i,m in enumerate(markers):
                    name=clean(re.split(r'(?m)^\s*[A-G]\.\s*',raw[m.end():])[0])
                    if not name: raise ValueError(f'{year}: 第{41+i}题匹配对象缺失。')
                    add(41+i,'新题型',f'将 {name} 与对应选项匹配。\n{choices}',passage,12,2,'english-04')
            else:
                options=[]
                for i,m in enumerate(oms):
                    chunk=raw[m.end():oms[i+1].start() if i+1<len(oms) else len(raw)]
                    if i==6:chunk=chunk.split('\n',1)[0]
                    options.append(f'{m.group(1)}. {clean(chunk)}')
                choices='\n'.join(options)
                passage=clean(raw[:oms[0].start()]+'\n'+raw[oms[-1].end()+len(raw[oms[-1].end():].split('\n',1)[0]):])
                for n in range(41,46):add(n,'新题型',f'为第 {n} 处选择合适的小标题。\n{choices}',passage,11 if markers[n-41].start()<len(pages[10]) else 12,2,'english-04')
        trans=re.split(r'\(15\s+points\)',pages[12],maxsplit=1,flags=re.I)
        if len(trans)!=2:raise ValueError(f'{year}: 翻译正文未定位。')
        split=re.split(r'Section\s+IV',trans[1],maxsplit=1,flags=re.I)
        if len(split)!=2:raise ValueError(f'{year}: 写作部分未定位。')
        add(46,'翻译','请将下列英文段落译成中文。\n'+clean(split[0]),'',13,15,'english-05')
        small=re.split(r'47\.\s*Directions:',pages[12],maxsplit=1,flags=re.I)
        large=re.split(r'48\.\s*Directions:',pages[13],maxsplit=1,flags=re.I)
        if len(small)!=2 or len(large)!=2:raise ValueError(f'{year}: 作文未定位。')
        add(47,'小作文',clean(small[1]),'',13,10,'english-06')
        add(48,'大作文',clean(large[1])+'\n图表请以原卷图片为准。','',14,15,'english-07')
        if len(items)!=48 or any(len(q['passage'])<100 for q in items[:45]):raise ValueError(f'{year}: 题目缺失或原文过短。')
        IMAGES.mkdir(parents=True,exist_ok=True)
        for n in range(1,15):doc[n-1].get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(IMAGES/f'eng2-{year}-p{n}.png')
        target.write_text(json.dumps({'items':items},ensure_ascii=False,indent=1)+'\n',encoding='utf8')
        print(f'{year}: 48 题，答案和解析待核。',flush=True)


if __name__=='__main__':
    for arg in sys.argv[1:]:import_year(int(arg))
