---
name: writing-guidelines
description: Review docs/prose for Writing Guidelines compliance. Use when asked to "review my docs", "check writing style", "audit prose", "review docs voice and tone", or "check this page against the writing handbook".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Writing Guidelines

Review files for compliance with Writing Guidelines.

## How It Works

1. Read the pinned guidelines in `references/command.md` (see below)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are a pinned local copy: `references/command.md`, from https://github.com/vercel-labs/writing-guidelines at commit `83e2316b034cf572400513538e4e4da01c4cc742`. Read that file; do not fetch rules from the network. To update, download a specific commit's `command.md`, review the diff, and update the SHA here.

## Usage

When a user provides a file or pattern argument:
1. Read the guidelines from `references/command.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
