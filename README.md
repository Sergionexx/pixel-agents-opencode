<h1 align="center">
    <a href="https://github.com/pixel-agents-hq/pixel-agents">
        <img src="webview-ui/public/banner.png" alt="Pixel Agents">
    </a>
</h1>

<h2 align="center" style="padding-bottom: 20px;">
  The game interface where AI agents build real things
</h2>

<div align="center" style="margin-top: 25px;">

[![version](https://img.shields.io/badge/version-1.4.0-blue)]()
[![license](https://img.shields.io/github/stars/Sergionexx/pixel-agents-opencode?logo=github&color=0183ff&style=flat)]()

</div>

<div align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=smonteros.pixel-agents-opencode">🛒 VS Code Marketplace</a> • <a href="https://github.com/Sergionexx/pixel-agents-opencode/issues">🐛 Issues</a>
</div>

<br/>

> **⚠️ This is a fork of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) by [pablodelucca](https://github.com/pablodelucca).**  
> All credit for the original concept, code, and assets goes to the original authors (see [Credits](#credits) below).  
> **The only difference in this fork is compatibility with [OpenCode](https://opencode.ai) instead of Claude Code** — every feature works exactly the same, but agents run on opencode's backend.

---

Pixel Agents turns multi-agent AI coding assistants into something you can actually see and manage. Each agent becomes a character in a pixel art office. They walk around, sit at their desk, and visually reflect what they are doing — typing when writing code, reading when searching files, waiting when it needs your attention.

This is a fork of the Pixel Agents VS Code extension modified to work with **OpenCode** as the agent backend. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=smonteros.pixel-agents-opencode).

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## Features

- **One agent, one character** — every OpenCode terminal gets its own animated character
- **Live activity tracking** — characters animate based on what the agent is actually doing (writing, reading, running commands)
- **Office layout editor** — design your office with floors, walls, and furniture using a built-in editor
- **Speech bubbles** — visual indicators when an agent is waiting for input or needs permission
- **Sound notifications** — optional chime when an agent finishes its turn
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters linked to their parent
- **Persistent layouts** — your office design is saved and shared across VS Code windows
- **External asset directories** — load custom or third-party furniture packs from any folder on your machine
- **Diverse characters** — 6 diverse characters. These are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Pixel Agents characters" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Requirements

- VS Code 1.105.0 or later
- [OpenCode CLI](https://opencode.ai) installed and configured
- **Platform**: Windows, Linux, and macOS are supported

## Getting Started

If you just want to use Pixel Agents (OpenCode), install the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=smonteros.pixel-agents-opencode). If you want to play with the code, develop, or contribute, then:

### Install from source

```bash
git clone https://github.com/Sergionexx/pixel-agents-opencode.git
cd pixel-agents-opencode
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host.

### Usage

1. Open the **Pixel Agents** panel (it appears in the bottom panel area alongside your terminal)
2. Click **+ Agent** to spawn a new OpenCode terminal and its character
3. Start coding with OpenCode — watch the character react in real time
4. Click a character to select it, then click a seat to reassign it
5. Click **Layout** to open the office editor and customize your space

## Layout Editor

The built-in editor lets you design your office:

- **Floor** — Full HSB color control
- **Walls** — Auto-tiling walls with color customization
- **Tools** — Select, paint, erase, place, eyedropper, pick
- **Undo/Redo** — 50 levels with Ctrl+Z / Ctrl+Y
- **Export/Import** — Share layouts as JSON files via the Settings modal

The grid is expandable up to 64×64 tiles. Click the ghost border outside the current grid to grow it.

### Office Assets

All office assets (furniture, floors, walls) are **fully open-source** and included in this repository under `webview-ui/public/assets/`. No external purchases or imports are needed — everything works out of the box.

Each furniture item lives in its own folder under `assets/furniture/` with a `manifest.json` that declares its sprites, rotation groups, state groups (on/off), and animation frames. Floor tiles are individual PNGs in `assets/floors/`, and wall tile sets are in `assets/walls/`. This modular structure makes it easy to add, remove, or modify assets without touching any code.

To add a new furniture item, create a folder in `webview-ui/public/assets/furniture/` with your PNG sprite(s) and a `manifest.json`, then rebuild. The asset manager (`scripts/asset-manager.html`) provides a visual editor for creating and editing manifests.

To use furniture from an external directory, open Settings → **Add Asset Directory**. See [docs/external-assets.md](docs/external-assets.md) for the full manifest format and how to use third-party asset packs.

Characters are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

## How It Works

Pixel Agents watches OpenCode's SQLite database to track what each agent is doing. When an agent uses a tool (like writing a file or running a command), the extension detects it and updates the character's animation accordingly. No modifications to OpenCode are needed — it's purely observational.

The webview runs a lightweight game loop with canvas rendering, BFS pathfinding, and a character state machine (idle → walk → type/read). Everything is pixel-perfect at integer zoom levels.

## Tech Stack

- **Extension**: TypeScript, VS Code Webview API, esbuild
- **Webview**: React 19, TypeScript, Vite, Canvas 2D

## Known Limitations

- **Agent-terminal sync** — the way agents are connected to OpenCode terminal instances is not super robust and sometimes desyncs, especially when terminals are rapidly opened/closed or restored across sessions.
- **Heuristic-based status detection** — OpenCode's DB schema does not provide clear signals for when an agent is waiting for user input or when it has finished its turn.
- **Linux/macOS tip** — if you launch VS Code without a folder open (e.g. bare `code` command), agents will start in your home directory.

## Troubleshooting

If your agent appears stuck on idle or doesn't spawn:

1. **Debug View** — In the Pixel Agents panel, click the gear icon (Settings), then toggle **Debug View**. This shows connection diagnostics per agent.
2. **Debug Console** — If you're running from source (Extension Development Host via F5), open VS Code's **View > Debug Console**. Search for `[Pixel Agents]` to see detailed logs.

## Where This Is Going

The long-term vision is an interface where managing AI agents feels like playing the Sims, but the results are real things built.

- **Agents as characters** you can see, assign, monitor, and redirect, each with visible roles (designer, coder, writer, reviewer), stats, context usage, and tools.
- **Desks as directories** — drag an agent to a desk to assign it to a project or working directory.
- **An office as a project** — with a Kanban board on the wall where idle agents can pick up tasks autonomously.
- **Deep inspection** — click any agent to see its model, branch, system prompt, and full work history. Interrupt it, chat with it, or redirect it.
- **Token health bars** — rate limits and context windows visualized as in-game stats.
- **Fully customizable** — upload your own character sprites, themes, and office assets. Eventually maybe even move beyond pixel art into 3D or VR.

## Credits

This is a **fork** of the original [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) extension by **[pablodelucca](https://github.com/pablodelucca)** ([Marketplace](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents)).

**All credit for the original work goes to the [pixel-agents-hq](https://github.com/pixel-agents-hq/pixel-agents) contributors:**

- [@pablodelucca](https://github.com/pablodelucca) — creator and lead developer
- [@NNTin](https://github.com/NNTin) — Claude Code hooks integration, Tailwind v4 migration
- [@daniel-lxs](https://github.com/daniel-lxs) — early contributions
- [@jakedguez](https://github.com/jakedguez) — early contributions
- [@nickytonline](https://github.com/nickytonline) — early contributions
- [@michael-p](https://github.com/michael-p) — early contributions
- And all other [contributors](https://github.com/pixel-agents-hq/pixel-agents/graphs/contributors)

Characters are based on the amazing work of [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

**This fork's only change** is compatibility with [OpenCode](https://opencode.ai) as the agent backend. Everything else — code, sprites, furniture, layouts — is the original work.

## Supporting the Original Project

If you find this useful, consider supporting the original project and its creator:

<a href="https://github.com/sponsors/pablodelucca">
  <img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github" alt="GitHub Sponsors">
</a>
<a href="https://ko-fi.com/pablodelucca">
  <img src="https://img.shields.io/badge/Support-Ko--fi-ff5e5b?logo=ko-fi" alt="Ko-fi">
</a>

## License

This project is licensed under the [MIT License](LICENSE). Same as the original.
