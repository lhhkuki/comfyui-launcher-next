# ComfyUI Launcher Next

A Windows desktop launcher and local workstation for managing your own ComfyUI installation.

It is designed for people who run ComfyUI locally every day and want one place to start the server, switch modes, inspect logs, manage custom nodes, browse models, and open recent outputs. The app does not bundle ComfyUI. On first launch, create or edit an environment and point it at your existing ComfyUI folder and Python executable.

![ComfyUI Launcher Next preview](./launcher-next-workstation-preview.png)

## Highlights

- **Independent local launcher**: configure one or more ComfyUI environments manually.
- **Start, stop, and restart ComfyUI** with live stdout/stderr logs.
- **Mode management** for plugin enable/disable strategies.
- **Plugin maintenance** for `custom_nodes`, including Git status, backup, update, enable/disable, remote binding, and requirements install.
- **Runtime console** with queue actions, log filtering, copy/clear controls, and auto-follow.
- **Environment tools** for Python version checks, `pip list`, key package detection, requirements install, and common acceleration packages.
- **Model and media browser** for local model folders and ComfyUI output files.
- **Workflow analysis v1** for reading workflow JSON and comparing node types with locally installed plugins.
- **Path references** for additional model, plugin, workflow, input, output, and user folders.

## Download

Go to the [Releases](https://github.com/lhhkuki/comfyui-launcher-next/releases) page and download the Windows installer:

```text
ComfyUI Launcher Next Setup 0.1.0.exe
```

The installer is currently unsigned. Windows SmartScreen may show a warning until the project has a signed build.

## First Run

1. Open **Settings**.
2. Set **ComfyUI Path** to the folder that contains `main.py`.
3. Set **Python Path** to the Python executable used by that ComfyUI environment.
4. Save the configuration.
5. Go to **Console** and click **Start**.

Typical portable ComfyUI paths look like:

```text
D:\ComfyUI_windows_portable\ComfyUI
D:\ComfyUI_windows_portable\python_embeded\python.exe
```

## Development

```powershell
npm install
npm run dev
```

Build the app:

```powershell
npm run typecheck
npm run build
```

Create a Windows installer:

```powershell
npm run dist:win
```

This creates a portable ZIP and, when `makensis.exe` is available, a Windows setup EXE.

## Data Location

Application data is stored in Electron's `userData` directory:

```text
%APPDATA%\comfyui-launcher-next
```

It contains:

- `launcher-next.config.json` for launcher configuration.
- `logs\` for runtime logs.
- `backups\` for plugin backups.

## Safety Notes

- The launcher does not modify ComfyUI until you perform an explicit action such as start, update, install, enable, disable, delete, or restore.
- Plugin disable/enable actions move folders between `custom_nodes` and `custom_nodes\.disabled`.
- Update and restore actions should be used with care. Keep your own backups for important working environments.
- Dependency installation runs through the Python executable configured for the selected environment.

## Roadmap

- Better workflow-to-plugin matching from public sources.
- More complete model metadata and LoRA browsing.
- Signed Windows builds.
- Portable ZIP build.
- More diagnostic checks before starting ComfyUI.

## License

MIT
