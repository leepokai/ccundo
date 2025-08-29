import { UndoManager } from './UndoManager.js';
import { TurnManager } from './TurnManager.js';
import { Turn } from './Turn.js';

/**
 * TurnUndoManager handles undoing entire conversation turns
 */
export class TurnUndoManager {
  constructor() {
    this.undoManager = new UndoManager();
    this.turnManager = new TurnManager();
  }

  async init() {
    await this.undoManager.init();
    await this.turnManager.init();
  }

  /**
   * Undo an entire turn
   * @param {string} turnId - The ID of the turn to undo
   * @param {Array} allOperations - All operations from the session
   * @returns {Object} Result of the undo operation
   */
  async undoTurn(turnId, allOperations) {
    const turn = this.turnManager.getTurn(turnId);
    if (!turn) {
      return {
        success: false,
        message: `Turn ${turnId} not found`
      };
    }

    // Get operations that belong to this turn
    const turnOperations = allOperations.filter(op => 
      turn.operations.includes(op.id)
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Reverse chronological order for undo

    if (turnOperations.length === 0) {
      return {
        success: false,
        message: 'No operations found in this turn'
      };
    }

    console.log(`\n🔄 Undoing turn: ${turn.description}`);
    console.log(`   Operations: ${turnOperations.length}`);
    console.log(`   Time: ${turn.startTime.toLocaleString()}`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    // Undo each operation in reverse order
    for (const operation of turnOperations) {
      try {
        const result = await this.undoManager.undo(operation);
        results.push(result);
        
        if (result.success) {
          successCount++;
          console.log(`   ✅ ${result.message}`);
          if (result.backupPath) {
            console.log(`      Backup: ${result.backupPath}`);
          }
        } else {
          failCount++;
          console.log(`   ❌ ${result.message}`);
        }
      } catch (error) {
        failCount++;
        console.log(`   ❌ Failed to undo ${operation.type}: ${error.message}`);
        results.push({
          success: false,
          message: error.message
        });
      }
    }

    // Remove operations from the turn tracking
    if (successCount > 0) {
      const successfulOpIds = turnOperations
        .filter((_, index) => results[index]?.success)
        .map(op => op.id);
      
      await this.turnManager.removeOperationsFromTurns(successfulOpIds);
    }

    return {
      success: successCount > 0,
      message: `Turn undo completed: ${successCount} successful, ${failCount} failed`,
      successCount,
      failCount,
      results
    };
  }

  /**
   * Get turns with their operations for display
   */
  getTurnsWithOperations(allOperations) {
    const turnGroups = this.turnManager.getOperationsByTurns(allOperations);
    
    return turnGroups.map(group => ({
      turn: group.turn,
      operations: group.operations,
      count: group.operations.length,
      description: group.turn ? group.turn.description : 'Ungrouped operations'
    }));
  }

  /**
   * Get turns available for undo selection (includes UNGROUPED)
   */
  getTurnsForUndoSelection(allOperations) {
    const turnGroups = this.turnManager.getOperationsByTurns(allOperations);
    
    return turnGroups.map(group => {
      let cascadeWarning = '';
      let totalCascadedOps = group.operations.length;
      
      if (group.turn) {
        const cascadeInfo = this.getCascadedTurnsForUndo(group.turn.id, allOperations);
        if (cascadeInfo.turns.length > 1) {
          cascadeWarning = ` ⚠️  +${cascadeInfo.turns.length - 1} future turns`;
          totalCascadedOps = cascadeInfo.operations.length;
        }
      }

      return {
        turn: group.turn,
        operations: group.operations,
        count: group.operations.length,
        totalCascadedOps,
        description: group.turn ? group.turn.description : 'UNGROUPED',
        isUngrouped: !group.turn,
        cascadeWarning
      };
    }).filter(group => group.operations.length > 0); // Only include groups with operations
  }

  /**
   * Group existing operations into turns automatically
   */
  async autoGroupOperations(operations, timeGapMinutes = 5) {
    const timeGapMs = timeGapMinutes * 60 * 1000;
    const turns = await this.turnManager.groupOperationsIntoTurns(operations, timeGapMs);
    
    return {
      success: true,
      message: `Created ${turns.length} turns from ${operations.length} operations`,
      turns: turns.length,
      operations: operations.length
    };
  }

  /**
   * Preview what would be undone for a turn without making changes
   * @param {string} turnId - The ID of the turn to preview
   * @param {Array} allOperations - All operations from the session
   * @returns {Object} Preview information
   */
  async previewTurn(turnId, allOperations) {
    const turn = this.turnManager.getTurn(turnId);
    if (!turn) {
      return {
        success: false,
        message: `Turn ${turnId} not found`
      };
    }

    // Get cascaded operations (including the target turn and future turns)
    const cascadeInfo = this.getCascadedTurnsForUndo(turnId, allOperations);
    const cascadedOperations = cascadeInfo.operations;

    if (cascadedOperations.length === 0) {
      return {
        success: false,
        message: 'No operations found in cascaded turns'
      };
    }

    const { OperationPreview } = await import('./OperationPreview.js');
    const previews = [];

    // Generate preview for each operation
    for (const operation of cascadedOperations) {
      try {
        const preview = await OperationPreview.generatePreview(operation);
        previews.push({
          operation,
          preview: preview.preview,
          canUndo: preview.canUndo || true,
          warning: preview.warning || null
        });
      } catch (error) {
        previews.push({
          operation,
          preview: `Error generating preview: ${error.message}`,
          canUndo: false,
          warning: 'Preview generation failed'
        });
      }
    }

    return {
      success: true,
      turn,
      cascadeInfo,
      operations: cascadedOperations,
      previews,
      summary: {
        totalOperations: cascadedOperations.length,
        cascadedTurns: cascadeInfo.turns.length,
        canUndoCount: previews.filter(p => p.canUndo).length,
        warningCount: previews.filter(p => p.warning).length,
        estimatedDuration: turn.getDuration()
      }
    };
  }

  /**
   * Undo ungrouped operations
   */
  async undoUngroupedOperations(allOperations) {
    // Get operations that aren't assigned to any turn
    const ungroupedOps = allOperations.filter(op => 
      !this.turnManager.getTurnForOperation(op.id)
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Reverse chronological order

    if (ungroupedOps.length === 0) {
      return {
        success: false,
        message: 'No ungrouped operations found'
      };
    }

    console.log(`\n🔄 Undoing ungrouped operations`);
    console.log(`   Operations: ${ungroupedOps.length}`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    // Undo each operation in reverse order
    for (const operation of ungroupedOps) {
      try {
        const result = await this.undoManager.undo(operation);
        results.push(result);
        
        if (result.success) {
          successCount++;
          console.log(`   ✅ ${result.message}`);
          if (result.backupPath) {
            console.log(`      Backup: ${result.backupPath}`);
          }
        } else {
          failCount++;
          console.log(`   ❌ ${result.message}`);
        }
      } catch (error) {
        failCount++;
        console.log(`   ❌ Failed to undo ${operation.type}: ${error.message}`);
        results.push({
          success: false,
          message: error.message
        });
      }
    }

    return {
      success: successCount > 0,
      message: `Ungrouped undo completed: ${successCount} successful, ${failCount} failed`,
      successCount,
      failCount,
      results
    };
  }

  /**
   * Get cascaded turns that need to be undone when undoing a specific turn
   * If undoing turn B in sequence A→B→C, returns [B, C] 
   */
  getCascadedTurnsForUndo(turnId, allOperations) {
    const targetTurn = this.turnManager.getTurn(turnId);
    if (!targetTurn) {
      return { turns: [], operations: [] };
    }

    const allTurns = this.turnManager.getAllTurns();
    
    // Find all turns that come after (have later start time) the target turn
    const cascadedTurns = allTurns.filter(turn => 
      turn.startTime >= targetTurn.startTime
    ).sort((a, b) => b.startTime - a.startTime); // Latest first for undo order

    // Get all operations for these cascaded turns
    const cascadedOperations = [];
    for (const turn of cascadedTurns) {
      const turnOps = allOperations.filter(op => turn.operations.includes(op.id));
      cascadedOperations.push(...turnOps);
    }

    return {
      turns: cascadedTurns,
      operations: cascadedOperations.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )
    };
  }

  /**
   * Undo turn with cascading logic
   */
  async undoTurnWithCascading(turnId, allOperations) {
    const cascadeInfo = this.getCascadedTurnsForUndo(turnId, allOperations);
    
    if (cascadeInfo.turns.length === 0) {
      return {
        success: false,
        message: `Turn ${turnId} not found`
      };
    }

    if (cascadeInfo.operations.length === 0) {
      return {
        success: false,
        message: 'No operations found in cascaded turns'
      };
    }

    const targetTurn = this.turnManager.getTurn(turnId);
    const cascadedTurns = cascadeInfo.turns;

    console.log(`\n🔄 Undoing turn with cascading: ${targetTurn.description}`);
    if (cascadedTurns.length > 1) {
      console.log(`   Cascading ${cascadedTurns.length} turns (including future operations)`);
      cascadedTurns.forEach(turn => {
        console.log(`   - ${turn.description} (${turn.operations.length} ops) - ${turn.startTime.toLocaleString()}`);
      });
    }
    console.log(`   Total operations: ${cascadeInfo.operations.length}`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    // Undo each operation in reverse chronological order
    for (const operation of cascadeInfo.operations) {
      try {
        const result = await this.undoManager.undo(operation);
        results.push(result);
        
        if (result.success) {
          successCount++;
          console.log(`   ✅ ${result.message}`);
          if (result.backupPath) {
            console.log(`      Backup: ${result.backupPath}`);
          }
        } else {
          failCount++;
          console.log(`   ❌ ${result.message}`);
        }
      } catch (error) {
        failCount++;
        console.log(`   ❌ Failed to undo ${operation.type}: ${error.message}`);
        results.push({
          success: false,
          message: error.message
        });
      }
    }

    // Remove successful operations from turn tracking
    if (successCount > 0) {
      const successfulOpIds = cascadeInfo.operations
        .filter((_, index) => results[index]?.success)
        .map(op => op.id);
      
      await this.turnManager.removeOperationsFromTurns(successfulOpIds);
    }

    return {
      success: successCount > 0,
      message: `Cascading undo completed: ${successCount} successful, ${failCount} failed (${cascadedTurns.length} turns affected)`,
      successCount,
      failCount,
      results,
      cascadedTurns: cascadedTurns.length
    };
  }

  /**
   * Create a new turn and assign operations to it
   */
  async createTurnWithOperations(operationIds, description, allOperations) {
    const turn = this.turnManager.createTurn(description);
    
    for (const opId of operationIds) {
      this.turnManager.addOperationToTurn(opId, turn.id);
    }
    
    // If no description provided, generate one
    if (!description) {
      const turnOps = allOperations.filter(op => operationIds.includes(op.id));
      turn.description = Turn.generateDescription(turnOps);
    }
    
    turn.complete();
    await this.turnManager.saveTurns();
    
    return {
      success: true,
      message: `Created turn: ${turn.description}`,
      turnId: turn.id,
      operations: operationIds.length
    };
  }
}