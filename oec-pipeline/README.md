# oec-pipeline

`oec-pipeline` 是 MCP-only Claude Code Plugin，只执行现有 `dev` 或 `test` 流水线。它不创建、编辑、
复制、取消或删除流水线，也不暴露 Gitee CRUD。

Server 将每个 plan 绑定到授权 canonical Git workspace、精确 `origin` remote、ref、HEAD commit、
远端流水线配置、所选 stages、environment 和 15 分钟 prepared 授权。`prod` 与未知环境会被拒绝。
执行只接受已准备的 plan。首次 POST 前，Server 通过 Plugin Data 中的独占 plan claim 申领执行权，再
原子进入 `executing`；并发竞争者只查询稳定 marker 或返回 unknown，不会继续 POST。15 分钟只限制
尚未执行的授权，进入 `executing` 后恢复记录继续可查询。`executed` 返回已保存结果，`failed` 返回原
确定性错误，无法唯一恢复时返回 unknown/blocked 而不是盲目重试。

运行时状态保存在 `${CLAUDE_PLUGIN_DATA}`。提交的 bundle 在 Node.js 20 或更新版本上运行，不依赖
Plugin 内的 `node_modules`。在具体非生产仓库和流水线获得独立授权并完成验收前，不宣称真实
Pipeline 执行已经通过。
