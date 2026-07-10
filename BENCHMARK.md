# Benchmark and Headless Testing

EmuDevz is primarily an interactive game, but the same level tests can also be
useful outside the GUI. The CLI runner provides a small headless entry point for
replaying level tests from a terminal, CI job, or external benchmark harness.

The CLI does not replace the game flow. It does not import or export save files,
unlock levels, package player solutions, or include generated answer data. It
only builds the same virtual filesystems used by the levels, loads optional
local solution snapshots, and runs the existing test files.

The CLI can also validate and repack existing `.devz` save packages. These
commands operate on package files and unpacked package directories. They do not
read or write live browser, Electron, Steam, or IndexedDB storage directly.

## Why a CLI runner?

- Repeat a level's tests without driving the browser or Electron UI.
- Validate progressive solutions where each level builds on earlier files.
- Produce machine-readable output with `--json`.
- Support external benchmarking without checking save files or answer snapshots
  into this repository.
- Make regressions easier to reproduce when a test behaves differently between
  local development, packaged builds, and released builds.

## Basic usage

```bash
npm run cli -- test <level>
npm run cli -- test <level> --from <earlier-level>
npm run cli -- test <level> --solution-dir <dir>
npm run cli -- test <level> --json
npm run cli -- save check <file.devz>
npm run cli -- save restore <file.devz> --to <dir>
npm run cli -- save backup <dir> --to <file.devz>
```

Examples:

```bash
npm run cli -- test 1.1
npm run cli -- test 5a.16 --solution-dir ./solutions/cpu
npm run cli -- test 5a.16 --from 5a.1 --solution-dir ./solutions/cpu
npm run --silent cli -- test cpu-the-golden-log --json
npm run cli -- save check ./backup.devz
npm run cli -- save restore ./backup.devz --to ./save-package
npm run cli -- save backup ./save-package --to ./backup-copy.devz
```

Run `npm run cli -- --help` for the current syntax.

## Validation

After changing the CLI runner, run at least one small smoke test:

```bash
npm run --silent cli -- test 1.1
```

Expected result:

```text
1.1 getting-started-introduction: 0/0 passed
```

For a progressive snapshot check, point `--solution-dir` at snapshots outside
the repository:

```bash
npm run --silent cli -- test 3.5 --from 3.3 --solution-dir /path/to/solutions --json
```

Expected summary shape:

```json
{
  "summary": {
    "passed": 32,
    "failed": 0,
    "total": 32
  }
}
```

Before opening a CLI-related pull request, include:

- the exact command lines that were run;
- the total passed, failed, and total test counts;
- the branch and commit tested;
- whether any external solution snapshots were used;
- a note confirming that save files, exported `.devz` packages, and release
  assets were not added to the repository.

For save package changes, also validate a package round trip:

```bash
npm run --silent cli -- save check /path/to/backup.devz
npm run --silent cli -- save restore /path/to/backup.devz --to /tmp/emudevz-save-package --force
npm run --silent cli -- save backup /tmp/emudevz-save-package --to /tmp/emudevz-save-copy.devz
npm run --silent cli -- save check /tmp/emudevz-save-copy.devz
```

Do not run save package tests against the live Electron/Steam storage directory.
Use a temporary directory or an exported `.devz` file.

## Solution snapshots

`--solution-dir` may point to a single code snapshot or to a directory of
per-level snapshots. Per-level snapshots can be named with the level's human id,
slug, or folder name:

```text
solutions/
  5a.1/
    code/
      index.js
      cpu/CPU.js
  5a.2/
    code/
      index.js
      cpu/CPU.js
```

When `--from` is used, snapshots up to the tested level are layered in level
order. This matches the in-game progression model where the previous solution is
usually the base for the next level.

Keep benchmark solution directories outside this repository unless they are
small, intentional fixtures. Do not commit personal `.devz` saves, exported save
packages, generated benchmark answers, or copied game release assets.

## Notes for automated agents

Automated agents should treat the CLI as a validator, not as a substitute for
reading the level source. A good run should:

- record the exact command, level range, branch, and commit;
- use `--json` when collecting benchmark results;
- keep solution snapshots outside the source tree by default;
- avoid modifying packaged game assets, save files, or Steam/Electron data;
- stop and report the first unexplained runner mismatch instead of stacking
  speculative fixes;
- separate CLI runner issues from game engine, release packaging, or save-file
  issues.

If a video, audio, or integration test differs between builds, capture the
engine/package versions and the exact failing frame or sample before changing
user code. Those mismatches are usually separate compatibility investigations,
not CLI runner changes.
