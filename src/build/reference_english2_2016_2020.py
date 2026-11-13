"""Match reference answer wording to local options; unmatched items stay blank."""
import json,re,sys
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[2]
RANGES={2016:(0,9),2017:(9,17),2018:(17,26),2019:(26,37),2020:(37,46)}
EXPECTED={2016:20,2017:20,2018:20,2019:39,2020:20}
reference=Path(sys.argv[1])
norm=lambda s: re.sub(r'[^a-z0-9]','',s.lower())
with pymupdf.open(reference) as doc:
 for year,(start,end) in RANGES.items():
  pages=[p.get_text() for p in doc[start:end]]
  if not re.search(str(year)+r'\s*年考研英语二',pages[0]):raise ValueError(f'{year}: 参考章节年份不符。')
  matches=re.findall(r'(?m)^\s*(\d{1,2})\s*[.．、]\s*【答案】\s*([A-D])\s*[.．、]?\s*([^\n]{0,90})','\n'.join(pages))
  target=ROOT/f'src/bank/imported-eng2-{year}.json';d=json.loads(target.read_text(encoding='utf8'));used=set();updates=[]
  for num,letter,txt in matches:
   n=int(num)
   if not 1<=n<=40 or n in used:continue
   used.add(n);q=d['items'][n-1]
   if q['answer'] or q['steps']:raise ValueError(f'{year} 第 {n} 题已有修订，不覆盖。')
   word=re.split(r'[\u4e00-\u9fff【（(]',txt)[0].strip(' .：:;；')
   opts=dict(re.findall(r'(?m)^([A-G])\.\s*(.*)$',q['text']));match=[k for k,v in opts.items() if norm(word) and norm(word)==norm(v)]
   if len(match)!=1:continue
   updates.append((q,match[0],letter))
  if len(updates)!=EXPECTED[year]:raise ValueError(f'{year}: 匹配 {len(updates)} 题，与预期不符。')
  for q,answer,refletter in updates:
   q['answer']=answer;q['reviewReason']=f'非官方参考资料给出选项文字（参考字母 {refletter}），按本站题页选项文字匹配为 {answer}；答案与解析仍待核。'
  target.write_text(json.dumps(d,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
  print(f'{year}: {len(updates)} 个答案按文字匹配，均保持待核。')
