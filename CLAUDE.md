# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccundo is a Node.js CLI tool that provides intelligent undo/redo functionality for Claude Code sessions. It parses Claude Code session files (.jsonl) to track file operations and allows selective reverting with cascading safety and detailed previews.

## Development Commands

### Testing
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode

### Demo
- `npm run demo` - Run language demo script

### Installation & Development Setup
- `npm install` - Install dependencies  
- `npm link` - Link package globally for development

## Architecture Overview

The codebase follows a modular architecture with clear separation of concerns:

### Core Components (`src/core/`)

- **ClaudeSessionParser.js** - Parses Claude Code session files from `~/.claude/projects/`, extracts file operations from tool_use entries
- **Operation.js** - Core data model representing file operations with types (create, edit, delete, rename, bash commands)
- **UndoManager.js** - Handles undoing operations by reversing file changes, creates backups in `~/.ccundo/backups/`
- **RedoManager.js** - Handles redoing previously undone operations
- **UndoTracker.js** - Tracks which operations have been undone, maintains state across sessions
- **SessionTracker.js** - Manages local ccundo sessions (alternative to Claude Code sessions)
- **OperationPreview.js** - Generates diff previews showing what would change before undo/redo

### Supporting Modules

- **i18n/** - Internationalization support (English, Japanese, French, Spanish, German)
- **utils/formatting.js** - Time formatting utilities
- **hooks/claude-tracker.js** - Integration hooks for Claude Code

### CLI Entry Points

- **bin/ccundo.js** - Main CLI interface using Commander.js
- **index.js** - Module exports for programmatic use

## Key Behaviors

### Session Detection
- Automatically detects Claude Code sessions by parsing `~/.claude/projects/<project-path>/` directory
- Falls back to local ccundo sessions if needed
- Cross-platform path handling for session file locations

### Operation Cascading  
- Undoing an operation also undoes all subsequent operations to maintain consistency
- Redoing an operation also redoes all prior undone operations in correct order

### Backup Strategy
- Creates backups in `~/.ccundo/backups/` before making changes
- Backup files named with operation ID for traceability

### Supported Operations
- File create/edit/delete/rename
- Directory create/delete  
- Bash commands (requires manual intervention for undo)

## Important Files

- `jest.config.js` - Jest configuration for ES modules
- `package.json` - Defines CLI entry point and dependencies
- Configuration stored in `~/.ccundo/config.json`
- Undo state tracked in `~/.ccundo/undone-operations.json`