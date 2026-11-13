import json, re
from pathlib import Path
p=Path('src/bank/imported-eng2-2025.json')
assert p.is_file(), '英语二 2025 题库未导入'
qs=json.loads(p.read_text(encoding='utf8'))['items']
assert len(qs)==48
assert [q['id'] for q in qs]==[f'eng2-2025-{i}' for i in range(1,49)]
assert sum(q['maxScore'] for q in qs)==100
assert sum(bool(q['answer']) for q in qs[:45])==45
assert qs[20]['reviewStatus']=='needs_review'
assert qs[23]['answer']=='D' and qs[23]['reviewStatus']=='source_checked'
assert qs[29]['answer']=='C' and qs[29]['reviewStatus']=='needs_review'
assert all(qs[n-1]['steps'] and qs[n-1]['reviewStatus']=='source_checked' for n in [22,23,24,25,26,27,28,29,31,32,33,34,35,36,37,38,39,40])
assert ''.join(qs[n-1]['answer'] for n in range(41,46)) == 'FCGBA'
assert all(qs[n-1]['steps'] and qs[n-1]['reviewStatus']=='source_checked' for n in range(41,46))
assert ''.join(q['answer'] for q in qs[:20]) == 'DACBDBACDAABDD BACCBC'.replace(' ', '')
assert all(q['steps'] and q['reviewStatus']=='source_checked' for q in qs[:20])
assert all(q['answer'] and q['steps'] and q['reviewStatus']=='needs_review' for q in qs[45:])
assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b", qs[46]['answer'])) <= 120
assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b", qs[47]['answer'])) <= 180
for a,b in [(1,20),(21,25),(26,30),(31,35),(36,40),(41,45)]:
 group=qs[a-1:b]
 assert len({q['passage'] for q in group})==1 and len(group[0]['passage'])>100
for q in qs[:40]:
 assert len(re.findall(r'(?m)^[ABCD]\. ',q['text']))==4, q['id']
assert all(Path(q['pageImage']).is_file() for q in qs)
assert '散步 68.30%' in qs[-1]['text']
print('2025 English II import structure passed; source and answers require review')
