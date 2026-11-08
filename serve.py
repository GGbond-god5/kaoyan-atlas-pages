# -*- coding: utf-8 -*-
"""Local static server + AI grading proxy for the atlas.

Run:  py serve.py
Key:  DASHSCOPE_API_KEY env var, or %USERPROFILE%\\.claude\\kaoyan-atlas-grading.key
The key never reaches the browser.
"""
import base64
import json
import os
import re
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("ATLAS_PORT") or os.environ.get("PORT") or "8123")
PUBLIC = os.environ.get("ATLAS_PUBLIC") == "1"
BLOCKED = ("/bank/", "/bank.html", "/src/", "/content/", "/serve.py", "/api/grade", "/.claude/")
MODEL = os.environ.get("DASHSCOPE_MODEL", "qwen3-vl-plus")
API = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
KEY_FILE = Path(os.environ.get("USERPROFILE", str(Path.home()))) / ".claude" / "kaoyan-atlas-grading.key"


def api_key():
    key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if key:
        return key
    try:
        return KEY_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


SYSTEM = (
    "你是考研阅卷老师，熟悉考研英语、政治、数学与材料力学的评分标准。"
    "根据题目、参考答案、评分步骤和学生作答进行批改。"
    "不要编造题目中没有的信息；看不清或未作答的部分要明确指出。"
    "只输出一个 JSON，不要 markdown 代码块，字段固定为："
    '{"score": 数字, "level": "优秀/良好/合格/不合格", "comments": "2到4句总评", '
    '"missing": "缺失或错误的要点", "suggestions": "可操作的修改建议，分条用；分隔", '
    '"revised": "翻译/作文给润色后的范文或改译；其他题型留空字符串"}'
)

HINTS = {
    "小作文": "这是英语一小作文（应用文，10分）。按内容要点、格式与语域、语言准确性、连贯性评分；指出套话和语法错误，给出逐条修改建议与润色版。",
    "大作文": "这是英语一大作文（20分）。按内容（描述、解释、评论）、结构、语言丰富度、语法与拼写评分；指出模板化表达，给出逐条修改建议与润色版。",
    "翻译": "这是英语一翻译（10分）。逐句对照参考译文，指出误译、漏译、语序与用词问题，给出修改建议和参考改译。",
    "分析题": "这是政治分析题。按采分点给分，指出遗漏的原理与材料结合点，给出答题框架。",
    "计算题": "这是计算题。按步骤给分：思路、公式、代入、数值、单位、结论；指出第一处错误。",
    "证明题": "这是证明题。检查条件使用、逻辑链条与结论，按证明步骤给分。",
    "简答题": "这是简答题。按要点覆盖度与表述准确性给分。",
    "选择题": "这是客观选择题。核对所选答案与参考答案是否一致，解释正确项与主要干扰项，不要改判参考答案。",
    "单选题": "这是客观单选题。核对所选答案与参考答案是否一致，解释正确项与主要干扰项，不要改判参考答案。",
    "多选题": "这是客观多选题。核对所选组合是否与参考答案完全一致，解释漏选与错选，不要改判参考答案。",
    "阅读": "这是英语阅读题。核对所选答案，回文定位并解释正确项与干扰项，不要改判参考答案。",
    "完形": "这是英语完形填空。核对所选答案，说明上下文线索与词义辨析，不要改判参考答案。",
    "新题型": "这是英语新题型。核对所选答案，说明段落逻辑与衔接依据，不要改判参考答案。",
}


def grade(payload):
    key = api_key()
    if not key:
        return 503, {"error": "未配置 DASHSCOPE_API_KEY"}
    image = payload.get("image") or ""
    work = (payload.get("work") or "").strip()
    if image and (not image.startswith("data:image/") or len(image) > 16_000_000):
        return 400, {"error": "作答照片格式异常或过大"}
    selected = (payload.get("selected") or "").strip()
    if not image and not work and not selected:
        return 400, {"error": "请先在作答区写下答案，或上传作答照片"}
    kind = (payload.get("kind") or "").strip()
    steps = payload.get("steps") or []
    hint = HINTS.get(kind, "按题目要求与参考答案评分。")
    text = (
        f"题型：{kind}\n"
        f"科目：{payload.get('subject','')}\n"
        f"考点：{payload.get('kp','')}\n"
        f"题目：{payload.get('question','')}\n"
        f"参考答案：{payload.get('answer','')}\n"
        f"学生所选：{payload.get('selected','') or '（未选）'}\n"
        f"学生作答：{work or '（仅上传照片）'}\n"
        "评分步骤：\n" + "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps)) +
        f"\n评分要求：{hint}"
    )

    content = [{"type": "text", "text": text}]
    if image:
        content.append({"type": "image_url", "image_url": {"url": image}})
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": content},
        ],
        "temperature": 0.2,
        "max_tokens": 1400,
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key,
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
    except Exception as e:
        return 502, {"error": f"模型调用失败：{e}"}
    try:
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
    except Exception:
        return 502, {"error": "模型返回格式异常"}
    m = re.search(r"\{[\s\S]*\}", content)
    if m:
        try:
            out = json.loads(m.group(0))
            out["model"] = MODEL
            return 200, out
        except Exception:
            pass
    return 200, {"score": None, "level": "", "comments": content, "missing": "",
                 "suggestions": "", "revised": "", "model": MODEL}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def blocked(self):
        return PUBLIC and any(self.path.startswith(p) for p in BLOCKED)

    def do_GET(self):
        if self.blocked():
            self.send_error(403, "private")
            return
        if self.path == "/api/health":
            payload = {"ok": True, "model": MODEL, "public": PUBLIC}
            if not PUBLIC:
                payload["hasKey"] = bool(api_key())
            self.send_json(200, payload)
            return
        super().do_GET()

    def do_POST(self):
        if self.blocked():
            self.send_error(403, "private")
            return
        if self.path != "/api/grade":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 20_000_000:
                self.send_json(400, {"error": "请求体为空或过大"})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            self.send_json(400, {"error": f"请求解析失败：{e}"})
            return
        code, out = grade(payload)
        self.send_json(code, out)

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            print("[api]", fmt % args)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"atlas: http://127.0.0.1:{PORT}  model={MODEL}  key={'yes' if api_key() else 'NO'}  "
          f"mode={'PUBLIC' if PUBLIC else 'LOCAL'}")
    server.serve_forever()