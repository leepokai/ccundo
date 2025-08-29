import crypto from 'crypto';

/**
 * Turn represents a single question-answer interaction
 * A turn groups multiple operations that belong to one conversation exchange
 */
export class Turn {
  constructor(description = '') {
    this.id = (crypto.randomUUID ? crypto.randomUUID() : `turn_${Date.now()}-${Math.floor(Math.random()*1e9)}`);
    this.timestamp = new Date();
    this.description = description;
    this.operations = []; // Array of operation IDs
    this.startTime = new Date();
    this.endTime = null;
    this.completed = false;
  }

  /**
   * Add an operation to this turn
   */
  addOperation(operationId) {
    if (!this.operations.includes(operationId)) {
      this.operations.push(operationId);
    }
  }

  /**
   * Mark this turn as completed
   */
  complete() {
    this.endTime = new Date();
    this.completed = true;
  }

  /**
   * Get the duration of this turn in milliseconds
   */
  getDuration() {
    if (!this.endTime) return null;
    return this.endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Serialize turn to JSON
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp.toISOString(),
      description: this.description,
      operations: this.operations,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime ? this.endTime.toISOString() : null,
      completed: this.completed
    };
  }

  /**
   * Create Turn from JSON
   */
  static fromJSON(json) {
    const turn = new Turn(json.description);
    turn.id = json.id;
    turn.timestamp = new Date(json.timestamp);
    turn.operations = json.operations || [];
    turn.startTime = new Date(json.startTime);
    turn.endTime = json.endTime ? new Date(json.endTime) : null;
    turn.completed = json.completed || false;
    return turn;
  }

  /**
   * Generate a summary description based on operations
   */
  static generateDescription(operations) {
    if (operations.length === 0) return 'Empty turn';
    
    const operationTypes = operations.map(op => op.type);
    const uniqueTypes = [...new Set(operationTypes)];
    
    if (uniqueTypes.length === 1) {
      const type = uniqueTypes[0];
      const count = operations.length;
      
      switch (type) {
        case 'file_create':
          return count === 1 ? 'Created 1 file' : `Created ${count} files`;
        case 'file_edit':
          return count === 1 ? 'Edited 1 file' : `Edited ${count} files`;
        case 'file_delete':
          return count === 1 ? 'Deleted 1 file' : `Deleted ${count} files`;
        case 'bash_command':
          return count === 1 ? 'Ran 1 command' : `Ran ${count} commands`;
        default:
          return `Performed ${count} ${type} operations`;
      }
    }
    
    // Mixed operations
    const fileOps = operationTypes.filter(t => t.startsWith('file_')).length;
    const bashOps = operationTypes.filter(t => t === 'bash_command').length;
    
    let parts = [];
    if (fileOps > 0) parts.push(`${fileOps} file op${fileOps === 1 ? '' : 's'}`);
    if (bashOps > 0) parts.push(`${bashOps} command${bashOps === 1 ? '' : 's'}`);
    
    return parts.join(' + ');
  }
}