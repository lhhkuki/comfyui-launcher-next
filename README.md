# ComfyUI Launcher Next

<a id="中文说明"></a>

<p align="center">
  <a href="#中文说明"><b>中文</b></a>
  ·
  <a href="./README.en.md"><b>English</b></a>
</p>

<p align="center">
  <a href="#下载">下载</a>
  ·
  <a href="#首次使用">首次使用</a>
  ·
  <a href="#核心功能">核心功能</a>
  ·
  <a href="#插件维护">插件维护</a>
  ·
  <a href="#日志控制台">日志控制台</a>
  ·
  <a href="#媒体库">媒体库</a>
  ·
  <a href="#环境维护">环境维护</a>
  ·
  <a href="#开发">开发</a>
</p>

一个面向 Windows 本地 ComfyUI 用户的桌面启动器与工作站。

ComfyUI Launcher Next 不是 ComfyUI 本体，也不内置任何整合包。它的目标是把日常启动、日志诊断、插件维护、模式切换、模型目录、输出媒体和 Python 环境维护集中到一个干净的桌面界面里。首次使用时，只需要在设置里选择你的 ComfyUI 目录和 Python 可执行文件。

![ComfyUI Launcher Next 预览](./launcher-next-workstation-preview.png)

## 适合谁

- 经常在本机运行 ComfyUI，希望有一个更清爽的桌面启动器。
- 有多个 ComfyUI 环境，需要按项目或工作流切换。
- 经常维护 `custom_nodes`，需要查看 Git 状态、更新、备份和禁用插件。
- 希望启动失败时能直接看到日志、端口占用、缺包、显存等诊断信息。
- 希望快速浏览模型目录和 ComfyUI 输出图片/视频。

## 核心功能

### 本地环境管理

- 手动创建多个 ComfyUI 环境。
- 为每个环境保存 ComfyUI 路径、Python 路径、端口、GPU、浏览器、代理和额外启动参数。
- 支持自定义浏览器路径，也可以使用系统默认浏览器。
- 首次启动不自动读取任何外部启动器配置，保持纯净独立。

### 启动控制台

- 启动、停止、重启 ComfyUI。
- 自动生成启动参数预览，便于确认实际执行内容。
- 支持端口、CUDA 设备、VRAM 模式、代理、HF 镜像、Manager、禁用元数据、完成通知等常用开关。
- 启动前会检查基础路径和端口状态。
- 检测到服务地址后可一键打开网页。

### 日志控制台

- 实时显示 ComfyUI stdout/stderr 日志。
- 支持自动跟随最新日志。
- 支持错误、警告筛选。
- 支持复制日志、清空日志。
- 支持中断当前生成、清空队列、释放模型/显存相关内存。
- 自动提取常见问题线索，例如缺少 Python 包、缺失节点、端口占用、CUDA out of memory 等。

### 模式管理

- 创建、复制、重命名和删除模式。
- 每个模式可维护插件启用列表和禁用列表。
- 支持“禁用列表”和“仅启用列表”两种策略。
- 启动前可应用当前模式，让不同工作流使用不同插件组合。
- 模式预览会显示将启用、将禁用和缺失的插件。

### 插件维护

- 扫描当前环境的 `custom_nodes` 和 `.disabled` 插件目录。
- 显示插件名称、启用状态、Git 分支、commit、remote、requirements 状态和健康问题。
- 检测重复插件、缺少 Git remote、detached HEAD 等常见问题。
- 支持打开插件目录、启用/禁用插件、安装 GitHub 插件、更新 Git 插件。
- 更新前可创建插件备份。
- 支持从备份恢复插件。
- 支持给本地插件绑定 Git remote。
- 支持安装插件目录下的 `requirements.txt`。

### 路径引用

- 管理额外的模型、插件、工作流、输入、输出和用户目录。
- 支持打开路径、启用/禁用路径引用。
- 可生成 ComfyUI 可识别的额外模型路径配置。
- 快捷目录面板可快速打开 `models`、`custom_nodes`、`input`、`output`、`user` 等常用位置。

### 工作流分析 v1

- 选择 workflow JSON 文件并解析节点类型。
- 统计节点数量、已匹配插件、缺失节点和建议处理项。
- 可基于本地已安装插件创建临时模式。
- 当前版本优先做本地分析，不依赖云端服务。

### 模型库

- 扫描本地模型目录和额外模型引用目录。
- 支持常见模型文件类型，例如 `safetensors`、`ckpt`、`pt`、`pth`、`gguf`、`onnx` 等。
- 按模型分类浏览，支持搜索。
- 支持在文件夹中显示模型文件。

### 媒体库

- 浏览 ComfyUI `output` 目录中的图片和视频。
- 支持图片完整居中预览。
- 支持视频预览播放。
- 支持打开文件所在位置和删除输出文件。
- 可读取运行中的 ComfyUI `/history`，用于查看最近生成记录。

### 环境维护

- 查看 Python、PyTorch、TorchVision、TorchAudio、xformers、Triton、SageAttention、Nunchaku 等关键包状态。
- 支持运行 `pip list`。
- 支持安装 requirements。
- 支持常用依赖安装入口。
- 支持检测和更新 ComfyUI Git 内核。
- 所有依赖安装类操作都会进入日志控制台，便于观察输出。

## 下载

打开 [Releases](https://github.com/lhhkuki/comfyui-launcher-next/releases) 页面，下载：

```text
ComfyUI.Launcher.Next.Setup.0.1.0.exe
ComfyUI.Launcher.Next.0.1.0.Portable.zip
```

说明：

- `Setup.exe` 是安装版，会创建桌面和开始菜单快捷方式。
- `Portable.zip` 是便携版，解压后直接运行 `ComfyUI Launcher Next.exe`。
- 当前安装包未签名，Windows SmartScreen 可能会提示风险。请确认来源后再运行。

## 首次使用

1. 打开软件后进入 **设置**。
2. 在 **ComfyUI 路径** 中选择包含 `main.py` 的目录。
3. 在 **Python 路径** 中填写或选择该 ComfyUI 环境使用的 Python。
4. 根据需要设置端口、浏览器、代理、HF 镜像、VRAM 模式和额外参数。
5. 点击 **保存配置**。
6. 切换到 **控制台**，点击 **启动**。

常见便携版路径示例：

```text
D:\ComfyUI_windows_portable\ComfyUI
D:\ComfyUI_windows_portable\python_embeded\python.exe
```

## 安全边界

- 软件不会自动修改 ComfyUI。只有在你点击启动、保存、更新、安装、禁用、删除、恢复等明确操作时才会写入或执行命令。
- 插件禁用方式是移动目录：`custom_nodes\插件名` 与 `custom_nodes\.disabled\插件名` 之间切换。
- 插件更新和依赖安装会影响当前 ComfyUI 环境，建议对重要环境保留额外备份。
- 依赖安装使用当前环境配置的 Python，不会自动判断所有 Torch/CUDA 组合。
- 当前版本不包含任何私有市场、账号、云端接口或第三方整合包专有服务。

## 数据位置

应用配置、日志和备份保存在 Electron 的用户数据目录：

```text
%APPDATA%\comfyui-launcher-next
```

主要内容：

- `launcher-next.config.json`：启动器配置。
- `logs\`：运行日志。
- `backups\`：插件备份。

## 开发

安装依赖：

```powershell
npm install
```

开发模式：

```powershell
npm run dev
```

类型检查和构建：

```powershell
npm run typecheck
npm run build
```

生成 Windows 发布包：

```powershell
npm run dist:win
```

该命令会生成便携 ZIP。如果本机能找到 `makensis.exe`，还会生成 Windows 安装包。

## 路线图

- 更完整的工作流节点到插件匹配能力。
- 更完善的模型、LoRA、VAE 元数据浏览。
- 更细的启动前诊断和一键修复建议。
- 便携版配置迁移工具。
- Windows 签名安装包。
- 更多语言和主题。

## License

MIT
