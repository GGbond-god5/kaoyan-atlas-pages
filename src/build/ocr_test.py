# -*- coding: utf-8 -*-
"""Test DashScope vision transcription on one page."""
import base64, json, os, sys, urllib.request
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
KEY_FILE = Path(os.environ.get("USERPROFILE", str(Path.home()))) / ".claude" / "kaoyan-atlas-grading.key"
KEY = os.environ.get("DASHSCOPE_API_KEY", "").strip() or KEY_FILE.read_text(encoding="utf-8").strip()
MODEL = "qwen3-vl-plus"
API = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

pdf = ROOT / "bank/00.考研数学（一二三）09-25真题+解析+做题本/考研数学一历年真题做题本/考研数学一真题09-25/2023考研数学一真题.pdf"
d = fitz.open(pdf)
pg = d[0]
pix = pg.get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
tmp = ROOT / "content" / "_ocr_test.png"
pix.save(tmp)
im = Image.open(tmp).convert("RGB")
w, h = im.size
if w > 1500:
    im = im.resize((1500, round(h * 1500 / w)), Image.LANCZOS)
buf = ROOT / "content" / "_ocr_test.jpg"
im.save(buf, quality=85)
b64 = base64.b64encode(buf.read_bytes()).decode()
print("image", im.size, len(b64) // 1024, "KB")

prompt = """你是考研数学真题录入员。请把图片中能看清的题目逐题转录，并给出完整解答。
只输出 JSON，不要 markdown 代码块，格式：
{"items":[{"no":1,"kind":"选择题","text":"题干（选项逐行，公式用 \\\\( \\\\)）","answer":"最终答案","steps":["步骤1","步骤2","步骤3"]}]}
要求：
1. 公式必须用 LaTeX，不要用图片描述代替。
2. 选择题写出 A/B/C/D 四个选项；填空题写清题干。
3. 解答要完整，先写切入点，再写公式、代入、结果，不能只给思路。
4. 图片里没有的题不要编造；看不清的部分用“（图不清）”标出。
5. 只转录图片中出现的题。"""

body = {
    "model": MODEL,
    "messages": [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}},
        {"type": "text", "text": prompt},
    ]}],
    "temperature": 0.1,
    "max_tokens": 8000,
}
req = urllib.request.Request(API, data=json.dumps(body).encode(),
                             headers={"Authorization": "Bearer " + KEY,
                                      "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.load(r)
    content = data["choices"][0]["message"]["content"]
    print(content[:4000])
except Exception as e:
    print("ERROR", e)
