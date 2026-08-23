# Tisaic.github.io

A single-page static site on GitHub Pages, used as a sandbox for physics and control
experiments driven from a phone.

| Page | What it is |
|---|---|
| [`index.html`](index.html) | The hub — debug console, docs viewer, launchers. |
| [`flowsim.html`](flowsim.html) | **FlowSim** — a GPU lattice-field physics engine. D3Q19 fluid, passive scalar, elastic solid; WebGPU and a CPU reference verified against each other cell by cell. |
| [`ngrc.html`](ngrc.html) | **NGRC playground** — four tabs, each pitting a next-generation reservoir model against a common alternative: chaotic forecasting, a soft sensor, a finger trace, an anti-slosh axis. |
| [`flexisim.html`](flexisim.html) | **FlexiSim** — compliant serial chains. Lumped nonlinear joints plus lattice links, a soft sensor for the tool error, a CNC **contouring** tab, a one-button **route–limit–run–deploy** commissioning pilot (`lib/pilot/`), and a controller given nothing about the plant. |

Everything is self-hosted: no CDNs, no build step beyond one shell script.

**Start with [`CLAUDE.md`](CLAUDE.md)** — the rules, the current state of each page, and
where things live. The measurement record behind all of it is in
[`docs/history/`](docs/history/), and it is worth reading before re-deciding anything: it
mostly records what was measured, rejected, and why.
