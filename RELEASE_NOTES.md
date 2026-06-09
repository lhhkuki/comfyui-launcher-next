# ComfyUI Launcher Next v0.1.0

Initial public Windows release.

## Download

- `ComfyUI Launcher Next Setup 0.1.0.exe`
- `ComfyUI Launcher Next 0.1.0 Portable.zip`

The installer is unsigned. If Windows SmartScreen appears, choose **More info** and run it only if you trust this build.

## What's Included

- Independent ComfyUI environment setup.
- Start, stop, restart, and open web UI actions.
- Live runtime log console with filtering, copy, clear, and auto-scroll.
- Queue interrupt, queue clear, and memory release actions.
- Plugin scan, Git status, backup, update, enable/disable, Git repair, remote binding, and requirements install.
- Mode management with enabled/disabled plugin lists.
- Path reference management for models, plugins, workflows, input, output, and user folders.
- Model browser and output media browser.
- Environment maintenance page with Python, pip, ComfyUI core, and common dependency tools.
- Workflow JSON analysis based on local installed plugins.

## First Run

1. Open **Settings**.
2. Select your ComfyUI folder.
3. Select the Python executable used by that ComfyUI install.
4. Save configuration.
5. Go to **Console** and click **Start**.

## Known Limitations

- Windows only.
- The installer is not code signed.
- Workflow-to-plugin matching is local and basic in this version.
- Dependency installation buttons do not automatically choose Torch/CUDA variants for every machine.
