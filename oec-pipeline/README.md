# oec-pipeline

`oec-pipeline` 是 MCP-only Claude Code Plugin，只执行现有 `dev` 或 `test` 流水线。它不创建、编辑、
复制、取消或删除流水线，也不暴露 Gitee CRUD。

Server 将每个 plan 绑定到授权 canonical Git workspace、精确 `origin` remote、ref、HEAD commit、
远端流水线配置、所选 stages、environment 和 15 分钟 plan token。`prod` 与未知环境会被拒绝。
执行只接受已准备的 plan。plan 在首次 POST 前原子进入 `executing`，并使用稳定 marker 在结果不确定
时只读恢复；同一 plan token 重放最多产生一次 POST，`executed` 返回已保存结果，`failed` 返回原确定性
错误，无法唯一恢复时返回 unknown/blocked 而不是盲目重试。

运行时状态保存在 `${CLAUDE_PLUGIN_DATA}`。提交的 bundle 在 Node.js 20 或更新版本上运行，不依赖
Plugin 内的 `node_modules`。在具体非生产仓库和流水线获得独立授权并完成验收前，不宣称真实
Pipeline 执行已经通过。
