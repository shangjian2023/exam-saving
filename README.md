# 🚑 期末急救分诊台

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/shangjian2023/exam-saving/ci.yml?branch=main&style=flat-square&label=CI" alt="CI">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/PWA-ready-blue?style=flat-square" alt="PWA">
</p>

<p align="center">
  <strong>🏥 期末周不知道先救哪门课?把所有课录进来,一键分诊:病危、重症、轻症、已出院,按危险程度排好队</strong><br>
  <a href="https://shangjian2023.github.io/exam-saving/">🚀 在线使用</a> ·
  <a href="#-使用方法">使用方法</a> ·
  <a href="#-计算公式">计算公式</a>
</p>

---

## 📖 项目简介

单科的"期末急救计算器"已经有了([姊妹项目 pass-or-fail](https://github.com/shangjian2023/pass-or-fail)),但期末周真正的痛点是:**课太多,不知道先救哪门**。

期末急救分诊台像医院分诊台一样工作:

- 📋 **多课程病例管理** — 一门课一张病历卡,平时分、平时占比、目标分
- 🚨 **危重等级分诊** — 每门课自动诊断:已出院 / 轻症 / 重症 / 病危 / 无力回天
- 📊 **按危险程度排序** — 「开始分诊」把最急的课排到最前,复习优先级一目了然
- 📋 **病危通知书** — 一键生成整学期的诊断报告,复制文本或分享链接,病友点开就是你算好的场景
- 🔮 **摸底估分** — 考完对答案,输入期末估分反推总评
- 💾 **本地记忆** — 病例自动存 localStorage,下次打开免重填
- 🔗 **URL 场景分享** — 全部病例编码进链接,无需后端
- 📱 **PWA** — 可安装到手机桌面,离线可用
- 🔒 **纯本地计算** — 无后端、无统计、无追踪,成绩数据不出浏览器

> 💡 单门课要精细计算(含期中成绩、任意目标滑杆)?用 [pass-or-fail](https://shangjian2023.github.io/pass-or-fail/)。
> 要一眼看清整学期哪门最危险?用本站。

## 🎮 使用方法

1. **新增病例** — 点「➕ 新增病例」,填课程名、平时分、平时占比、目标总分
2. **即时诊断** — 每张病历卡实时显示危重等级和"期末至少需要 X 分"
3. **开始分诊** — 点「🚑 开始分诊」,按危险程度重新排队,最急的排最前
4. **生成通知书** — 点「📋 生成病危通知书」,复制发给你的病友
5. **考完摸底** — 展开卡片底部「考完对答案?」,输入期末估分看总评

### 危重等级对照

| 等级 | 期末所需 | 含义 |
|------|---------|------|
| 🟢 已出院 | ≤ 0 分 | 躺平保平安,期末 0 分也稳 |
| 🟢 轻症 | ≤ 60 分 | 正常复习即可过关 |
| 🟡 重症 | ≤ 90 分 | 需要爆肝抢救 |
| 🔴 病危 | ≤ 100 分 | 一分都不能丢 |
| ⚫ 无力回天 | > 100 分 | 超出满分,诚实告知差距,早做补考打算 |

## 🧮 计算公式

总评 = 平时 × w% + 期末 × (100−w)%

反推期末最低分:

```
期末至少需要 = ⌈ (目标总分 − 平时 × w%) ÷ (100% − w%) ⌉
```

- **向上取整**:89.1 分也必须按 90 分准备
- **浮点防护**:`(60 − 84×40%) ÷ 60%` 这类算式浮点会出 `44.00000000000001`,直接取整会虚高 1 分,已做修正
- **除零防护**:平时占比 100% 时明确提示"总评已定",而不是算出 Infinity
- **诚实原则**:需要 130 分时不说"冲一冲能过",而是告诉你超满分 30 分

## 🛠️ 技术栈

- **前端**:HTML5 + CSS3 + Vanilla JS,零依赖、零构建
- **架构**:计算逻辑(`js/calc.js`,纯函数)与界面(`js/app.js`)分离,经典脚本 + UMD 导出
- **测试**:Node.js 内置 `node:test`,22 个用例覆盖边界(权重 0/100、浮点、非法输入、编解码回环)
- **CI**:GitHub Actions,Node 20/22/24 矩阵跑测试 + 资源引用检查 + 语法检查
- **部署**:GitHub Pages,推送 main 自动上线
- **PWA**:manifest + Service Worker(子路径相对路径注册)

## 📂 项目结构

```
exam-saving/
├── index.html              # 页面结构
├── css/style.css           # 急救箱红主题样式
├── js/calc.js              # 纯计算模块(可测试,无 DOM 依赖)
├── js/app.js               # 界面逻辑与状态管理
├── sw.js                   # Service Worker(离线缓存)
├── manifest.webmanifest    # PWA 清单
├── icons/icon.svg          # 图标
├── test/calc.test.js       # 单元测试(node:test)
├── tools/check-assets.mjs  # CI:资源引用检查
└── .github/workflows/      # CI + Pages 部署
```

## 🧪 本地开发

```bash
# 跑测试(无需 npm install)
npm test

# 资源引用检查
npm run check

# 本地预览(任意静态服务器)
python -m http.server 8080
# 或
npx serve
```

## 🗓️ 更新日志

- **v2.0(2026-08)** — 重构为"急救分诊台":多课程管理、危重排序、病危通知书、URL 分享、摸底估分、PWA;拆分模块架构;补齐测试/CI/Pages/LICENSE;修复原版权重 100% 除零、键盘输入串台、Google Fonts 国内不可达等问题
- **v1.0(2026-02)** — 单课期末急救计算器(急救箱主题 + 数字键盘 + 戏谑文案)

## 📄 许可证

[MIT](LICENSE)

## 🙏 致谢

感谢所有在期末周挣扎的同学们。分诊归分诊,医嘱只有一句:**先救最急的,然后睡觉**。🎓
