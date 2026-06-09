# ComfyUI Launcher Next v0.1.0

首个公开版本，面向 Windows 本地 ComfyUI 用户。

这个版本提供一个独立的桌面启动器：用户首次打开后手动配置 ComfyUI 路径和 Python 路径，然后即可在一个界面里完成启动、日志诊断、插件维护、模式切换、模型浏览、媒体浏览和环境维护。

## 下载

- `ComfyUI.Launcher.Next.Setup.0.1.0.exe`：安装版，创建桌面和开始菜单快捷方式。
- `ComfyUI.Launcher.Next.0.1.0.Portable.zip`：便携版，解压后直接运行。

当前安装包未签名，Windows SmartScreen 可能会提示风险。请确认来源后再运行。

## 本版功能

- 多 ComfyUI 环境管理。
- 手动配置 ComfyUI 目录、Python 路径、端口、GPU、浏览器、代理、HF 镜像、VRAM 模式和额外启动参数。
- 启动、停止、重启 ComfyUI，并自动识别服务地址。
- 实时日志控制台，支持自动跟随、错误/警告筛选、复制和清空。
- 中断当前生成、清空队列、请求释放模型和显存相关内存。
- 模式管理：新建、复制、重命名、删除模式，维护插件启用/禁用列表。
- 插件维护：扫描 `custom_nodes`、识别 Git 状态、启用/禁用、备份、恢复、更新、Git 修复、绑定 remote、安装 requirements。
- 路径引用：管理模型、插件、工作流、输入、输出和用户目录。
- 工作流分析 v1：解析 workflow JSON，统计节点类型、缺失节点、本地匹配插件和建议处理项。
- 模型库：扫描和搜索常见模型文件，支持打开文件所在位置。
- 媒体库：浏览输出图片和视频，支持图片完整预览、视频播放、打开位置和删除。
- 环境维护：检查 Python、PyTorch、xformers、Triton、SageAttention、Nunchaku 等关键包，运行 `pip list`，更新 ComfyUI Git 内核。

## 首次使用

1. 打开 **设置**。
2. 选择包含 `main.py` 的 ComfyUI 目录。
3. 填写或选择该环境使用的 Python 可执行文件。
4. 保存配置。
5. 切换到 **控制台** 并点击 **启动**。

## 已知限制

- 当前仅面向 Windows。
- 安装包未签名。
- 工作流节点到插件的匹配能力还处于基础版本，优先使用本地已安装插件信息。
- 依赖安装按钮不会自动为所有显卡判断最合适的 Torch/CUDA 组合。
- 模型和 LoRA 的高级元数据管理会在后续版本继续完善。

---

## English

Initial public Windows release.

ComfyUI Launcher Next is an independent desktop launcher for local ComfyUI installations. On first run, configure the ComfyUI folder and Python executable manually. The app then provides startup controls, runtime logs, plugin maintenance, mode switching, model browsing, media browsing, and environment tools.

## Downloads

- `ComfyUI.Launcher.Next.Setup.0.1.0.exe`: installer build.
- `ComfyUI.Launcher.Next.0.1.0.Portable.zip`: portable build.

The installer is currently unsigned. Windows SmartScreen may show a warning.

## Included

- Multiple local ComfyUI environments.
- Start, stop, restart, and open web UI actions.
- Live logs with auto-follow, filtering, copy, and clear actions.
- Queue interrupt, queue clear, and memory release actions.
- Launch options for port, GPU, browser, proxy, HF mirror, VRAM mode, and extra args.
- Mode management with enabled/disabled plugin lists.
- Custom node scanning, Git status, backup, restore, update, repair, remote binding, and requirements install.
- Path references for models, plugins, workflows, input, output, and user folders.
- Workflow JSON analysis based on locally installed plugins.
- Model browser and output media browser.
- Python environment checks and common dependency commands.
- ComfyUI core Git status and update action.

## Known Limitations

- Windows only.
- Unsigned installer.
- Workflow-to-plugin matching is basic in this version.
- Dependency actions do not automatically choose every Torch/CUDA variant.
