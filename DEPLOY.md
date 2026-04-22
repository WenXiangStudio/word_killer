# 部署指南

## 当前线上地址

GitHub Pages:
`https://wenxiangstudio.github.io/word_killer/`

## 推荐部署方式

### GitHub Pages

仓库已经带有 Pages 所需的静态资源和工作流文件：
- `.github/workflows/pages.yml`
- `.nojekyll`

默认情况下，直接推送到 `main` 就可以继续使用当前 Pages 地址。

如果仓库的 Pages Source 未来切换为 **GitHub Actions**，工作流也可以直接接管发布。

## 本地预览

### Python 静态服务

```bash
python -m http.server 8000
```

打开：
`http://localhost:8000/`

### 项目内置预览脚本

```bash
python server.py
```

或双击：
`run.bat`

## iPhone 使用

1. 用 Safari 打开线上地址
2. 点击“分享”
3. 选择“添加到主屏幕”

## 说明

- `word_books.json` 是线上词书数据源
- `sw.js` 负责离线缓存
- `manifest.json` 和图标文件负责桌面安装体验
