# oec-common

OEC 公共能力包，提供跨项目复用的 HTML 幻灯片能力。

## Skills

| Skill | 用途 |
|-------|------|
| `create-slides` | 创建可在浏览器演讲、概览和打印的 16:9 HTML deck |

Skill 按需独立触发，不要求项目初始化，也没有 Plugin 运行时依赖。默认交付多文件 HTML：

```text
<deck-name>/
├── index.html
├── shared/tokens.css
├── slides/*.html
└── assets/                 # 仅在有真实本地素材时创建
```

它不生成或编辑 `.pptx`，不承诺自动 PDF 导出，也不处理动画、视频或 GIF。`index.html`
包含键盘翻页、固定网格概览、自动缩放、页码和浏览器打印样式。

## 安装

```bash
claude plugin install oec-common@plainOEC-infra --scope user
```

安装后可以直接说“把这份材料做成 HTML 幻灯片”。风格明确且少于 5 页时直接完成；风格模糊或
不少于 5 页时，先用封面和一张代表性内容页确认视觉方向，再批量制作。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。
