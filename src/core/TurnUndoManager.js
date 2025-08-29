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