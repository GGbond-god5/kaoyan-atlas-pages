#!/usr/bin/env python3
"""研招网 2027 硕士目录抓取 v2。
匿名接口只给每条查询的前 10 条（start>=10 返回"请登录"），因此全程只用第一页，
靠"切分查询"把每个结果集拆到 <=10 条：
- 学校：dwmc 子串递归切分（后缀候选 + 词表），按 dwdm 去重，以省份 totalCount 校验完整性；
- 专业：xwlx -> mldm -> yjxkdm 分类递归（严格划分）；
- 方向：xxfs -> 专项计划标志组合切分。
断点续跑：省份/学校逐个落盘；多轮补抓直到齐全。"""
import json, os, random, re, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

BASE = "https://yz.chsi.com.cn"
ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
PROVINCES = {"11":"北京","12":"天津","13":"河北","14":"山西","15":"内蒙古","21":"辽宁","22":"吉林","23":"黑龙江","31":"上海","32":"江苏","33":"浙江","34":"安徽","35":"福建","36":"江西","37":"山东","41":"河南","42":"湖北","43":"湖南","44":"广东","45":"广西","46":"海南","50":"重庆","51":"四川","52":"贵州","53":"云南","54":"西藏","61":"陕西","62":"甘肃","63":"青海","64":"宁夏","65":"新疆"}
SEEDS = ["大学","学院","研究院","研究所","学校","党校","科学院","研究中心","中心","总院","大学院"]
MORPH = "工业 理工 科技 医科 师范 财经 外国语 农业 林业 中医药 政法 民族 体育 音乐 美术 戏剧 电影 舞蹈 化工 建筑 工商 邮电 交通 航空 航天 海洋 地质 矿业 石油 电力 水利 轻工 纺织 服装 印刷 联合 开放 城市 工程 信息 电子 机电 汽车 船舶 兵器 消防 税务 海关 公安 警察 卫生 护理 药科 粮食 物资 冶金 材料 环境 资源 测绘 地震 气象 管理 经济 旅游 青年 女子 继续 网络 广播电视 煤炭 生物 化学 物理 统计 心理 社会 外交 国际 应用技术 职业技术 口腔 康复 中西医 兽医 园艺 园林 土木 食品 水产 林学 安全 应急 生态 大气 地球 核工程 民航 航海 传媒 新闻 影视 软件 人工智能 智能制造 新能源 集成电路 光电 生物医学 针灸 草业 茶学 渔业 采矿 风景园林 城乡规划 轨道 港口 救助打捞 民族学 宗教学 哲学 历史 文献 古籍 敦煌 朝文 日文 俄文 法文 德文 阿拉伯 希伯来 希腊 拉丁 会展 酒店 空乘 高铁 轮机 潜水 极地 书法 绘画 设计 动画 游戏 半导体 激光 检验 影像 麻醉 儿科 肿瘤 心血管 神经 康复医学 藏医 蒙医 维医 壮医 畜牧 蚕学 蜂学 木材 采掘 矿物 环保 气候 海洋科学 天体 空间科学 能源动力 核技术 烹饪 石化 供销 眼视光 劳动 人口 文物 档案 行政 商科 职工 幼儿 特殊教育 武术 京剧 话剧 歌剧 民乐 雕塑 出版 广告 网络空间 大数据 机器人 储能 精密仪器 推拿 针灸推拿 给排水 暖通 燃气 桥梁 隧道 航道 海岸 农机 发酵 制糖 烟草 园艺学 风景 旅游管理 体育科学 现代国际 财政科学 商务部 水利水电 电力科学 建筑科学 林业科学 农业科学 医学科学 社会科学 体育科学研究 劳动关系 劳动人事 青年政治 华侨 留学 归国".split()

def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)

def post(path, data, referer):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(BASE + path, data=body, method="POST", headers={
        "User-Agent": UA, "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Referer": referer})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def call(path, data, referer, tries=5):
    last = None
    for i in range(tries):
        try:
            out = post(path, data, referer)
            if out.get("flag") and isinstance(out.get("msg"), dict):
                return out["msg"]
            last = RuntimeError(f"flag={out.get('flag')} msg={str(out.get('msg'))[:80]}")
            log(f"[retry {i+1}] {path} {last}")
            if "请登录" in str(out.get("msg")):
                time.sleep(25)
                continue
        except Exception as e:
            last = e
            log(f"[retry {i+1}] {path} {type(e).__name__}: {str(e)[:100]}")
        time.sleep(min(20, 2 * (i + 1)) + random.random() * 2)
    raise last

def first_page(path, data, referer):
    d = dict(data); d["start"] = 0; d["curPage"] = 1; d["pageSize"] = 10
    msg = call(path, d, referer)
    return msg.get("totalCount") or 0, msg.get("list") or []

# ---------------- 学校：dwmc 子串递归切分 ----------------
def get_html(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:
            last = e
            time.sleep(3 * (i + 1))
    raise last

def sch_names(ssdm):
    """院校库（/sch/）分页是公开的，用它枚举全省招生单位名称（发现层）。"""
    found = {}
    start = 0
    while start <= 600:
        url = "https://yz.chsi.com.cn/sch/search.do?" + urllib.parse.urlencode(
            {"searchType": "1", "ssdm": ssdm, "start": str(start)})
        html = get_html(url)
        pairs = re.findall(r"/sch/schoolInfo--schId-(\d+)\.dhtml[^>]*>\s*([^<]+?)\s*<", html)
        new = 0
        for sid, name in pairs:
            name = name.strip()
            if sid not in found:
                found[sid] = name
                new += 1
        if start > 0 and new == 0:
            break
        start += 10
    return list(found.values())

def collect_schools(ssdm, pname):
    """发现层用院校库枚举校名，再回 zsml 按全名查回权威记录（dwdm/标志）；
    数量对不上省份 totalCount 时，再用子串工作队列补漏。"""
    ref = BASE + "/zsml/dw.do"
    base = {"dwdm": "", "ssdm": ssdm, "xxfs": "", "dwlxs": "all", "tydxs": "", "jsggjh": "", "jsxbjh": ""}
    total, first = first_page("/zsml/rs/dws.do", {**base, "dwmc": ""}, ref)
    rows = {r["dwdm"]: r for r in first}
    names = sch_names(ssdm)
    log(f"[schools] {pname}: 院校库枚举到 {len(names)} 个校名，zsml 总数 {total}")
    def lookup(name):
        try:
            t, lst = first_page("/zsml/rs/dws.do", {**base, "dwmc": name}, ref)
        except Exception:
            return None
        for r in lst:
            if r["dwmc"] == name:
                return r
        if len(lst) == 1:
            return lst[0]
        cands = [r for r in lst if name in r["dwmc"] or r["dwmc"] in name]
        return max(cands, key=lambda r: len(r["dwmc"])) if cands else None
    with ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(lookup, names):
            if r:
                rows[r["dwdm"]] = r
    if len(rows) < total:
        log(f"[schools] {pname}: 发现层 {len(rows)}/{total}，启动子串补漏")
        rows.update(_schools_worklist(ssdm, base, ref, total, rows))
    out = [{"dwdm": r["dwdm"], "name": r["dwmc"], "province": pname,
            "zhx": r.get("zhx") == "1", "syl": r.get("syl") == "1", "bs": r.get("bs") == "1"}
           for r in rows.values()]
    log(f"[schools] {pname}: totalCount={total}, 实抓 {len(out)}")
    if len(out) < total:
        raise RuntimeError(f"{pname} 学校残余 {len(out)}/{total}")
    return out

def _schools_worklist(ssdm, base, ref, total, rows):
    queue = list(SEEDS) + list(MORPH)
    queued = set(queue)
    queried = {""}
    def ask(kw):
        return kw, first_page("/zsml/rs/dws.do", {**base, "dwmc": kw}, ref)
    with ThreadPoolExecutor(max_workers=5) as ex:
        while queue and len(rows) < total:
            batch, queue = queue[:40], queue[40:]
            batch = [k for k in batch if k not in queried]
            if not batch:
                continue
            queried.update(batch)
            for kw, (t, lst) in ex.map(ask, batch):
                for r in lst:
                    rows[r["dwdm"]] = r
                if t > 10:
                    for r in lst:
                        name = r["dwmc"]
                        for L in (3, 2):
                            for i in range(len(name) - L + 1):
                                s = name[i:i + L]
                                if s not in queued:
                                    queued.add(s)
                                    queue.append(s)
    return rows

# ---------------- 专业：分类递归 ----------------
ML_CODES, YJXK = [], {}
def load_codes():
    global ML_CODES, YJXK
    cache = os.path.join(RAW, "codes.json")
    if os.path.exists(cache):
        d = json.load(open(cache, encoding="utf-8"))
        ML_CODES, YJXK = d["ml"], d["yjxk"]
        return
    ml = get_json(BASE + "/zsml/code/ml.json")
    ML_CODES = [x["dm"] for x in ml["dms"]]
    for m in ML_CODES:
        try:
            y = get_json(f"{BASE}/zsml/code/yjxk/{m}.json")
            YJXK[m] = [x["dm"] for x in y["dms"]]
        except Exception:
            YJXK[m] = []
    json.dump({"ml": ML_CODES, "yjxk": YJXK}, open(cache, "w", encoding="utf-8"), ensure_ascii=False)

def collect_programs(dwdm):
    ref = f"{BASE}/zsml/dwzy.do?dwdm={dwdm}"
    base = {"dwdm": dwdm, "dwmc": "", "zydm": "", "zymc": "", "xwlx": "", "mldm": "", "yjxkdm": "",
            "xxfs": "", "tydxs": "", "jsggjh": "", "jsxbjh": ""}
    def rec(f):
        t, lst = first_page("/zsml/rs/dwzys.do", {**base, **f}, ref)
        if t == 0:
            return []
        if t <= 10:
            return lst
        if not f.get("xwlx"):
            out = []
            for v in ("xs", "zyxw"):
                out += rec({**f, "xwlx": v})
            return out
        if not f.get("mldm"):
            out = []
            for v in ML_CODES:
                out += rec({**f, "mldm": v})
            return out
        if not f.get("yjxkdm"):
            out = []
            cands = list(YJXK.get(f["mldm"], [])) + PROF.get(f["mldm"], [])
            for v in cands:
                out += rec({**f, "yjxkdm": v})
            if len(out) < t:
                log(f"[programs] {dwdm} {f} 切分后 {len(out)}/{t}，有残余")
            return out
        log(f"[programs] {dwdm} {f} 仍有 {t} 条无法再切分，只取第一页")
        return lst
    got = rec({})
    total, _ = first_page("/zsml/rs/dwzys.do", base, ref)
    seen, uniq = set(), []
    for p in got:
        if p["zydm"] not in seen:
            seen.add(p["zydm"]); uniq.append(p)
    if len(uniq) != total:
        log(f"[programs] {dwdm} 专业数 {len(uniq)}/{total} 不一致")
    return uniq

PROF = {
    "02": ["0251", "0252", "0253", "0254", "0255", "0256", "0257"],
    "03": ["0351", "0352", "0353", "0354"],
    "04": ["0451", "0452", "0453", "0454"],
    "05": ["0551", "0552", "0553"],
    "06": ["0651"],
    "07": ["0751"],
    "08": ["0851", "0853", "0854", "0855", "0856", "0857", "0858", "0859", "0860", "0861", "0862"],
    "09": ["0951", "0952", "0953", "0954", "0955"],
    "10": ["1051", "1052", "1053", "1054", "1055", "1056", "1057"],
    "11": ["1151"],
    "12": ["1251", "1252", "1253", "1254", "1255", "1256", "1257"],
    "13": ["1351", "1352", "1353", "1354", "1355", "1356", "1357"],
    "14": ["1451"],
}

# ---------------- 方向：xxfs / 标志组合切分 ----------------
def collect_dirs(dwdm, p):
    ref = f"{BASE}/zsml/dwzy.do?dwdm={dwdm}"
    base = {"zydm": p["zydm"], "zymc": p["zymc"], "dwdm": dwdm, "xxfs": p.get("mxxfs") or "",
            "tydxs": p.get("mtydxs") or "", "jsggjh": p.get("mjsggjh") or "", "jsxbjh": p.get("mjsxbjh") or ""}
    t, lst = first_page("/zsml/rs/yjfxs.do", base, ref)
    if t <= 10:
        return lst
    out, seen = [], set()
    def add(items):
        for d in items:
            if d.get("id") not in seen:
                seen.add(d.get("id"))
                out.append(d)
    for xx in ("1", "2"):
        t2, l2 = first_page("/zsml/rs/yjfxs.do", {**base, "xxfs": xx}, ref)
        if t2 <= 10:
            add(l2)
            continue
        for ty in ("0", "1"):
            for js in ("0", "1"):
                for jx in ("0", "1"):
                    t3, l3 = first_page("/zsml/rs/yjfxs.do",
                                        {**base, "xxfs": xx, "tydxs": ty, "jsggjh": js, "jsxbjh": jx}, ref)
                    if t3 > 10:
                        log(f"[dirs] {dwdm} {p['zydm']} xxfs={xx} 标志({ty},{js},{jx}) 仍 {t3} 条")
                    add(l3)
    if len(out) < t:
        log(f"[dirs] {dwdm} {p['zydm']} 残余 {len(out)}/{t}")
    return out

def crawl_school(s):
    out_path = os.path.join(RAW, f"{s['dwdm']}.json")
    if os.path.exists(out_path):
        return "skip"
    programs = collect_programs(s["dwdm"])
    plist = []
    for p in programs:
        dirs = collect_dirs(s["dwdm"], p)
        plist.append({"code": p["zydm"], "name": p["zymc"], "type": p.get("xwlxmc") or "",
                      "ml": p.get("mlmc") or "", "yjxk": p.get("yjxkmc") or "",
                      "dirs": [{"college": d.get("yxsmc") or "", "dir": d.get("yjfxmc") or "",
                                "dircode": d.get("yjfxdm") or "", "xxfs": "全日制" if d.get("xxfs") == "1" else "非全日制",
                                "ksfs": d.get("ksfsmc") or "",
                                "subjects": [[v.get("kskmdm"), v.get("kskmmc")] for v in
                                             [(d.get("kskmz") or [{}])[0].get(f"km{i}Vo") for i in range(1, 5)] if v]}
                               for d in dirs]})
        time.sleep(0.2 + random.random() * 0.3)
    tmp = out_path + ".tmp"
    json.dump({"school": s, "programs": plist}, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, out_path)
    return f"{len(plist)} 专业"

def phase_schools():
    path = os.path.join(RAW, "schools.json")
    for sweep in range(40):
        missing = [c for c in PROVINCES if not os.path.exists(os.path.join(RAW, f"province-{c}.json"))]
        if not missing:
            break
        if sweep:
            log(f"[schools] 第 {sweep+1} 轮补抓，缺 {len(missing)} 个省份，冷却 120s")
            time.sleep(120)
        for code in missing:
            try:
                rows = collect_schools(code, PROVINCES[code])
                json.dump(rows, open(os.path.join(RAW, f"province-{code}.json"), "w", encoding="utf-8"), ensure_ascii=False)
            except Exception as e:
                log(f"[schools] {PROVINCES[code]} 本轮失败：{e}")
    schools = []
    for code in PROVINCES:
        p = os.path.join(RAW, f"province-{code}.json")
        if os.path.exists(p):
            schools.extend(json.load(open(p, encoding="utf-8")))
    json.dump(schools, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return schools

def main():
    load_codes()
    schools = phase_schools()
    log(f"[total] 全国招生单位 {len(schools)} 所")
    for sweep in range(30):
        todo = [s for s in schools if not os.path.exists(os.path.join(RAW, f"{s['dwdm']}.json"))]
        if not todo:
            break
        if sweep:
            log(f"[sweep {sweep+1}] 还剩 {len(todo)} 所未抓，冷却 120s")
            time.sleep(120)
        done = failed = 0
        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = {ex.submit(crawl_school, s): s for s in todo}
            for fut in futs:
                s = futs[fut]
                try:
                    r = fut.result()
                    done += 1
                    if r != "skip":
                        log(f"[{done}/{len(todo)}] {s['dwdm']} {s['name']}: {r}")
                except Exception as e:
                    failed += 1
                    log(f"[FAIL] {s['dwdm']} {s['name']}: {e}")
        log(f"[batch] 完成 {done}，失败 {failed}")
    log("[all-done] 全国目录抓取完成")

if __name__ == "__main__":
    main()
