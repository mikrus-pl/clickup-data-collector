const knex = require('knex');
const config = require('../../knexfile');

/**
 * Logs command execution to the CommandLogs table
 */
class CommandLogger {
  constructor(commandName) {
    this.commandName = commandName;
    this.logId = null;
    this.startTime = new Date();
    // Create a separate database connection for logging
    this.logDb = knex(config.development);
  }

  /**
   * Start logging a command execution
   * @param {object} args - Command arguments
   * @returns {Promise<number>} - The log entry ID
   */
  async start(args = {}) {
    try {
      const logEntry = await this.logDb('CommandLogs').insert({
        command_name: this.commandName,
        command_args: JSON.stringify(args),
        start_time: this.startTime,
        status: 'started',
        output: '',
        error_message: null,
      }).returning('log_id');
      
      this.logId = logEntry[0].log_id || logEntry[0];
      return this.logId;
    } catch (error) {
      console.error('Failed to create log entry:', error);
      // Don't throw error as this shouldn't break the command
      return null;
    }
  }

  /**
   * Log command output
   * @param {string} output - Console output to log
   * @param {boolean} append - Whether to append to existing output or replace it
   * @returns {Promise<void>}
   */
  async logOutput(output, append = true) {
    if (!this.logId) return;
    
    try {
      // Truncate output if it's too long to avoid database issues
      const maxOutputLength = 10000;
      let truncatedOutput = output;
      if (output && output.length > maxOutputLength) {
        truncatedOutput = output.substring(0, maxOutputLength) + '... (truncated)';
      }
      
      const updateData = {};
      if (append && this.currentOutput) {
        updateData.output = (this.currentOutput + '\n' + truncatedOutput).substring(0, maxOutputLength);
      } else {
        updateData.output = truncatedOutput;
      }
      
      this.currentOutput = updateData.output;
      
      await this.logDb('CommandLogs').where('log_id', this.logId).update(updateData);
    } catch (error) {
      console.error('Failed to update log output:', error);
      // Don't throw error as this shouldn't break the command
    }
  }

  /**
   * Mark command as completed successfully
   * @param {string} finalOutput - Final output to log
   * @returns {Promise<void>}
   */
  async complete(finalOutput = '') {
    if (!this.logId) return;
    
    try {
      if (finalOutput) {
        await this.logOutput(finalOutput, true);
      }
      
      await this.logDb('CommandLogs').where('log_id', this.logId).update({
        end_time: new Date(),
        status: 'completed',
      });
    } catch (error) {
      console.error('Failed to complete log entry:', error);
      // Don't throw error as this shouldn't break the command
    } finally {
      // Close the logging database connection
      await this.logDb.destroy();
    }
  }

  /**
   * Mark command as failed
   * @param {string|Error} error - Error message or Error object
   * @returns {Promise<void>}
   */
  async fail(error) {
    if (!this.logId) return;
    
    try {
      let errorMessage = '';
      if (error instanceof Error) {
        errorMessage = error.message + '\n' + error.stack;
      } else {
        errorMessage = String(error);
      }
      
      // Truncate error message if it's too long
      const maxErrorLength = 5000;
      if (errorMessage.length > maxErrorLength) {
        errorMessage = errorMessage.substring(0, maxErrorLength) + '... (truncated)';
      }
      
      await this.logDb('CommandLogs').where('log_id', this.logId).update({
        end_time: new Date(),
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
      // Don't throw error as this shouldn't break the command
    } finally {
      // Close the logging database connection
      await this.logDb.destroy();
    }
  }
}

module.exports = CommandLogger;
