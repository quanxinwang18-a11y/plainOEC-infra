# oec-pipeline

`oec-pipeline` 是 MCP-only Claude Code Plugin，只执行现有 `dev` 或 `test` 流水线。它不创建、编辑、
复制、取消或删除流水线，也不暴露 Gitee CRUD。

Server 将每个 plan 绑定到授权 canonical Git workspace、精确 `origin` remote、ref、HEAD commit、
远端流水线配置、所选 stages、environment 和 15 分钟 plan token。`prod` 与未知环境会被拒绝。
执行只接受已准备的 plan，并使用唯一 marker 在 POST 结果不确定时恢复，而不是盲目重试。

运行时状态保存在 `${CLAUDE_PLUGIN_DATA}`。提交的 bundle 在 Node.js 20 或更新版本上运行，不依赖
Plugin 内的 `node_modules`。在具体非生产仓库和流水线获得独立授权并完成验收前，不宣称真实
Pipeline 执行已经通过。
