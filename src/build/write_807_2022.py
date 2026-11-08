# -*- coding: utf-8 -*-
import json
from pathlib import Path

items = []


def add(n, text, answer, steps, fig=True, kind="计算题"):
    items.append({
        "id": f"807-2022-{n}", "subject": "mechanics", "chapter": "mech-807-2022",
        "chapterTitle": "华南理工 807 · 2022 真题", "kp": "", "kpName": f"第{n}题",
        "kind": kind, "year": "2022", "source": "华工 807 2022（回忆版）", "isReal": True,
        "text": text, "answer": answer, "steps": steps,
        "figures": [f"q807-2022-{n}.png"] if fig else [],
    })


add(1,
    r"如图所示，BE 杆件的许用应力为 \([\sigma]=90\,\mathrm{MPa}\)，横截面积为 \(A=b\cdot h=0.012\times0.025\,\mathrm{m^2}\)；C 处有一螺钉，直径 \(d=10\,\mathrm{mm}\)，单向剪切。求结构的最大剪切应力 \(\tau\)。",
    r"按分段尺寸 A–C=300 mm 计算：\(F_{\max}\approx7.11\,\mathrm{kN}\)，\(\tau_{\max}\approx54.3\,\mathrm{MPa}\)。若按图中 450 mm 总长理解，\(\tau_{\max}\approx43.9\,\mathrm{MPa}\)；回忆版尺寸标注存在矛盾，考试以原图为准。",
    [
        r"取辅助梁 CD 为研究对象：C 为中间铰、D 为滚轴。设 C 到右侧 \(F\) 的距离为 100 mm，C–D=250 mm。由 \(\sum M_C=0\) 得 \(R_D=F\cdot100/250=0.4F\)；由 \(\sum F_y=0\) 得铰 C 处剪力 \(V_C=F-R_D=0.6F\)。辅助梁在 C 受到向上的 0.6F，故它对主梁 AC 的作用为向下的 0.6F。",
        r"取主梁 AC：A 为铰支，B 处有 BE 杆的竖向力 \(N_{BE}\)，C 处受辅助梁传来的 0.6F 向下，主梁上还有一个 \(F\)。按 A–B=100 mm、B 到 F 为 100 mm、F 到 C 为 100 mm，取 A 为矩心：\(N_{BE}\cdot100=F\cdot200+0.6F\cdot300\)，解得 \(N_{BE}=3.8F\)。",
        r"BE 杆强度控制：\(N_{BE}\le[\sigma]A=90\times10^6\times(0.012\times0.025)=27.0\,\mathrm{kN}\)，所以 \(F\le27.0/3.8=7.11\,\mathrm{kN}\)。",
        r"螺钉在 C 处单剪，剪力等于铰 C 的竖向力 \(V_C=0.6F\)。最大 \(V_C=0.6\times7.11=4.26\,\mathrm{kN}\)。",
        r"单剪面积 \(A_s=\pi d^2/4=\pi(10)^2/4=78.54\,\mathrm{mm^2}\)，故 \(\tau_{\max}=V_C/A_s=4260/78.54=54.3\,\mathrm{MPa}\)。",
        r"校核：若把 450 mm 当作 A–C 的总长（C 两侧仍各 100 mm），则主梁力臂改变，\(N_{BE}=4.7F\)，\(F_{\max}=5.74\,\mathrm{kN}\)，\(\tau_{\max}=43.9\,\mathrm{MPa}\)。两种读法都说明控制因素是 BE 杆强度，而不是螺钉先剪坏。",
    ])

add(2,
    r"结构如图所示，各杆材料、横截面积均相同；在 A 点作用竖向荷载 \(P\)，求各杆内力。其中 3 杆长为 \(l\)。",
    r"\(N_1=N_2=\dfrac{3P}{3\sqrt3+2}\approx0.417P\)（拉）；\(N_3=N_4=N_5=\dfrac{2P}{3\sqrt3+2}\approx0.278P\)（拉）。",
    [
        r"由图中角度：杆 4、5 与水平线成 \(30^\circ\)，杆 1、2 与水平线成 \(60^\circ\)（与竖直杆 3 成 \(30^\circ\)）；结构左右对称，故 \(N_1=N_2,\ N_4=N_5\)。",
        r"设 C、D 水平间距为 \(2s\)。杆 4 从 C 到 B：B 在对称轴上，水平投影 \(s=L_4\cos30^\circ\)，故 \(L_4=2s/\sqrt3\)；杆 1 从 C 到 A：水平投影 \(s=L_1\cos60^\circ\)，故 \(L_1=2s\)。二者竖直高度差 \(L_1\sin60^\circ-L_4\sin30^\circ=\sqrt3s-s/\sqrt3=2s/\sqrt3=l\)，得 \(s=\sqrt3l/2\)。于是 \(L_4=L_5=l,\ L_1=L_2=\sqrt3l\)。",
        r"节点 A 平衡：\(\sum F_x=0\) 自动满足；\(\sum F_y=0\)：\(2N_1\sin60^\circ+N_3=P\)，即 \(\sqrt3N_1+N_3=P\)。",
        r"节点 B 平衡：\(2N_4\sin30^\circ-N_3=0\)，即 \(N_4=N_3\)。",
        r"变形协调：设 A、B 的竖向位移分别为 \(\delta_A,\delta_B\)（向下为正）。杆 1 的伸长 \(\Delta_1=\delta_A\sin60^\circ\)，杆 4 的伸长 \(\Delta_4=\delta_B\sin30^\circ\)，杆 3 的伸长为 \(\Delta_3=\delta_B-\delta_A\)。",
        r"物理关系：\(N_1=\dfrac{EA\Delta_1}{\sqrt3l}=\dfrac{EA\delta_A}{2l}\)，\(N_4=\dfrac{EA\Delta_4}{l}=\dfrac{EA\delta_B}{2l}\)，\(N_3=\dfrac{EA(\delta_A-\delta_B)}{l}\)。",
        r"由 \(N_4=N_3\) 得 \(\delta_A=\dfrac32\delta_B\)；代回 A 点平衡：\(\sqrt3\cdot\dfrac{3EA\delta_B}{4l}+\dfrac{EA\delta_B}{2l}=P\)，即 \(\dfrac{EA\delta_B}{l}=\dfrac{4P}{3\sqrt3+2}\)。",
        r"回代：\(N_1=N_2=\dfrac{3P}{3\sqrt3+2}\approx0.417P\)，\(N_3=N_4=N_5=\dfrac{2P}{3\sqrt3+2}\approx0.278P\)，均为拉力。校核 A 点竖向：\(\sqrt3(0.417P)+0.278P\approx P\)。",
    ])

add(3,
    r"结构如图所示，荷载为 \(M_t=3\,\mathrm{kN\cdot m}\)、\(m=2\,\mathrm{kN\cdot m/m}\)、\(D=0.1\,\mathrm{m}\)。试求：(1) 当荷载作用在图 a 时，求 \(\tau_{\max}\)、单元体以及主应力；(2) 当荷载作用在图 b 时，求 BC 杆内径，使 \(\varphi_{AB}=\varphi_{BC}\)。",
    r"(1) \(T_{AB}=3.4\,\mathrm{kN\cdot m}\)，\(\tau_{\max}=17.3\,\mathrm{MPa}\)，主应力 \(\sigma_1=17.3\,\mathrm{MPa},\sigma_2=0,\sigma_3=-17.3\,\mathrm{MPa}\)；(2) \(d\approx58.6\,\mathrm{mm}\)。",
    [
        r"图 a：AB 段作用均布力偶 \(m=2\,\mathrm{kN\cdot m/m}\)，长 0.2 m；BC 段长 0.2 m，端部作用 \(M_t=3\,\mathrm{kN\cdot m}\)。由扭矩平衡，\(T_{BC}=3\,\mathrm{kN\cdot m}\)，\(T_{AB}=3+2\times0.2=3.4\,\mathrm{kN\cdot m}\)。",
        r"抗扭截面系数 \(W_p=\dfrac{\pi D^3}{16}=\dfrac{\pi(0.1)^3}{16}=1.963\times10^{-4}\,\mathrm{m^3}\)。最大切应力在 AB 段外表面：\(\tau_{\max}=\dfrac{T_{AB}}{W_p}=\dfrac{3400}{1.963\times10^{-4}}=17.3\,\mathrm{MPa}\)。",
        r"取外表面纯剪切单元体：左右面切应力 \(\tau=17.3\,\mathrm{MPa}\)，正应力为零。主应力 \(\sigma_{1,2}=\pm\tau\)，即 \(\sigma_1=17.3\,\mathrm{MPa},\sigma_2=0,\sigma_3=-17.3\,\mathrm{MPa}\)，主平面与轴线成 \(45^\circ\)。",
        r"图 b：BC 改为空心圆管，外径仍为 D，内径为 d。两段长度均为 0.2 m，材料相同，故 \(GI_p\) 为常数因子。",
        r"扭转角 \(\varphi_{AB}=\dfrac{T_{AB}\cdot0.2}{GI_{p1}}\)，\(\varphi_{BC}=\dfrac{T_{BC}\cdot0.2}{GI_{p2}}\)。令二者相等：\(\dfrac{I_{p2}}{I_{p1}}=\dfrac{T_{BC}}{T_{AB}}=\dfrac{3}{3.4}=0.8824\)。",
        r"实心 \(I_{p1}=\pi D^4/32\)，空心 \(I_{p2}=\pi(D^4-d^4)/32\)，故 \(1-(d/D)^4=0.8824\)，即 \((d/D)^4=0.1176\)，\(d/D=0.5857\)。",
        r"代入 D=0.1 m：\(d=0.0586\,\mathrm{m}\approx58.6\,\mathrm{mm}\)。此时两段单位长度扭转角相同，\(\varphi_{AB}=\varphi_{BC}\)。",
    ])

add(4,
    r"结构截面如图所示，\(h_1=88\,\mathrm{mm}\)、\(h_2=52\,\mathrm{mm}\)、\(a=1\,\mathrm{m}\)，\([\sigma_t]=40\,\mathrm{MPa}\)、\([\sigma_c]=120\,\mathrm{MPa}\)。试求：(1) \(I_z\)；(2) 画出内力图，并由危险截面求 \([q]\)。",
    r"(1) \(I_z\approx7.64\times10^6\,\mathrm{mm^4}\)；(2) \([q]\approx0.53\,\mathrm{kN/m}\)（由拉应力控制）。",
    [
        r"截面分块：翼缘 80×20 mm，腹板 20×120 mm（总高 140 mm）。面积 \(A=80\times20+20\times120=4000\,\mathrm{mm^2}\)。",
        r"取顶边为参考，形心距顶 \(\bar y=\dfrac{1600\times10+2400\times80}{4000}=52\,\mathrm{mm}\)，故 \(h_2=52\,\mathrm{mm}\)、\(h_1=88\,\mathrm{mm}\)，与题给一致。",
        r"\(I_z=\left[\dfrac{80\times20^3}{12}+1600(52-10)^2\right]+\left[\dfrac{20\times120^3}{12}+2400(80-52)^2\right]\approx7.64\times10^6\,\mathrm{mm^4}\)。",
        r"截面模量：\(W_t=I_z/52=1.469\times10^5\,\mathrm{mm^3}\)（上缘），\(W_c=I_z/88=8.68\times10^4\,\mathrm{mm^3}\)（下缘）。",
        r"受力：悬臂梁总长 3a，自由端有 2qa 向下，x=a 处有力偶 3qa²，a 到 3a 段有均布 q。墙端反力 \(R=4qa\)，反力矩 \(M_w=2qa\cdot3a+3qa^2+2qa\cdot a=11qa^2\)（负弯矩）。",
        r"内力图：剪力 \(V=2qa\)（0<x<a），随后线性增至 \(4qa\)（墙端）；弯矩在自由端为 0，x=a 处 \(-2qa^2\)，墙端 \(-11qa^2\)，危险截面在墙端：\(M=11qa^2,\ V=4qa\)。",
        r"墙端负弯矩使上缘受拉、下缘受压。拉应力 \(\sigma_t=\dfrac{11qa^2}{W_t}=\dfrac{11\times10^6q}{1.469\times10^5}=74.9q\ \mathrm{MPa}\)（q 以 kN/m 计，a=1 m）。由 \(\sigma_t\le40\) 得 \(q\le0.534\,\mathrm{kN/m}\)。",
        r"压应力 \(\sigma_c=\dfrac{11\times10^6q}{8.68\times10^4}=126.7q\le120\)，得 \(q\le0.947\,\mathrm{kN/m}\)；切应力按 \(\tau_{\max}\approx\dfrac{3V}{2A}=\dfrac{3\times4q\times10^3}{2\times4000}=1.5q\le120\)，不控制。",
        r"取小值：\([q]\approx0.53\,\mathrm{kN/m}\)。说明该截面很薄，弯曲拉应力是控制因素。",
    ])

add(5,
    r"结构如图所示，试求：当 \(a\) 为多少时，使 \(\theta_B=0\)。",
    r"\(a=\dfrac{3l}{16}\)。",
    [
        r"结构为带左伸臂的简支梁：B、A 为支座，BA 跨长 \(l\)；左端伸出长度 \(a\)，端部作用 \(F_P\)；BA 跨中（距 B 为 l/2）另作用 \(F_P\)。",
        r"左伸臂端荷载对 B 截面产生弯矩 \(M_B=-F_Pa\)。对 BA 跨而言，它等效为 B 端的集中力偶 \(M_B\) 与 B 处竖向力；竖向力直接由支座 B 承担，不引起跨内弯矩，故只需考虑端力偶。",
        r"B 端作用力偶 \(M_B\) 时，简支梁 B 端转角（绝对值）\(\theta_1=\dfrac{|M_B|l}{3EI}=\dfrac{F_Pal}{3EI}\)，方向使梁在 B 处顺时针转。",
        r"跨中集中力 \(F_P\) 使 B 端产生的转角（绝对值）\(\theta_2=\dfrac{F_Pl^2}{16EI}\)，方向与前者相反。",
        r"叠加并令 \(\theta_B=0\)：\(\dfrac{F_Pal}{3EI}=\dfrac{F_Pl^2}{16EI}\)。",
        r"约去 \(F_Pl/EI\)：\(\dfrac{a}{3}=\dfrac{l}{16}\)，故 \(a=\dfrac{3l}{16}\)。",
        r"校核：a 增大则伸臂端弯矩增大，B 端顺时针转角增大；a 过小则跨中荷载占优，转角反向，故解唯一。",
    ])

add(6,
    r"结构如图所示，斜杆 AB 直径为 \(d\)，受自重作用，B 点与墙面光滑接触。试求：(1) \(x\) 为多少时正应力最大；(2) 求 \(\tau_{\max}\)。",
    r"(1) \(x=\dfrac l2+\dfrac d8\tan\alpha\)（自 B 沿杆量取）时压应力最大；(2) \(\tau_{\max}=\dfrac{2}{3}\gamma l\cos\alpha\)。",
    [
        r"设杆长 \(l\)、与水平夹角 \(\alpha\)、自重集度 \(q=\gamma A\)（\(A=\pi d^2/4\)）。B 与光滑墙面接触，只有水平反力 \(N\)；A 为铰支座。",
        r"整体对 A 取矩：\(N\cdot l\sin\alpha=q l\cdot\dfrac l2\cos\alpha\)，得 \(N=\dfrac{ql}{2}\cot\alpha\)。",
        r"距 B 为 \(x\) 处截开，取 B 侧段：截面弯矩 \(M(x)=N x\sin\alpha-qx\cdot\dfrac x2\cos\alpha=\dfrac{q\cos\alpha}{2}x(l-x)\)。",
        r"截面轴力为压力：\(C(x)=N\cos\alpha+qx\sin\alpha=\dfrac{ql\cos^2\alpha}{2\sin\alpha}+qx\sin\alpha\)。",
        r"压应力 \(\sigma_c=\dfrac{C}{A}+\dfrac{M}{W}\)，其中 \(W=\pi d^3/32\)，且 \(q=\gamma A\)、\(A/W=8/d\)。代入得 \(\dfrac{\sigma_c}{\gamma}=\dfrac{l\cos^2\alpha}{2\sin\alpha}+x\sin\alpha+\dfrac{4\cos\alpha}{d}x(l-x)\)。",
        r"对 x 求导并令零：\(\sin\alpha+\dfrac{4\cos\alpha}{d}(l-2x)=0\)，解得 \(x=\dfrac l2+\dfrac d8\tan\alpha\)。此为压应力最大位置。",
        r"最大剪力：\(Q(x)=N\sin\alpha-qx\cos\alpha=q\cos\alpha\left(\dfrac l2-x\right)\)，故 \(|Q|_{\max}=\dfrac{ql\cos\alpha}{2}\)。",
        r"圆截面最大弯曲切应力 \(\tau_{\max}=\dfrac{4Q_{\max}}{3A}=\dfrac{4}{3A}\cdot\dfrac{\gamma A l\cos\alpha}{2}=\dfrac{2}{3}\gamma l\cos\alpha\)。",
    ])

add(7,
    r"结构如图所示，\(l\) 已知。试求：(1) 用卡氏第二定理求 BD 杆内力；(2) 已知 \(l=800\,\mathrm{mm}\)，BD 杆 \(\lambda_p=100\)、\(n_{st}=5\)、\(E=210\,\mathrm{GPa}\)、\(d=25\,\mathrm{mm}\)，求杆件许可荷载 \([q]\)。",
    r"(1) \(X=\dfrac{17ql/8}{1+\dfrac{3EI}{EAl^2}}\)（刚梁近似 \(X=\dfrac{17ql}{8}\)）；(2) \([q]\approx7.3\,\mathrm{kN/m}\)。",
    [
        r"取 BD 杆轴力 \(X\) 为多余未知力（对梁向上，杆受压）。梁为 C 端固定、A 端自由的悬臂梁，B 在跨中（距固定端 \(l\)，总长 \(2l\)），全跨受均布 q。",
        r"悬臂梁均布 q 在 B 处的挠度（向下）：\(v_q=\dfrac{17ql^4}{24EI}\)（由 \(v(x)=\dfrac{qx^2(6L^2-4Lx+x^2)}{24EI}\)，取 L=2l、x=l）。",
        r"B 处向上集中力 X 在 B 处产生的挠度：\(v_X=\dfrac{Xl^3}{3EI}\)（向上）。",
        r"BD 杆受压缩短：\(\Delta=\dfrac{Xl}{EA}\)。变形协调：\(v_q-v_X=\Delta\)。",
        r"代入：\(\dfrac{17ql^4}{24EI}-\dfrac{Xl^3}{3EI}=\dfrac{Xl}{EA}\)，整理得 \(X=\dfrac{17ql/8}{1+\dfrac{3EI}{EAl^2}}\)。若梁的抗弯刚度远大于杆的轴向刚度，则 \(X\approx\dfrac{17ql}{8}\)。",
        r"第二部分按刚梁近似取 \(X=17ql/8\)。杆为两端铰支，\(\mu=1\)；惯性半径 \(i=d/4=6.25\,\mathrm{mm}\)，长细比 \(\lambda=\mu l/i=800/6.25=128\)。",
        r"\(\lambda=128>\lambda_p=100\)，属大柔度杆，用欧拉公式：\(\sigma_{cr}=\dfrac{\pi^2E}{\lambda^2}=\dfrac{\pi^2\times210000}{128^2}=126.5\,\mathrm{MPa}\)。",
        r"稳定许用应力 \([\sigma]=\sigma_{cr}/n_{st}=25.3\,\mathrm{MPa}\)；杆面积 \(A=\pi d^2/4=490.9\,\mathrm{mm^2}\)，许用轴力 \([N]=12.42\,\mathrm{kN}\)。",
        r"由 \(X=17ql/8\) 得 \([q]=\dfrac{8[N]}{17l}=\dfrac{8\times12420}{17\times0.8}=7306\,\mathrm{N/m}\approx7.3\,\mathrm{kN/m}\)。",
    ])

add(8,
    r"说明四大强度理论是由什么引起的，写出对应的表达式，并说明第三强度理论和第四强度理论谁更保守，举例说明。",
    r"第一强度理论（最大拉应力）\(\sigma_1\le[\sigma]\)；第二（最大拉应变）\(\sigma_1-\mu(\sigma_2+\sigma_3)\le[\sigma]\)；第三（最大切应力）\(\sigma_1-\sigma_3\le[\sigma]\)；第四（畸变能）\(\sqrt{\sigma_1^2+\sigma_2^2+\sigma_3^2-\sigma_1\sigma_2-\sigma_2\sigma_3-\sigma_3\sigma_1}\le[\sigma]\)。第三强度理论更保守；纯剪切时第三给出 \(\tau\le0.5[\sigma]\)，第四给出 \(\tau\le0.577[\sigma]\)。",
    [
        r"第一强度理论（最大拉应力理论）：认为脆性断裂由最大拉应力引起，\(\sigma_1\le[\sigma]\)，适用于铸铁等脆性材料受拉。",
        r"第二强度理论（最大拉应变理论）：认为断裂由最大拉应变引起，\(\sigma_1-\mu(\sigma_2+\sigma_3)\le[\sigma]\)，适用于脆性材料。",
        r"第三强度理论（最大切应力理论，Tresca）：认为屈服由最大切应力引起，\(\tau_{\max}=(\sigma_1-\sigma_3)/2\le[\sigma]/2\)，即 \(\sigma_1-\sigma_3\le[\sigma]\)，适用于塑性材料。",
        r"第四强度理论（畸变能理论，von Mises）：认为屈服由畸变能密度引起，\(\sqrt{\sigma_1^2+\sigma_2^2+\sigma_3^2-\sigma_1\sigma_2-\sigma_2\sigma_3-\sigma_3\sigma_1}\le[\sigma]\)。",
        r"纯剪切状态：\(\sigma_1=\tau,\sigma_2=0,\sigma_3=-\tau\)。第三理论：\(2\tau\le[\sigma]\Rightarrow\tau\le0.5[\sigma]\)；第四理论：\(\sqrt3\tau\le[\sigma]\Rightarrow\tau\le0.577[\sigma]\)。",
        r"因此第三理论允许的切应力更小，更保守；第四理论更接近塑性材料的试验结果。例：低碳钢圆轴扭转屈服，按第三理论设计更安全，按第四理论更经济。",
        r"选用原则：脆性材料用第一/第二理论；塑性材料用第三/第四理论；复杂应力状态优先第四，要求更保守时用第三。",
    ], fig=False, kind="简答题")

out = {"items": items}
p = Path("src/bank/imported-807-2022.json")
p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", p, len(items), "items")
