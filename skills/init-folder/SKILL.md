---
name: init-folder
description: >-
  Initialize the current project folder with the Pi init-folder wizard. Use when
  the user says "initialize this folder", "set up this folder", "run init-folder",
  "bootstrap this project", or otherwise wants a complete project foundation
  created in the current working directory. Invoke the installed `/init-folder`
  command rather than manually recreating its files. Do not initialize an
  arbitrary path, bypass the preview, overwrite conflicts silently, or run Git
  without explicit approval.
---

# Initialize Folder

Use the `pi-init-folder` package's `/init-folder` command for project-folder initialization.

## Required behavior

1. Treat requests such as “initialize this folder” or “set up this project” as a request to run `/init-folder`.
2. Operate only on the current Pi working directory; do not substitute a manually scripted setup.
3. Let the wizard derive the project name from the directory basename and ask for the project description.
4. Require the wizard's complete preview and explicit approval before any writes or Git command.
5. Preserve per-file conflict prompts; never overwrite existing files silently.
6. If the command is unavailable, report that the `pi-init-folder` package/extension is not installed instead of approximating its behavior.

## Scope

This skill is a routing and usage wrapper for the `pi-init-folder` extension. The extension owns the supported defaults, generated files, safety checks, and tests. Do not duplicate its implementation or invent additional initialization modules here.
