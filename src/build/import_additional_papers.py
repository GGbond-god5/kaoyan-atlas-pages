import json, os, re, sys
from pathlib import Path
import pymupdf
from review_questions import call_ai
ROOT=Path(__file__).resolve().parents[2]
BANK=ROOT.parent/'kaoyan-atlas'/'bank'/'eng-zhenti'
OUT=ROOT/'content'/'new-subjects'
OUT.mkdir(parents=True,exist_ok=True)

def compact(s):
    s=re.sub(r'https://\S+','',s)
    return ' '.join(s.split())

def make(kind):
    label='一' if kind=='eng' else '二'
    doc=pymupdf.open(BANK/f'2026年考研英语{label}.pdf')
    pages=[p.get_text() for p in doc]
    for n in range(1,11):
        path=OUT/f'{kind}-2026-p{n}.png'
        if not path.exists(): doc[n-1].get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(path)
    pg=pages[0]
    match=re.search(r'\(10\s+points\)',pg,re.I)
    if not match: raise ValueError('cloze instructions not found')
    passage=compact(pg[match.end():])
    opt=pages[1].split('Section')[0]
    cols={}
    for L in 'ABCD':
        values=re.findall(r'(?m)^\s*(?:\d{1,2}\.\s*)?'+L+r'\.\s*(.+?)\s*$',opt)
        if len(values)!=20: raise ValueError(f'{kind}: {L} has {len(values)} options')
        cols[L]=[compact(x) for x in values]
    batches=[]
    questions=[]
    for n in range(1,21):
        questions.append({'n':n,'text':f'第{n}空\n'+'\n'.join(f'{L}. {cols[L][n-1]}' for L in 'ABCD'),'passage':passage,'page':2,'kind':'完形','topic':'english-02','maxScore':.5})
    batches.append(questions[:])
    for j in range(4):
        paragraph=pages[2+j*2]
        paragraph=re.sub(r'^.*?Text\s*'+str(j+1)+r'\s*','',paragraph,flags=re.S|re.I)
        paragraph=compact(paragraph)
        raw=pages[3+j*2]
        qs=list(re.finditer(r'(?m)^\s*('+('|'.join(str(n) for n in range(21+j*5,26+j*5)))+r')\.\s*',raw))
        if len(qs)!=5: raise ValueError(f'{kind} text {j+1}: {len(qs)} questions')
        batch=[]
        for i,m in enumerate(qs):
            chunk=raw[m.end():qs[i+1].start() if i+1<len(qs) else len(raw)]
            opts=list(re.finditer(r'(?m)^\s*([A-D])\.\s*',chunk))
            if [o.group(1) for o in opts]!=list('ABCD'): raise ValueError(f'bad options {kind} {m.group(1)}')
            stem=compact(chunk[:opts[0].start()])
            choices=['%s. %s'%(o.group(1),compact(chunk[o.end():opts[k+1].start() if k+1<len(opts) else len(chunk)])) for k,o in enumerate(opts)]
            item={'n':int(m.group(1)),'text':stem+'\n'+'\n'.join(choices),'passage':paragraph,'page':4+j*2,'kind':'阅读','topic':'english-03','maxScore':2}
            batch.append(item); questions.append(item)
        batches.append(batch)
    results={}
    for batch in batches:
        response,_=call_ai('你是英语考试教师。仅按提供的文章和选项逐题作答，输出 JSON {"items":[{"n":题号,"answer":"A/B/C/D","steps":["中文解析，引用原文依据"]}]}。不得编造原文。',json.dumps(batch,ensure_ascii=False),'qwen3-vl-plus')
        for x in response['items']: results[x['n']]=x
    if set(results)!={q['n'] for q in questions}: raise ValueError('incomplete AI response')
    items=[]
    for q in questions:
        result=results[q['n']]
        if result['answer'] not in 'ABCD' or not result.get('steps'): raise ValueError('invalid AI result')
        n=q['n']
        items.append({'id':f'{kind}-2026-{n}','subject':'english' if kind=='eng' else 'english2','chapter':f'{kind}-2026','chapterTitle':f'英语{label} 2026 真题','kp':'','kpName':f'第{n}题（{q["kind"]}）','kind':q['kind'],'difficulty':'中','year':'2026','source':f'2026 年全国硕士研究生招生考试 英语（{label}）','isReal':True,'isMock':False,'text':q['text'],'passage':q['passage'],'answer':result['answer'],'steps':result['steps'],'maxScore':q['maxScore'],'sourcePdf':f'bank/eng-zhenti/2026年考研英语{label}.pdf','sourcePage':q['page'],'pageImage':f'content/new-subjects/{kind}-2026-p{q["page"]}.png','topicChapter':q['topic'],'topicTitle':q['kind'],'reviewStatus':'needs_review','reviewReason':'原卷文字层抽取；答案和解析由模型独立推断，尚未与权威答案或原页逐题复核。'})
    target=ROOT/'src'/'bank'/f'imported-{kind}-2026.json'
    target.write_text(json.dumps({'items':items},ensure_ascii=False,indent=1)+'\n',encoding='utf8')
    print(target.name,len(items),flush=True)

if __name__=='__main__':
    for kind in sys.argv[1:] or ['eng2','eng']: make(kind)
