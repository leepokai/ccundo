import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Turn } from './Turn.js';

/**
 * TurnManager handles grouping operations into conversation turns
 */
export class TurnManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.ccundo');
    this.turnsFile = path.join(this.configDir, 'turns.json');
    this.turns = new Map(); // turnId -> Turn
    this.operationToTurn = new Map(); // operationId -> turnId
  }

  async init() {
    await fs.mkdir(this.configDir, { recursive: true });
    await this.loadTurns();
  }

  /**
   * Load turns from file
   */
  async loadTurns() {
    try {
      const data = await fs.readFile(this.turnsFile, 'utf8');
      const turnsData = JSON.parse(data);
      
      for (const turnData of turnsData.turns || []) {
        const turn = Turn.fromJSON(turnData);
        this.turns.set(turn.id, turn);
        
        // Build operation to turn mapping
        for (const opId of turn.operations) {
          this.operationToTurn.set(opId, turn.id);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      this.turns.clear();
      this.operationToTurn.clear();
    }
  }

  /**
   * Save turns to file
   */
  async saveTurns() {
    const turnsData = {
      turns: Array.from(this.turns.values()).map(turn => turn.toJSON())
    };
    
    await fs.writeFile(this.turnsFile, JSON.stringify(turnsData, null, 2), 'utf8');
  }

  /**
   * Create a new turn
   */
  createTurn(description = '') {
    const turn = new Turn(description);
    this.turns.set(turn.id, turn);
    return turn;
  }

  /**
   * Get turn by ID
   */
  getTurn(turnId) {
    return this.turns.get(turnId);
  }

  /**
   * Get all turns
   */
  getAllTurns() {
    return Array.from(this.turns.values()).sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Add operation to a turn
   */
  addOperationToTurn(operationId, turnId) {
    const turn = this.turns.get(turnId);
    if (turn) {
      turn.addOperation(operationId);
      this.operationToTurn.set(operationId, turnId);
    }
  }

  /**
   * Get turn ID for an operation
   */
  getTurnForOperation(operationId) {
    return this.operationToTurn.get(operationId);
  }

  /**
   * Complete a turn
   */
  async completeTurn(turnId) {
    const turn = this.turns.get(turnId);
    if (turn) {
      turn.complete();
      await this.saveTurns();
    }
  }

  /**
   * Group operations into turns based on time gaps
   * Operations with gaps > timeGapMs belong to different turns
   * Only groups UNGROUPED operations, does not modify existing turns
   */
  async groupOperationsIntoTurns(operations, timeGapMs = 60000) { // 60 seconds default
    if (operations.length === 0) return [];

    // Filter to only ungrouped operations
    const ungroupedOps = operations.filter(op => !this.getTurnForOperation(op.id));
    
    if (ungroupedOps.length === 0) return [];

    const sortedOps = [...ungroupedOps].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    const turns = [];
    let currentTurn = null;
    let lastOpTime = null;

    for (const operation of sortedOps) {
      const opTime = new Date(operation.timestamp);
      
      // Check if we need a new turn
      const needNewTurn = !currentTurn || 
        (lastOpTime && (opTime - lastOpTime) > timeGapMs);

      if (needNewTurn) {
        // Complete previous turn
        if (currentTurn) {
          currentTurn.complete();
        }
        
        // Create new turn
        currentTurn = this.createTurn();
        turns.push(currentTurn);
      }

      // Add operation to current turn
      this.addOperationToTurn(operation.id, currentTurn.id);
      lastOpTime = opTime;
    }

    // Complete the last turn
    if (currentTurn) {
      currentTurn.complete();
    }

    // Generate descriptions for turns
    for (const turn of turns) {
      const turnOps = ungroupedOps.filter(op => 
        turn.operations.includes(op.id)
      );
      turn.description = Turn.generateDescription(turnOps);
    }

    await this.saveTurns();
    return turns;
  }

  /**
   * Get operations grouped by turns
   */
  getOperationsByTurns(operations) {
    const turnGroups = new Map();
    
    for (const operation of operations) {
      const turnId = this.getTurnForOperation(operation.id);
      if (turnId) {
        if (!turnGroups.has(turnId)) {
          turnGroups.set(turnId, {
            turn: this.getTurn(turnId),
            operations: []
          });
        }
        turnGroups.get(turnId).operations.push(operation);
      } else {
        // Ungrouped operation
        if (!turnGroups.has('ungrouped')) {
          turnGroups.set('ungrouped', {
            turn: null,
            operations: []
          });
        }
        turnGroups.get('ungrouped').operations.push(operation);
      }
    }

    return Array.from(turnGroups.values())
      .sort((a, b) => {
        const aTime = a.turn ? a.turn.startTime : new Date(0);
        const bTime = b.turn ? b.turn.startTime : new Date(0);
        return bTime - aTime;
      });
  }

  /**
   * Remove operations from turns (used during undo)
   */
  async removeOperationsFromTurns(operationIds) {
    for (const opId of operationIds) {
      const turnId = this.operationToTurn.get(opId);
      if (turnId) {
        const turn = this.turns.get(turnId);
        if (turn) {
          turn.operations = turn.operations.filter(id => id !== opId);
          // If turn has no operations left, remove it
          if (turn.operations.length === 0) {
            this.turns.delete(turnId);
          }
        }
        this.operationToTurn.delete(opId);
      }
    }
    await this.saveTurns();
  }
}