"""Match 2021 and 2023 cloze reference wording with local option text."""
import json,re,sys
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[2]
norm=lambda s: re.sub(r'[^a-z0-9]','',s.lower())
with pymupdf.open(Path(sys.argv[1])) as doc:
 for year,start,end in [(2021,46,49),(2023,87,89)]:
  pages=[p.get_text() for p in doc[start:end]]
  if not re.search(str(year)+r'\s*年考研英语二',pages[0]):raise ValueError('参考年份不符。')
  text='\n'.join(pages)
  pattern=r'(?m)^\s*(\d{1,2})\s*\.\s*(?:【答案】)?\s*([A-D])\s*\.?\s+([^\n]+)' if year==2021 else r'【(\d{1,2})】([A-D])\.\s*([^\u4e00-\u9fff\n]+)'
  found=re.findall(pattern,text)
  if [int(x[0]) for x in found]!=list(range(1,21)):raise ValueError(f'{year}: 参考答案序号不完整。')
  target=ROOT/f'src/bank/imported-eng2-{year}.json';d=json.loads(target.read_text(encoding='utf8'));updates=[]
  for num,refletter,word in found:
   q=d['items'][int(num)-1]
   if q['answer'] or q['steps']:raise ValueError(f'{year} 第 {num} 题已有答案，不覆盖。')
   options=dict(re.findall(r'(?m)^([A-G])\.\s*(.*)$',q['text']));hits=[k for k,v in options.items() if norm(word) and norm(word)==norm(v)]
   if len(hits)!=1:raise ValueError(f'{year} 第 {num} 题答案文字无法唯一匹配。')
   updates.append((q,hits[0],refletter))
  for q,letter,refletter in updates:
   q['answer']=letter;q['reviewReason']=f'非官方参考资料给出选项文字（参考字母 {refletter}），按本站题页选项文字匹配为 {letter}；答案与解析仍待核。'
  target.write_text(json.dumps(d,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
  print(f'{year}: 20 道完形题按选项文字匹配，保持待核。')
