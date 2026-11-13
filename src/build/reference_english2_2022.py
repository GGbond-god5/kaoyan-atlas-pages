"""Attach a local 2022 answer list only after checking every option's wording."""
import json,re
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[2]
source=ROOT.parent/'kaoyan-atlas/bank/eng-zhenti/2022年英语二真题解析.pdf'
target=ROOT/'src/bank/imported-eng2-2022.json'
with pymupdf.open(source) as doc: text='\n'.join(doc[i].get_text() for i in range(2))
answers=re.findall(r'(?m)^\s*(\d{1,2})\.\s*\[([A-G])\]\s*([^\n]+)',text)
if [int(n) for n,_,_ in answers]!=list(range(1,46)): raise ValueError('参考答案题号不完整。')
d=json.loads(target.read_text(encoding='utf8'))
for n,letter,ref in answers:
 n=int(n);q=d['items'][n-1]
 if q['answer'] or q['steps']:raise ValueError(f'第 {n} 题已有内容，不覆盖。')
 opts=dict(re.findall(r'(?m)^([A-G])\.\s*(.*)$',q['text']))
 norm=lambda s: re.sub(r'[^a-z0-9]','',s.lower())
 if n==25:
  if letter!='A' or 'market' not in ref.lower() or 'market' not in opts.get('C','').lower():raise ValueError('第 25 题冲突与预期不一致。')
  letter='C';reason='参考资料中 market prospects 为 A，本地题页对应 C；选项顺序可能不同，暂记 C，待核。'
 else:
  a,b=norm(ref),norm(opts.get(letter,''))
  if not a or not b or not (a in b or b in a):raise ValueError(f'第 {n} 题答案文字不一致。')
  reason='参考答案来自本地非官方资料，选项文字已比对；答案和解析仍待逐题复核。'
 if n in (2,8):
  letter={2:'B',8:'C'}[n]
  reason='本地参考与另一份解析不一致；结合原文暂采用 '+letter+'，仍须复核。'
 q['answer']=letter;q['reviewReason']=reason
# Validate all entries before writing any changes.
target.write_text(json.dumps(d,ensure_ascii=False,indent=1)+'\n',encoding='utf8')
print('2022 年 45 个参考答案已比对选项文字；第 25 题冲突保留待核。')
