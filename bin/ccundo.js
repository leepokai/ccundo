#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { SessionTracker } from '../src/core/SessionTracker.js';
import { UndoManager } from '../src/core/UndoManager.js';
import { formatDistance } from '../src/utils/formatting.js';
import { Operation, OperationType } from '../src/core/Operation.js';
import { ClaudeSessionParser } from '../src/core/ClaudeSessionParser.js';
import { OperationPreview } from '../src/core/OperationPreview.js';
import { i18n } from '../src/i18n/i18n.js';
import { UndoTracker } from '../src/core/UndoTracker.js';
import { RedoManager } from '../src/core/RedoManager.js';
import { TurnManager } from '../src/core/TurnManager.js';
import { TurnUndoManager } from '../src/core/TurnUndoManager.js';
import { Turn } from '../src/core/Turn.js';
import path from 'path';

// Initialize i18n
await i18n.init();

const program = new Command();

program
  .name('ccundo')
  .description('Undo individual steps performed by Claude Code within a session')
  .version('1.1.1');

program
  .command('list')
  .description(i18n.t('cmd.list.description'))
  .option('-a, --all', i18n.t('opt.all'))
  .option('-s, --session <id>', i18n.t('opt.session'))
  .option('--claude', i18n.t('opt.claude'), true)
  .option('--local', i18n.t('opt.local'))
  .action(async (options) => {
    try {
      let operations = [];
      
      if (!options.local) {
        // Default: Read from Claude Code session
        const parser = new ClaudeSessionParser();
        const sessionFile = await parser.getCurrentSessionFile();
        
        if (!sessionFile) {
          console.log(chalk.yellow('No active Claude Code session found in this directory.'));
          console.log(chalk.gray('Make sure you are in a directory where Claude Code has been used.'));
          return;
        }
        
        operations = await parser.parseSessionFile(sessionFile);
        console.log(chalk.bold(`\nOperations from Claude Code session:\n`));
      } else {
        // Use local ccundo tracking
        const sessionId = options.session || await SessionTracker.getCurrentSession();
        if (!sessionId) {
          console.log(chalk.yellow('No local ccundo session found.'));
          return;
        }

        const tracker = new SessionTracker(sessionId);
        await tracker.init();
        operations = await tracker.getOperations(options.all);
        console.log(chalk.bold(`\nOperations in local session ${sessionId}:\n`));
      }
      
      if (operations.length === 0) {
        console.log(chalk.yellow('No operations found.'));
        return;
      }

      operations.forEach((op, index) => {
        const status = op.undone ? chalk.red('[UNDONE]') : chalk.green('[ACTIVE]');
        const time = formatDistance(op.timestamp);
        
        console.log(`${index + 1}. ${status} ${chalk.cyan(op.type)} - ${time}`);
        console.log(`   ID: ${op.id}`);
        
        switch (op.type) {
          case 'file_create':
          case 'file_edit':
          case 'file_delete':
            console.log(`   File: ${op.data.filePath}`);
            break;
          case 'file_rename':
            console.log(`   From: ${op.data.oldPath}`);
            console.log(`   To: ${op.data.newPath}`);
            break;
          case 'directory_create':
          case 'directory_delete':
            console.log(`   Directory: ${op.data.dirPath}`);
            break;
          case 'bash_command':
            console.log(`   Command: ${op.data.command}`);
            break;
        }
        console.log('');
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('undo [operation-id]')
  .description('Undo operations from the current Claude Code session')
  .option('-s, --session <id>', 'Specify session ID')
  .option('-y, --yes', 'Skip confirmation')
  .option('--local', 'Use local ccundo tracking instead of Claude sessions')
  .action(async (operationId, options) => {
    try {
      let operations = [];
      let sessionFile = null;
      
      if (options.local) {
        // Use local ccundo tracking
        const sessionId = options.session || await SessionTracker.getCurrentSession();
        if (!sessionId) {
          console.log(chalk.yellow('No local ccundo session found.'));
          return;
        }

        const tracker = new SessionTracker(sessionId);
        await tracker.init();
        operations = await tracker.getOperations();
      } else {
        // Use Claude Code sessions
        const parser = new ClaudeSessionParser();
        sessionFile = await parser.getCurrentSessionFile();
        
        if (!sessionFile) {
          console.log(chalk.yellow('No active Claude Code session found in this directory.'));
          return;
        }
        
        operations = await parser.parseSessionFile(sessionFile);
      }
      
      if (operations.length === 0) {
        console.log(chalk.yellow('No operations to undo.'));
        return;
      }

      // Reverse operations so most recent is first
      operations.reverse();
      
      let selectedIndex = 0;
      
      if (!operationId) {
        const choices = operations.map((op, index) => {
          const operationsToUndo = index + 1;
          let name = `${op.type} - ${formatDistance(op.timestamp)}`;
          
          if (operationsToUndo > 1) {
            name += chalk.red(` (+ ${operationsToUndo - 1} more will be undone)`);
          }
          
          return {
            name: name,
            value: index,
            short: `${op.type} (${operationsToUndo} ops)`
          };
        });
        
        console.log(chalk.yellow('\\n⚠️  Cascading undo: Selecting an operation will undo it and ALL operations that came after it.\\n'));
        
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'selectedIndex',
          message: 'Select operation to undo:',
          choices: choices,
          pageSize: 15
        }]);
        
        selectedIndex = answer.selectedIndex;
      } else {
        selectedIndex = operations.findIndex(op => op.id === operationId);
        if (selectedIndex === -1) {
          console.log(chalk.red(`Operation ${operationId} not found.`));
          return;
        }
      }
      
      const operationsToUndo = operations.slice(0, selectedIndex + 1);
      
      if (!options.yes) {
        console.log(chalk.yellow(`\\nThis will undo ${operationsToUndo.length} operation(s):\\n`));
        
        for (let i = 0; i < operationsToUndo.length; i++) {
          const op = operationsToUndo[i];
          console.log(`${chalk.bold(`${i + 1}.`)} ${chalk.cyan(op.type)} - ${formatDistance(op.timestamp)}`);
          
          const preview = await OperationPreview.generatePreview(op);
          console.log(`   ${preview.preview.replace(/\\n/g, '\\n   ')}`);
          console.log('');
        }
        
        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Are you sure you want to undo these ${operationsToUndo.length} operations?`,
          default: false
        }]);
        
        if (!confirm.proceed) {
          console.log(chalk.yellow('Undo cancelled.'));
          return;
        }
      }

      const undoManager = new UndoManager();
      await undoManager.init();
      
      const undoTracker = new UndoTracker();
      await undoTracker.init();
      
      console.log(chalk.cyan(`\\nUndoing ${operationsToUndo.length} operations...\\n`));
      
      let successCount = 0;
      let failCount = 0;
      
      for (const operation of operationsToUndo) {
        const result = await undoManager.undo(operation);
        
        if (result.success) {
          successCount++;
          console.log(chalk.green(`✓ ${result.message}`));
          if (result.backupPath) {
            console.log(chalk.gray(`  Backup saved to: ${result.backupPath}`));
          }
          
          // Mark operation as undone if using Claude Code sessions
          if (sessionFile) {
            await undoTracker.markAsUndone(operation.id, sessionFile);
          }
        } else {
          failCount++;
          console.log(chalk.red(`✗ ${result.message}`));
        }
      }
      
      console.log(chalk.bold(`\\nCompleted: ${chalk.green(successCount)} successful, ${chalk.red(failCount)} failed`));
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('redo [operation-id]')
  .description(i18n.t('cmd.redo.description'))
  .option('-s, --session <id>', i18n.t('opt.session'))
  .option('-y, --yes', i18n.t('opt.yes'))
  .option('--local', 'Use local ccundo tracking instead of Claude sessions')
  .action(async (operationId, options) => {
    try {
      let operations = [];
      let sessionFile = null;
      
      if (options.local) {
        // Use local ccundo tracking
        const sessionId = options.session || await SessionTracker.getCurrentSession();
        if (!sessionId) {
          console.log(chalk.yellow('No local ccundo session found.'));
          return;
        }

        const tracker = new SessionTracker(sessionId);
        await tracker.init();
        // For local tracking, we'd need to implement redo tracking
        console.log(chalk.yellow('Redo for local tracking is not yet implemented.'));
        return;
      } else {
        // Use Claude Code sessions
        const parser = new ClaudeSessionParser();
        sessionFile = await parser.getCurrentSessionFile();
        
        if (!sessionFile) {
          console.log(chalk.yellow('No active Claude Code session found in this directory.'));
          return;
        }
        
        // Get all operations first
        const allOperations = await parser.parseSessionFile(sessionFile);
        // Then get undone operations by temporarily disabling filtering
        const undoTracker = new UndoTracker();
        await undoTracker.init();
        
        // Get the original operations without filtering by calling parser method directly
        const parser2 = new ClaudeSessionParser();
        const originalOperations = [];
        
        // We need to parse the session file without the undo filtering
        const { createReadStream } = await import('fs');
        const { createInterface } = await import('readline');
        
        const fileStream = createReadStream(sessionFile);
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        for await (const line of rl) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === 'assistant' && entry.message?.content) {
              for (const content of entry.message.content) {
                if (content.type === 'tool_use') {
                  const operation = parser2.extractOperation(content, entry.timestamp);
                  if (operation) {
                    originalOperations.push(operation);
                  }
                }
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
        
        operations = await undoTracker.getUndoneOperationsList(originalOperations, sessionFile);
      }
      
      if (operations.length === 0) {
        console.log(chalk.yellow(i18n.t('msg.no_operations_to_redo')));
        return;
      }

      // Operations are already in reverse order (most recent undo first)
      let selectedIndex = 0;
      
      if (!operationId) {
        const choices = operations.map((op, index) => {
          const operationsToRedo = index + 1;
          let name = `${op.type} - ${formatDistance(op.timestamp)}`;
          
          if (operationsToRedo > 1) {
            name += chalk.green(` (+ ${operationsToRedo - 1} more will be redone)`);
          }
          
          return {
            name: name,
            value: index,
            short: `${op.type} (${operationsToRedo} ops)`
          };
        });
        
        console.log(chalk.yellow('\\n⚠️  Cascading redo: Selecting an operation will redo it and ALL undone operations that came before it.\\n'));
        
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'selectedIndex',
          message: i18n.t('prompt.select_operation_redo'),
          choices: choices,
          pageSize: 15
        }]);
        
        selectedIndex = answer.selectedIndex;
      } else {
        selectedIndex = operations.findIndex(op => op.id === operationId);
        if (selectedIndex === -1) {
          console.log(chalk.red(`Operation ${operationId} not found.`));
          return;
        }
      }
      
      const operationsToRedo = operations.slice(0, selectedIndex + 1);
      
      if (!options.yes) {
        console.log(chalk.yellow(`\\n${i18n.t('header.this_will_redo', { count: operationsToRedo.length })}\\n`));
        
        for (let i = 0; i < operationsToRedo.length; i++) {
          const op = operationsToRedo[i];
          console.log(`${chalk.bold(`${i + 1}.`)} ${chalk.cyan(op.type)} - ${formatDistance(op.timestamp)}`);
          console.log('');
        }
        
        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: i18n.t('prompt.confirm_redo', { count: operationsToRedo.length }),
          default: false
        }]);
        
        if (!confirm.proceed) {
          console.log(chalk.yellow('Redo cancelled.'));
          return;
        }
      }

      const redoManager = new RedoManager();
      await redoManager.init();
      
      const undoTracker = new UndoTracker();
      await undoTracker.init();
      
      console.log(chalk.cyan(`\\n${i18n.t('header.redoing', { count: operationsToRedo.length })}\\n`));
      
      let successCount = 0;
      let failCount = 0;
      
      // Redo operations in reverse order (oldest undone operation first)
      for (const operation of operationsToRedo.reverse()) {
        const result = await redoManager.redo(operation);
        
        if (result.success) {
          successCount++;
          console.log(chalk.green(`✓ ${result.message}`));
          if (result.backupPath) {
            console.log(chalk.gray(`  Backup saved to: ${result.backupPath}`));
          }
          
          // Mark operation as redone (remove from undone list)
          if (sessionFile) {
            await undoTracker.markAsRedone(operation.id, sessionFile);
          }
        } else {
          failCount++;
          console.log(chalk.red(`✗ ${result.message}`));
        }
      }
      
      console.log(chalk.bold(`\\nCompleted: ${chalk.green(successCount)} successful, ${chalk.red(failCount)} failed`));
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('preview [operation-id]')
  .description('Preview what would be undone without making changes')
  .option('-s, --session <id>', 'Specify session ID')
  .option('--local', 'Use local ccundo tracking instead of Claude sessions')
  .action(async (operationId, options) => {
    try {
      let operations = [];
      
      if (options.local) {
        const sessionId = options.session || await SessionTracker.getCurrentSession();
        if (!sessionId) {
          console.log(chalk.yellow('No local ccundo session found.'));
          return;
        }

        const tracker = new SessionTracker(sessionId);
        await tracker.init();
        operations = await tracker.getOperations();
      } else {
        const parser = new ClaudeSessionParser();
        const sessionFile = await parser.getCurrentSessionFile();
        
        if (!sessionFile) {
          console.log(chalk.yellow('No active Claude Code session found in this directory.'));
          return;
        }
        
        operations = await parser.parseSessionFile(sessionFile);
      }
      
      if (operations.length === 0) {
        console.log(chalk.yellow('No operations found.'));
        return;
      }

      operations.reverse();
      
      let selectedIndex = 0;
      
      if (!operationId) {
        const choices = operations.map((op, index) => {
          const operationsToUndo = index + 1;
          let name = `${op.type} - ${formatDistance(op.timestamp)}`;
          
          if (operationsToUndo > 1) {
            name += chalk.gray(` (+ ${operationsToUndo - 1} more would be undone)`);
          }
          
          return {
            name: name,
            value: index
          };
        });
        
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'selectedIndex',
          message: 'Select operation to preview:',
          choices: choices,
          pageSize: 15
        }]);
        
        selectedIndex = answer.selectedIndex;
      } else {
        selectedIndex = operations.findIndex(op => op.id === operationId);
        if (selectedIndex === -1) {
          console.log(chalk.red(`Operation ${operationId} not found.`));
          return;
        }
      }
      
      const operationsToUndo = operations.slice(0, selectedIndex + 1);
      
      console.log(chalk.blue(`\\n📋 Preview: Would undo ${operationsToUndo.length} operation(s):\\n`));
      
      for (let i = 0; i < operationsToUndo.length; i++) {
        const op = operationsToUndo[i];
        console.log(`${chalk.bold(`${i + 1}.`)} ${chalk.cyan(op.type)} - ${formatDistance(op.timestamp)}`);
        
        const preview = await OperationPreview.generatePreview(op);
        console.log(`   ${preview.preview.replace(/\\n/g, '\\n   ')}`);
        console.log('');
      }
      
      console.log(chalk.gray('💡 To actually perform these undos, run: ccundo undo'));
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('sessions')
  .description('List all available Claude Code sessions')
  .option('--local', 'Show local ccundo sessions instead of Claude sessions')
  .action(async (options) => {
    try {
      if (options.local) {
        const sessions = await SessionTracker.listSessions();
        const currentSession = await SessionTracker.getCurrentSession();
        
        if (sessions.length === 0) {
          console.log(chalk.yellow('No local sessions found.'));
          return;
        }
        
        console.log(chalk.bold('\nAvailable local sessions:\n'));
        
        sessions.forEach(session => {
          const isCurrent = session === currentSession;
          const marker = isCurrent ? chalk.green('→ ') : '  ';
          console.log(`${marker}${session}`);
        });
      } else {
        const parser = new ClaudeSessionParser();
        const sessions = await parser.getAllSessions();
        
        if (sessions.length === 0) {
          console.log(chalk.yellow('No Claude Code sessions found.'));
          return;
        }
        
        console.log(chalk.bold('\nAvailable Claude Code sessions:\n'));
        
        const currentProjectDir = await parser.getCurrentProjectDir();
        const currentProjectDirName = path.basename(currentProjectDir);

        sessions.forEach(session => {
          const isCurrent = session.rawProjectDir === currentProjectDirName;
          const marker = isCurrent ? chalk.green('→ ') : '  ';
          console.log(`${marker}${chalk.cyan(session.id)}`);
          console.log(`  Project: ${session.project}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('session <id>')
  .description(i18n.t('cmd.session.description'))
  .action(async (sessionId) => {
    try {
      await SessionTracker.setCurrentSession(sessionId);
      console.log(chalk.green(`Switched to session: ${sessionId}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('language [lang]')
  .description(i18n.t('cmd.language.description'))
  .action(async (lang) => {
    try {
      if (!lang) {
        // Show current language and available options
        const current = i18n.getCurrentLanguage();
        const available = i18n.getAvailableLanguages();
        
        console.log(chalk.bold(`\\nCurrent language: ${chalk.cyan(current.name)} (${current.code})\\n`));
        console.log(chalk.bold('Available languages:'));
        available.forEach(({ code, name }) => {
          const marker = code === current.code ? chalk.green('→ ') : '  ';
          console.log(`${marker}${code} - ${name}`);
        });
        console.log(chalk.gray('\\nUsage: ccundo language <code>'));
        return;
      }
      
      await i18n.setLanguage(lang);
      const newLang = i18n.getCurrentLanguage();
      console.log(chalk.green(i18n.t('msg.language_set', { language: newLang.name })));
    } catch (error) {
      const available = i18n.getAvailableLanguages().map(l => l.code).join(', ');
      console.error(chalk.red(i18n.t('msg.language_invalid', { languages: available })));
    }
  });

// Turn commands
program
  .command('turns')
  .description('List conversation turns (grouped operations)')
  .option('--auto-group', 'Automatically group operations into turns')
  .option('--gap <minutes>', 'Time gap in minutes for auto-grouping (default: 5)', '5')
  .action(async (options) => {
    try {
      const parser = new ClaudeSessionParser();
      const sessionFile = await parser.getCurrentSessionFile();
      
      if (!sessionFile) {
        console.log(chalk.yellow('No active Claude Code session found.'));
        return;
      }
      
      const operations = await parser.parseSessionFile(sessionFile);
      const turnUndoManager = new TurnUndoManager();
      await turnUndoManager.init();
      
      if (options.autoGroup) {
        console.log(chalk.cyan('Auto-grouping operations into turns...'));
        const result = await turnUndoManager.autoGroupOperations(operations, parseInt(options.gap));
        console.log(chalk.green(result.message));
        console.log('');
      }
      
      const turnsWithOps = turnUndoManager.getTurnsWithOperations(operations);
      
      if (turnsWithOps.length === 0) {
        console.log(chalk.yellow('No turns found. Use ccundo group-turns to create turns automatically.'));
        return;
      }
      
      console.log(chalk.bold('\\nConversation Turns:\\n'));
      
      turnsWithOps.forEach((turnGroup, index) => {
        const { turn, operations, count, description } = turnGroup;
        
        if (turn) {
          const duration = turn.getDuration();
          const durationStr = duration ? `(${Math.round(duration/1000)}s)` : '';
          
          console.log(`${index + 1}. ${chalk.cyan('TURN')} - ${formatDistance(turn.startTime)} ${durationStr}`);
          console.log(`   ID: ${turn.id}`);
          console.log(`   Description: ${description}`);
          console.log(`   Operations: ${count}`);
          
          if (operations.length > 0) {
            const firstOp = operations[0];
            const lastOp = operations[operations.length - 1];
            console.log(`   Range: ${formatDistance(new Date(firstOp.timestamp))} → ${formatDistance(new Date(lastOp.timestamp))}`);
          }
        } else {
          console.log(`${index + 1}. ${chalk.gray('UNGROUPED')} - ${count} operations`);
          console.log(`   Description: ${description}`);
        }
        console.log('');
      });
      
      console.log(chalk.gray(`Total: ${turnsWithOps.length} groups, ${operations.length} operations`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('undo-turn [turn-id]')
  .description('Undo an entire conversation turn')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (turnId, options) => {
    try {
      const parser = new ClaudeSessionParser();
      const sessionFile = await parser.getCurrentSessionFile();
      
      if (!sessionFile) {
        console.log(chalk.yellow('No active Claude Code session found.'));
        return;
      }
      
      const operations = await parser.parseSessionFile(sessionFile);
      const turnUndoManager = new TurnUndoManager();
      await turnUndoManager.init();
      
      const availableTurns = turnUndoManager.getTurnsForUndoSelection(operations);
      
      if (availableTurns.length === 0) {
        console.log(chalk.yellow('No operations found to undo.'));
        return;
      }
      
      let selectedTurnGroup = null;
      
      if (!turnId) {
        const choices = availableTurns.map((group) => ({
          name: group.isUngrouped 
            ? `${group.description} - ${group.operations.length} operations`
            : `${group.turn.description} - ${formatDistance(group.turn.startTime)} (${group.totalCascadedOps} ops)${group.cascadeWarning}`,
          value: group,
          short: group.description
        }));
        
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'selectedTurn',
          message: 'Select turn to undo:',
          choices: choices,
          pageSize: 10
        }]);
        
        selectedTurnGroup = answer.selectedTurn;
      } else {
        selectedTurnGroup = availableTurns.find(group => 
          group.turn ? group.turn.id === turnId : turnId === 'ungrouped'
        );
        if (!selectedTurnGroup) {
          console.log(chalk.red(`Turn ${turnId} not found.`));
          return;
        }
      }
      
      const { turn, operations: turnOps, isUngrouped, cascadeWarning, totalCascadedOps } = selectedTurnGroup;
      
      if (!options.yes) {
        console.log(chalk.yellow(`\\nThis will undo the entire ${isUngrouped ? 'ungrouped operations' : 'turn'}:\\n`));
        console.log(`${chalk.bold('Description:')} ${selectedTurnGroup.description}`);
        console.log(`${chalk.bold('Operations:')} ${turnOps.length}`);
        if (!isUngrouped) {
          console.log(`${chalk.bold('Time:')} ${turn.startTime.toLocaleString()}`);
          if (cascadeWarning) {
            console.log(`${chalk.bold('⚠️  Cascading:')} This will also undo ${totalCascadedOps - turnOps.length} operations from future turns`);
            console.log(`${chalk.bold('Total operations:')} ${totalCascadedOps}`);
          }
        }
        console.log('');
        
        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Are you sure you want to undo this entire turn?`,
          default: false
        }]);
        
        if (!confirm.proceed) {
          console.log(chalk.yellow('Turn undo cancelled.'));
          return;
        }
      }
      
      const result = isUngrouped 
        ? await turnUndoManager.undoUngroupedOperations(operations)
        : await turnUndoManager.undoTurnWithCascading(turn.id, operations);
      
      if (result.success) {
        console.log(chalk.green(`\\n✅ ${result.message}`));
        
        // Mark operations as undone in session tracking
        const undoTracker = new UndoTracker();
        await undoTracker.init();
        
        for (const op of turnOps) {
          await undoTracker.markAsUndone(op.id, sessionFile);
        }
      } else {
        console.log(chalk.red(`\\n❌ ${result.message}`));
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('preview-turn [turn-id]')
  .description('Preview what would be undone for a conversation turn')
  .option('-s, --session <id>', 'Specify session ID')
  .option('--detailed', 'Show detailed diff previews')
  .action(async (turnId, options) => {
    try {
      const parser = new ClaudeSessionParser();
      const sessionFile = await parser.getCurrentSessionFile();
      
      if (!sessionFile) {
        console.log(chalk.yellow('No active Claude Code session found.'));
        return;
      }
      
      const operations = await parser.parseSessionFile(sessionFile);
      const turnUndoManager = new TurnUndoManager();
      await turnUndoManager.init();
      
      const turnsWithOps = turnUndoManager.getTurnsWithOperations(operations);
      const actualTurns = turnsWithOps.filter(group => group.turn);
      
      if (actualTurns.length === 0) {
        console.log(chalk.yellow('No turns found. Use "ccundo group-turns" to create turns first.'));
        return;
      }
      
      let selectedTurnGroup = null;
      
      if (!turnId) {
        // Interactive selection
        const choices = actualTurns.map((group) => ({
          name: `${group.description} - ${formatDistance(group.turn.startTime)} (${group.operations.length} ops)`,
          value: group,
          short: group.turn.description
        }));
        
        const answer = await inquirer.prompt([{
          type: 'list',
          name: 'selectedTurn',
          message: 'Select turn to preview:',
          choices: choices,
          pageSize: 10
        }]);
        
        selectedTurnGroup = answer.selectedTurn;
      } else {
        selectedTurnGroup = actualTurns.find(group => group.turn.id === turnId);
        if (!selectedTurnGroup) {
          console.log(chalk.red(`Turn ${turnId} not found.`));
          return;
        }
      }
      
      const { turn } = selectedTurnGroup;
      console.log(chalk.cyan('\\n🔍 Generating turn preview...\\n'));
      
      const previewResult = await turnUndoManager.previewTurn(turn.id, operations);
      
      if (!previewResult.success) {
        console.log(chalk.red(`❌ ${previewResult.message}`));
        return;
      }
      
      const { turn: previewTurn, previews, summary } = previewResult;
      
      // Show turn summary
      console.log(chalk.bold(`📋 Turn Preview: ${previewTurn.description}`));
      console.log(chalk.gray(`   Time: ${previewTurn.startTime.toLocaleString()}`));
      if (summary.estimatedDuration) {
        console.log(chalk.gray(`   Duration: ${Math.round(summary.estimatedDuration/1000)}s`));
      }
      
      if (summary.cascadedTurns > 1) {
        console.log(chalk.yellow(`   ⚠️  Cascading ${summary.cascadedTurns} turns (including future operations)`));
      }
      console.log(chalk.gray(`   Operations: ${summary.totalOperations} total, ${summary.canUndoCount} can undo`));
      
      if (summary.warningCount > 0) {
        console.log(chalk.yellow(`   ⚠️  ${summary.warningCount} operations have warnings`));
      }
      console.log('');
      
      // Show individual operation previews
      console.log(chalk.bold('📝 Operations to be undone:\\n'));
      
      previews.forEach((item, index) => {
        const { operation, preview, canUndo, warning } = item;
        const status = canUndo ? chalk.green('✅') : chalk.red('❌');
        const opType = chalk.cyan(operation.type);
        const timeAgo = formatDistance(operation.timestamp);
        
        console.log(`${index + 1}. ${status} ${opType} - ${timeAgo}`);
        console.log(`   ID: ${operation.id}`);
        
        if (warning) {
          console.log(chalk.yellow(`   ⚠️  Warning: ${warning}`));
        }
        
        if (options.detailed || !canUndo) {
          console.log(chalk.gray(`   Preview: ${preview}`));
        } else {
          // Show abbreviated preview
          const lines = preview.split('\\n');
          if (lines.length > 3) {
            console.log(chalk.gray(`   Preview: ${lines[0]}`));
            console.log(chalk.gray(`   ... (${lines.length - 1} more lines, use --detailed for full preview)`));
          } else {
            console.log(chalk.gray(`   Preview: ${preview}`));
          }
        }
        console.log('');
      });
      
      // Show summary and next steps
      console.log(chalk.bold('📊 Summary:'));
      console.log(`   • ${chalk.green(summary.canUndoCount)} operations can be undone automatically`);
      
      const failCount = summary.totalOperations - summary.canUndoCount;
      if (failCount > 0) {
        console.log(`   • ${chalk.red(failCount)} operations require manual intervention`);
      }
      
      if (summary.warningCount > 0) {
        console.log(`   • ${chalk.yellow(summary.warningCount)} operations have warnings`);
      }
      
      console.log('\\n' + chalk.bold('🎯 Next steps:'));
      console.log(`   • To proceed: ${chalk.green('ccundo undo-turn ' + turn.id)}`);
      console.log(`   • To proceed without confirmation: ${chalk.green('ccundo undo-turn --yes ' + turn.id)}`);
      console.log(`   • To see all turns: ${chalk.cyan('ccundo turns')}`);
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('group-turns')
  .description('Manually group operations into conversation turns')
  .option('-s, --session <id>', 'Specify session ID')
  .option('--gap <minutes>', 'Time gap in minutes for auto-grouping (default: 5)', '5')
  .option('--clear', 'Clear existing turn groupings first')
  .action(async (options) => {
    try {
      const parser = new ClaudeSessionParser();
      const sessionFile = await parser.getCurrentSessionFile();
      
      if (!sessionFile) {
        console.log(chalk.yellow('No active Claude Code session found.'));
        return;
      }
      
      const operations = await parser.parseSessionFile(sessionFile);
      const turnUndoManager = new TurnUndoManager();
      await turnUndoManager.init();
      
      if (options.clear) {
        console.log(chalk.cyan('Clearing existing turn groupings...'));
        // This would require implementing clearTurns method
      }
      
      console.log(chalk.cyan(`Grouping ${operations.length} operations into conversation turns...`));
      console.log(chalk.gray(`Using ${options.gap} minute gaps between turns.`));
      
      const result = await turnUndoManager.autoGroupOperations(operations, parseInt(options.gap));
      
      console.log(chalk.green(`\\n✅ ${result.message}`));
      console.log(chalk.gray('\\nRun "ccundo turns" to see the grouped turns.'));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

program.parse(process.argv);