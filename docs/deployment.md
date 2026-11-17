# 运行与部署

[返回首页](../README.md) · [开发说明](development.md)

## 本地体验

安装 Node.js 22 或更新版本，在仓库根目录运行：

```bash
npm start
```

打开 `http://127.0.0.1:4173`。服务器只监听本机。Windows 可双击 `scripts/启动Afterword.cmd`；请勿直接双击 HTML。

## Cloudflare Pages

连接自己的 GitHub 仓库，选择以下配置：

| 设置 | 标准版 | 免费社区版 |
| --- | --- | --- |
| 框架预设 | None | None |
| 根目录 | 仓库根目录 | 仓库根目录 |
| 构建命令 | `npm test && npm run build` | `npm test && npm run build:community` |
| 输出目录 | `dist` | `dist` |
| Node.js | 22 或更新 | 22 或更新 |

构建时不需要任何 API Key 或签发私钥。不要把用户 Key 添加到环境变量或 GitHub Secrets。用户在自己的浏览器页面填写 Key。

`dist` 仅包含网站静态文件和响应头配置。源码目录 `src` 不是最终发布目录。Pages 会读取生成的 `_headers`，设置 CSP 等响应头。默认 `noindex` 仅请求不收录，不是访问密码。

## 1Panel 或其他静态托管

运行 `npm run build`，将 **dist 内的文件** 上传到网站运行目录，使 `index.html` 直接位于网站根目录。启用有效 HTTPS。无需配置 Node 服务、数据库或反向代理。

非 Pages 服务器通常不会识别 `_headers`，需在服务器中配置对应响应头。不要把整个源码仓库当成网站运行目录。

## 免费社区版

部署时运行 `npm run build:community`。如果需要一个可独立在本机运行的社区目录：

```bash
npm run community
cd community
npm start
```

标准版的公开测试许可证仅供开发验证，不可出售。正式收费前需单独更换公钥并建立受控签发流程；私钥不可进入本仓库。

## 更新与域名

更新前先导出加密备份，保留可回退的版本。保持同一协议、域名、浏览器和存储标识时，更换托管不需要主动迁移记录；预览地址和其他域名的数据是隔离的。

使用新域名时，请先从旧域名导出，再在新域名恢复，并重新设置 Key、主题和授权。不要立即把旧域名强制跳转，也不要清除网站数据。

真实手机网络、浏览器跨域策略、真实 ZIP 导出和余额查询需要实际验证；构建成功不能代替这些检查。
