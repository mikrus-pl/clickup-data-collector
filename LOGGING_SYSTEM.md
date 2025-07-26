# Command Execution Logging System

## Overview

The ClickUp Data Collector implements a comprehensive command execution logging system that records detailed information about each command execution. This system helps with debugging, monitoring, and auditing command executions.

## Key Features

1. **Separate Database Connection**: The logging system uses a dedicated database connection to avoid conflicts with the main command execution.
2. **Comprehensive Logging**: Logs command name, arguments, start/end times, status, output, and error messages.
3. **Persistent Storage**: Logs are stored in a separate `CommandLogs` table that persists through data purges.
4. **Independent Management**: Logs can be purged independently using the `purge-logs` command.
5. **Error Handling**: Properly captures and logs both successful completions and failures with stack traces.

## Implementation Details

### CommandLogger Utility

The `CommandLogger` class in `src/utils/commandLogger.js` provides the core logging functionality:

- `start(args)`: Initializes a log entry with command name and arguments
- `logOutput(output, append)`: Records command output (console logs)
- `complete(finalOutput)`: Marks command as successfully completed
- `fail(error)`: Records command failure with error details

### Database Schema

The `CommandLogs` table contains the following fields:

- `log_id`: Primary key
- `command_name`: Name of the command executed
- `command_args`: JSON string of command arguments
- `start_time`: Timestamp when command started
- `end_time`: Timestamp when command ended
- `status`: Execution status ('started', 'completed', 'failed')
- `output`: Console output from the command
- `error_message`: Error details if command failed
- `created_at`: Timestamp when log entry was created
- `updated_at`: Timestamp when log entry was last updated

## Commands with Logging

The following commands have been instrumented with the logging system:

1. `sync-users` - User synchronization
2. `sync-tasks` - Task synchronization
3. `generate-aggregates` - Time aggregate generation
4. `full-sync` - Orchestrates the full synchronization process
5. `user-rate` - User hourly rate management (both set and list subcommands)
6. `purge-data` - Data purging operations
7. `purge-logs` - Log purging operations

### Commands Without Logging

The `setup-db` command does not implement logging because it may run before the database exists, which would prevent the logging system from functioning.

## Usage Examples

### Viewing Logs

To view the current logs in the database:

```bash
sqlite3 ./data/app_data.sqlite3 "SELECT log_id, command_name, status, start_time, end_time FROM CommandLogs ORDER BY log_id;"
```

### Purging Logs

To remove all logs from the system:

```bash
node app.js purge-logs --confirm
```

## Benefits

1. **Debugging**: Easy to trace command execution and identify issues
2. **Monitoring**: Track command execution times and success rates
3. **Auditing**: Maintain a history of all operations performed
4. **Performance Analysis**: Identify slow-running commands
5. **Error Tracking**: Quickly identify and diagnose failed operations

## Future Improvements

1. **Log Rotation**: Implement automatic log rotation to prevent unbounded growth
2. **Real-time Streaming**: Add support for real-time log streaming
3. **Enhanced Filtering**: Add more sophisticated log filtering and search capabilities
4. **Log Levels**: Implement different log levels (info, warn, error) for better organization
5. **Export Functionality**: Add ability to export logs for external analysis
