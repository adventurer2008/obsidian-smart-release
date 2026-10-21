# 无界同步（Wujie Sync）国内版

面向中国用户的 Obsidian 同步插件。插件 ID：`wujie-sync`。本仓库提供国内版源码快照、安装包、使用说明及更新记录。[English](README.en.md)

**公测期内，请申请开通。** 当前为免费公测，使用托管同步服务需要账号及审核批准。未来收费及公测访问规则的变化会提前通知，目前未公布付费方案。

## 安装与更新

- 官方社区入口：[Wujie Sync](https://community.obsidian.md/plugins/wujie-sync)。点击 **Add to Obsidian** 进入客户端安装页。审核通过后的客户端搜索收录可能存在延迟。
- 已通过 BRAT 安装的用户：仓库地址为 `adventurer2008/obsidian-smart-sync-release-cn`，可继续使用 BRAT 更新。
- 手动安装：从[对应版本的 Release](https://github.com/adventurer2008/obsidian-smart-sync-release-cn/releases)下载同一版本的 `main.js`、`manifest.json` 和 `styles.css`，校验 `SHA256SUMS.txt`。不要把 GitHub 的源码压缩包当作安装包。

本仓库只提供国内版。访问 GitHub 是从 GitHub 或 BRAT 下载、更新的前提。

## 当前版本：0.1.82（2026-10-21）

保留 0.1.81 的全部功能、加密、设备配对及文件原始修改时间。同一仓库提供与发行包对应、可复现构建的国内版源码；本版采用 Apache-2.0，历史 MIT 发行保持不变。服务端仍为 0.1.26，没有新增协议或数据库结构变更。详见[更新说明](RELEASE-NOTES.md)。

完整本地测试、精确配对 CI、预发验收、真实管理员邮件收件及同运行包生产合成验收已通过。官方社区已完成 0.1.82 扫描及构建逐字节一致性验证；物理 Android、iOS、iPad、macOS 的安装和性能验收尚未完成。网页上架不等于每台客户端的搜索、安装均已验证。

## 账号、加密与服务

国内服务地址为 `[service endpoint configured by client]`，使用已开通的国内账号及笔记库加密口令。国内版与海外版的账号和云端数据独立，不要在同一个笔记库中同时启用两个版本。

正文、路径及原始修改时间在客户端加密后上传；服务仍会处理账号、工作区、申请邮箱、笔记库和设备标签、时间戳、密文大小、诊断等运行信息。请妥善保管加密口令，服务端无法找回。详见[隐私说明](PRIVACY.md)。公测不代表永久免费承诺。

## 安装文件与源码

唯一 Client 开发主线为 [obsidian-smart-sync-client](https://github.com/adventurer2008/obsidian-smart-sync-client)。本发行库的源码由固定公开提交自动导出，用于同库审核与可复现构建；不要直接在本仓库开发第二套 Client。`SOURCE-SNAPSHOT.json` 记录来源提交、文件摘要和地区转换。Server 源码及内部运维工具保持私有，不公开凭据或真实测试数据。

复现 0.1.82 时请检出对应 tag，并使用 Node.js 26.11.1：

```sh
npm ci --ignore-scripts
npm test
npm run build
```

默认构建会验证源码摘要、选择国内配置、检查依赖闭包，并在根目录输出三个安装文件。重复构建应得到相同字节。本次文档更新不导出下一版源码、不修改已有 tag 或 Release 附件、不部署服务。

## 从 0.1.72（smart-sync）迁移

0.1.73 起，国内插件 ID 改为 `wujie-sync`，Obsidian 会将它识别为独立插件，不能直接按原 ID 自动升级。

1. 先备份笔记库和插件设置；在旧插件中导出加密连接备份，保管好备份密码。
2. 停用旧 `smart-sync` 插件，不要退出账号或撤销设备授权。
3. 若使用 BRAT，移除旧仓库条目后重新添加当前国内发行仓库，启用新插件。
4. 导入加密连接备份，核对账号、笔记库、同步方向、排除项和附件偏好后再恢复同步。也可登录同一国内账号，使用原加密口令选择已有笔记库，不要新建重复库。

连接导入只迁移连接凭据，不代表全部偏好或同步检查点已迁移。已有云端数据和本地笔记保持原位，确认同步正常前保留停用的旧插件目录，不要同时启用两个同步插件，也不要把明文凭据复制进 `data.json`。0.1.72 的 tag 和附件保留。

## 许可证与仓库

Copyright (c) 2026 lihy。0.1.82 及后续 Client 候选采用 [Apache License 2.0](LICENSE)；0.1.81 及更早已发布版本保留原 MIT 条款和附件。第三方依赖遵循 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 中各自的许可。Client 许可不包含私有 Server，也不授予托管服务访问权；Apache-2.0 允许商业复用。

本仓库由 `obsidian-smart-release` 改名而来，旧链接保留跳转，插件 ID 不变。[Global 发行库](https://github.com/adventurer2008/obsidian-smart-sync-release-global)当前仍为占位，尚无运行发行版。

## 文档语言

CHG-20261021-15 / U301/R311 / DEC292：国内发行库的首页、安装说明、隐私说明和后续更新记录以简体中文为主；Global 发行库面向用户的文档使用英文。英文参考副本可保留。许可证原文、第三方版权声明及机器可读字段不为翻译而改写；官方社区要求英文的介绍字段继续使用英文。
