import json,re
from pathlib import Path
p=Path('src/bank/imported-eng2-2024.json')
assert p.is_file(), '2024 英语二题库未导入'
q=json.loads(p.read_text(encoding='utf8'))['items']
assert [x['id'] for x in q]==[f'eng2-2024-{n}' for n in range(1,49)]
assert sum(x['maxScore'] for x in q)==100
assert all(x['reviewStatus']=='needs_review' for x in q[45:])
assert ''.join(x['answer'] for x in q[20:25])=='CCDAD'
assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[20:25])
assert ''.join(x['answer'] for x in q[25:40])=='AABDCCDBBBAADBD'
assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[25:40])
assert ''.join(x['answer'] for x in q[:20])=='CBADACBBDADABCCACDBD'
assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[:20])
assert all(x['answer'] and x['steps'] for x in q[45:])
assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
assert ''.join(x['answer'] for x in q[40:45])=='CEAGB'
assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[40:45])
assert all(len(re.findall(r'(?m)^[ABCD]\. ',x['text']))==4 for x in q[:40])
for a,b in [(1,20),(21,25),(26,30),(31,35),(36,40),(41,45)]:
 v=q[a-1:b]; assert len({x['passage'] for x in v})==1 and len(v[0]['passage'])>100
for x,name in zip(q[40:45],['Sue Rexford','Sara Harberson','Katie Kelley','Mayghin Levine','Erica Gwyn']):
 assert name in x['text'] and len(re.findall(r'(?m)^[A-G]\. ',x['text']))==7
assert 'old houses' in q[46]['text'] and q[46]['sourcePage']==13
assert '学习了相关知识 91.30%' in q[47]['text']
assert all(Path(x['pageImage']).is_file() for x in q)
print('2024 English II import structure passed; remaining answers require review')
