/* 参赛版「AI 批改样例」数据（仅 --contest 构建打包进页面，正式版不加载）。
 * 数据来源：主站演示账号 GGBOND 的真实批改结果（2026-11-23 导出）——
 *   数学：2021 数学一真题卷（整卷 125/152）第 17 题解答题，9.5/12；
 *   英语：2020 英语一真题卷大作文（eng-2020-52），12.5/20。
 * 作答为学生手写拍照件，answer 字段是批改时的 AI 转写（已剔除试卷页眉页脚噪声）；
 * 维度取自批改结果的 breakdown 逐步给分点，字段口径与正式版批改详情一致。 */
window.CONTEST_SAMPLE = {
  "placeholder": false,
  "math": {
    "title": "数学一 2021 真题 · 解答题批改样例（第 17 题）",
    "question": "求极限 lim(x→0) [ (1 + ∫₀ˣ e^(t²) dt) / (eˣ − 1) − 1 / sin x ]。",
    "answer": "（学生手写作答，拍照上传后 AI 转写）\n解：原极限 = \\lim_{x \\to 0} \\frac{\\sin x + \\sin x \\int_0^x e^{t^2} dt - (e^x - 1)}{\\sin x (e^x - 1)}\n= \\lim_{x \\to 0} \\frac{\\sin x + \\sin x \\int_0^x e^{t^2} dt - (e^x - 1)}{x^2}\n= \\lim_{x \\to 0} \\frac{\\cos x + \\cos x \\int_0^x e^{t^2} dt - e^x + \\sin x e^{x^2}}{2x}\n第1页（共6页）\n= \\lim_{x \\to 0} \\frac{-\\sin x - \\sin x \\int_0^x e^{t^2} dt + \\cos x \\cdot e^{x^2} - e^x + \\cos x e^{x^2} + 2x \\sin x e^{x^2}}{2}\n= \\lim_{x \\to 0} \\frac{1 - 1 + 1}{2} = \\frac{1}{2}",
    "score": 9.5,
    "maxScore": 12,
    "dimensions": [
      {
        "name": "通分并确定分母等价无穷小",
        "score": 3,
        "max": 3,
        "comment": "通分正确，分母用 (e^x-1)sinx ~ x^2 处理正确。"
      },
      {
        "name": "第一次洛必达（分子求导）",
        "score": 3,
        "max": 3,
        "comment": "对 sinx(1+∫e^{t^2}dt) 求导，含变上限积分求导，结果正确。"
      },
      {
        "name": "第二次洛必达（二阶导）",
        "score": 2,
        "max": 3,
        "comment": "对 cosx·e^{x^2} 求导时漏掉 (e^{x^2})'=2xe^{x^2} 项，导致分子多出 2x sinx e^{x^2} 这一错误项；但整体求导框架正确。"
      },
      {
        "name": "代入求极限得结论",
        "score": 1.5,
        "max": 3,
        "comment": "因上一步多出含 x 的项，代入 x=0 时该项为 0，最终数值 1/2 仍正确，但推导链有瑕疵，结论分减半。"
      }
    ],
    "comments": [
      "通分、分母等价替换和两次洛必达的思路都对，变上限积分求导也掌握得不错。主要问题是第二次求导时对 cosx·e^{x^2} 漏了乘积项，多写了一个 2x sinx e^{x^2}，虽然代入后不影响结果，但推导不严谨。",
      "丢分点：第二次洛必达时，对 cosx·e^{x^2} 求导应为 -sinx·e^{x^2}+cosx·2x·e^{x^2}，你漏掉了后一项，却多写了 2x sinx e^{x^2}，属于乘积求导法则使用不完整。",
      "建议：建议专门练几道含变上限积分与乘积求导的极限题，重点复习乘积求导法则和 e^{x^2} 的链式求导，写完后逐项核对每一项的来源。"
    ]
  },
  "essay": {
    "title": "英语一 2020 真题 · 大作文批改样例",
    "question": "Part B 图画作文（20 分）：根据所给两幅图写一篇 160–200 词的短文——1) 简要描述图画，2) 阐释寓意，3) 发表评论。图题为 “Habit”：左图女孩在堆满书的桌前提前完成作业后感到安心，配文 “I feel at ease only after finishing my homework ahead of time”；右图男孩悠闲地把事情拖到最后一刻，配文 “I won’t start until the last moment”。",
    "answer": "（学生手写作答，拍照上传后 AI 转写）\nAs is vividly depicted in the drawings, the woman on the left\nis working on her homework diligently, while the man on the right\nis has finished nothing. The caption on the left is \"Working out\nthe homework as early as possible is \". In contrast,\non the left drawing, the man says \"I will not finish it\nunless the last moment.\" The mean of the drawings is\nclear: do the task at time is better than finish it when\nthe deadline.\n\nMetaphorically, the behaviour of the right man is becoming\na prevalent trend among a vast body of undergraduate. To\nreverse this troubling trend and tackle the issue overly,\nthe pertinent suggestions are put forward. Firstly, the sense\nof abiding postpone should flow into everyone's mind. On\none hand, working on anything at last time is not no only\ndecline the quality of the work, but also leave you in\na paramount pressure. Simonteniously, the authorities ought\nto play a significant role in the procedure of task monitation,\nwhich help the undergraduate cultivate a great habit. Last but\nnot least, the great habit will make you become more and\nmore excellent, which aggress the gap with the bad habit.\nwho have.\n\nTo sum up, cultivating a great habit and keeping it\nconsistently is of vital importance. It might be hard to hold on,\nbut please believe, it is high time that what you do now is\nshaping the better one in the foreseeable future.\nyourself better",
    "score": 12.5,
    "maxScore": 20,
    "dimensions": [
      {
        "name": "内容回应任务",
        "score": 4,
        "max": 6,
        "comment": "基本完成三部分要求：描述图、解读寓意、发表评论；但左/右图人物性别混淆（右图应为男生却称man on left）， caption转写错误（“on the left drawing, the man says”实为右图），且“mean of the drawings”表述不准确。"
      },
      {
        "name": "结构组织",
        "score": 3,
        "max": 4,
        "comment": "采用三段式框架，段落功能基本清晰；但第二段逻辑松散，“Metaphorically”后突然跳至大学生群体，缺乏过渡；结尾句结构混乱（“shaping the better one... yourself better”）影响收束效果。"
      },
      {
        "name": "语言丰富度",
        "score": 2.5,
        "max": 5,
        "comment": "尝试使用较高级表达如“paramount pressure”“prevalent trend”，但大量搭配不当（“abiding postpone”“task monitation”）、冗余重复（“great habit”反复出现）、中式英语（“aggress the gap with the bad habit”）削弱表达力。"
      },
      {
        "name": "语法与拼写",
        "score": 3,
        "max": 5,
        "comment": "存在多处严重语法错误：主谓一致错误（“the man on the right is has”）、双重否定（“not no only”）、拼写错误（“Simonteniously”, “monitation”）、句子碎片（“who have.”）；部分句子可理解但不符合书面规范。"
      }
    ],
    "comments": [
      "能识别两图对比核心并尝试展开评论，结构框架完整；最主要问题是语言准确性严重不足，大量低级语法与搭配错误干扰理解，尤其主谓一致和词性误用频发，拉低整体得分。",
      "缺失与不足：第一段未准确描述左右图细节（如桌面物品、内心独白位置），将右图人物误置于左图；未点明标题“Habit”与主题的呼应关系；建议部分泛泛而谈，缺乏像参考答案中‘breaking into small steps’这样具体可行的方法。",
      "建议：聚焦「主谓一致+动词搭配」专项训练：每天精改2句含be动词/实义动词的复合句，重点检查第三人称单数与不可数名词搭配；结合真题范文积累习惯类话题的地道动宾搭配（如cultivate a habit, overcome procrastination）。"
    ],
    "grammar": [
      {
        "wrong": "the man on the right is has finished nothing",
        "right": "the man on the right has finished nothing",
        "note": "主谓一致错误：'is has' 为双重谓语，应删去 'is'；'has finished' 为现在完成时正确形式。"
      },
      {
        "wrong": "On one hand, working on anything at last time is not no only decline the quality...",
        "right": "On one hand, leaving things until the last minute not only reduces work quality but also causes immense pressure.",
        "note": "双重否定错误（not no only）+ 动词误用（decline作及物动词错误）+ 搭配不当（at last time → until the last minute）。"
      },
      {
        "wrong": "Simonteniously, the authorities ought to play a significant role in the procedure of task monitation",
        "right": "Simultaneously, universities should actively monitor task progress to help students cultivate good habits.",
        "note": "拼写错误（Simonteniously→Simultaneously, monitation→monitoring）+ 用词不当（authorities指政府机构，此处应为universities或educators）+ 抽象名词堆砌（procedure of task monitoring→monitor task progress更自然）。"
      }
    ],
    "upgrades": [
      {
        "from": "The mean of the drawings is clear: do the task at time is better than finish it when the deadline.",
        "to": "The message is clear: completing tasks promptly yields better results than waiting until the deadline."
      },
      {
        "from": "the great habit will make you become more and more excellent, which aggress the gap with the bad habit. who have.",
        "to": "Consistently practicing good habits steadily narrows the gap between high achievers and chronic procrastinators."
      },
      {
        "from": "It might be hard to hold on, but please believe, it is high time that what you do now is shaping the better one in the foreseeable future.",
        "to": "Though challenging, persisting in good habits now is precisely what shapes a better future self."
      }
    ],
    "revised": "As vividly depicted, the girl on the left sits at a desk piled with books, working diligently, with the caption: 'I feel at ease only after finishing my homework ahead of time.' In contrast, the boy on the right leans back leisurely, with just a book and pen before him, thinking: 'I won’t start until the last moment.' This contrast highlights how habits—especially timely action versus procrastination—shape long-term outcomes. To counter this, we should break tasks into manageable steps and set self-imposed deadlines earlier than required. After all, it is our daily habits that ultimately shape who we become."
  }
};
