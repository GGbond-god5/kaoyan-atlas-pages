import json,re
from pathlib import Path
for year in range(2010,2024):
 p=Path(f'src/bank/imported-eng2-{year}.json')
 assert p.is_file(), f'{year} 英语二未导入'
 q=json.loads(p.read_text(encoding='utf8'))['items']
 assert [x['id'] for x in q]==[f'eng2-{year}-{i}' for i in range(1,49)]
 assert sum(x['maxScore'] for x in q)==100
 if year not in (2017,2018,2019,2020,2021,2022,2023):
  assert all(x['reviewStatus']=='needs_review' for x in q)
  assert all(not x['steps'] for x in q)
 if year==2022:
  assert all(x['answer'] for x in q[:45]) and q[24]['answer']=='C'
  assert q[1]['answer']=='B' and q[7]['answer']=='C'
  assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2023:
  assert sum(bool(x['answer']) for x in q)==48
  assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[:20])
  assert ''.join(x['answer'] for x in q[20:25])=='ABBCD'
  assert ''.join(x['answer'] for x in q[40:45])=='DFBAG'
  assert ''.join(x['answer'] for x in q[25:40])=='DACBDCDAABACDBA'
  assert all(x['steps'] and x['reviewStatus']=='source_checked' for x in q[20:45])
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2021:
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert ''.join(x['answer'] for x in q[20:45])=='CBADC BCCAB ABCCA BAADB EDFAB'.replace(' ', '')
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2020:
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert ''.join(x['answer'] for x in q[20:45])=='ADBCD CDBDA DDADB DABCB EFDAC'.replace(' ', '')
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2019:
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert ''.join(x['answer'] for x in q[20:45])=='BACAC CCADB ABDCD DDBBA BEDAG'.replace(' ', '')
  assert 'Gurner' in q[44]['text']
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2018:
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert ''.join(x['answer'] for x in q[20:45])=='BDACC CAACC BCDAD ADDBB AFEBD'.replace(' ', '')
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2017:
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='source_checked' for x in q[:45])
  assert ''.join(x['answer'] for x in q[20:45])=='ABCDB BDDCA CDADA BDCDB EAGBF'.replace(' ', '')
  assert all(x['answer'] and x['steps'] and x['reviewStatus']=='needs_review' for x in q[45:])
  assert 80 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[46]['answer'])) <= 120
  assert 120 <= len(re.findall(r"\b[A-Za-z]+(?:['’-][A-Za-z]+)*\b",q[47]['answer'])) <= 180
 elif year==2016:
  assert sum(bool(x['answer']) for x in q)==(39 if year==2019 else 20)
  assert all(x['answer'] for x in q[:20])
 else:
  assert all(not x['answer'] for x in q)
 assert all(len(re.findall(r'(?m)^[ABCD]\. ',x['text']))==4 for x in q[:40])
 for a,b in [(1,20),(21,25),(26,30),(31,35),(36,40),(41,45)]:
  x=q[a-1:b];assert len({i['passage'] for i in x})==1 and len(x[0]['passage'])>100
 for x in q[40:45]:
  assert len(re.findall(r'(?m)^[A-G]\. ',x['text']))==(2 if year==2010 else 7)
 if year==2011:
  assert 'Terence Stephenson agreed that' in q[41]['text']
  assert 'A Department of Health spokesperson proposed that' in q[44]['text']
  assert 'licensed to drive on public roads' in q[0]['passage']
 if year==2023:
  assert '330 million visitors per year' in q[25]['passage']
  assert 'getting up off the couch' in q[35]['passage']
  assert 'the back burner' in q[0]['passage']
 if year==2022:
  assert 'Many people believe they can’t retire' in q[25]['passage']
 assert all(Path(x['pageImage']).is_file() for x in q)
print('2010–2023 English II paper structure and review states passed')
