# 0.1.3

## 新增
- 任务中心：记录操作结果、失败原因、所属环境和耗时；保留最近 80 个结束任务。
- 应用重新打开时，将没有结束的记录标为结果未确认，不自动重试。
- 工作流模型引用候选检查，支持本地与引用模型目录中的同名文件匹配。
- 工作流可跳转模型库、插件维护、运行中心。

## 修复和优化
- 并发操作不会因为一个任务完成就提前显示空闲。
- 无映射信息的节点标为未确认，不再直接认定缺失。
- 不完整工作流分析生成保守模式，保留其他插件的当前启用/禁用状态。
- 工作流文件或环境切换后，过时的分析结果不会覆盖当前结果。
- 统一页面操作区，收紧工作流信息布局。
- 浅色工作台与顶部窗口控制统一，多尺寸排版和插件错误内容溢出修复。
- 配置采用排队、临时文件和原子替换写入，减少并发保存损坏风险。
- 日志优先匹配缺包、端口占用、显存不足等具体问题。
- 完善软件图标与打包资源检查，便携 EXE 已通过实际启动验证。

## 已知边界
- 模型检查只比较文件名，不校验哈希、模型版本或兼容性；扫描有现有数量和目录深度限制。
- 任务中心尚不支持取消子进程和安装百分比，也不持久化完整日志。
- 未接入工作流自动提交；从运行中心打开 ComfyUI 后继续编辑与生成。

## 下载与验证

- 安装版：`ComfyUI Launcher Next Setup 0.1.3.exe`
- 便携版：`ComfyUI Launcher Next 0.1.3 Portable.zip`，完整解压后运行，不能只移动 EXE。
- 文件校验：`SHA256SUMS.txt`。
- 安装包未签名，Windows 可能提示 SmartScreen 警告。
- 类型、构建、回归及 1280×800、1440×900、1920×1080 的布局测试通过；使用独立示例环境，不代表所有真实 Python/CUDA 组合已验证。

## English

### Added
- Task Center with local operation history, status, failure details, environment names, and elapsed time. Open it from the bottom-right status bar.
- Workflow model filename checks across local and referenced model directories.
- Navigation from workflow analysis to plugins, models, and the runtime console.

### Fixed
- Concurrent tasks no longer make the app appear idle when another operation is still running.
- Unknown nodes are unverified rather than automatically classified as missing.
- Incomplete workflow analysis preserves the state of unrelated plugins.
- Stale workflow results no longer overwrite another file or environment.
- Refined light workspace, integrated window controls, responsive layouts, and plugin error rows.
- Serialized atomic configuration writes, specific log diagnostics, app icons, and package completeness checks.

### Limitations
- Model checks compare filenames only, not hashes, versions, or compatibility. Existing scan limits apply.
- No subprocess cancellation, installation percentages, or persistent per-task full logs yet.
- Workflows are not automatically submitted. Continue editing and generating in ComfyUI.
- Windows packages are unsigned. Fully extract the portable ZIP and keep its resource folders.
- Tests used isolated example environments; real-world Python/CUDA combinations still need user validation.
